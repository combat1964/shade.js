(function (ns) {

    var common = require("../../base/common.js"),
        parser = require('esprima'),
        Shade = require("./../../interfaces.js"),
        Types = Shade.TYPES,
        Kinds = Shade.OBJECT_KINDS,
        analyzer = require("../../analyze/analyze.js");
    var walk = require('estraverse');
    var Syntax = walk.Syntax;

    var Template = require("./light-pass-template").LightPassTemplate;
    var ArgStorageType = require("../../resolve/xml3d-glsl-deferred/color-closure-signature.js").ArgStorageType;

    var PRE_TEXTURE_FETCHES = 2,
        POSITION_IS_IN_ARGS = true,
        TEXCOORD_NAME = "texcoord",
        DEFERRED_TEX_PREFIX = "deferred",
        DEFERRED_VALUE_PREFIX = "deferred";

    function getInputArgDeclaration(colorClosureSignature){
        var declarations = [];
        var defaultArgCount = POSITION_IS_IN_ARGS ? 3 : 2;
        for(var i = 0; i < colorClosureSignature.args.length - defaultArgCount; ++i){
            declarations.push({ type: Syntax.VariableDeclarator,
            id: {type: Syntax.Identifier, name: "cc" + colorClosureSignature.id + "Arg" + i},
            init: null});
        }
        return {
            type: Syntax.VariableDeclaration,
            kind: "var",
            declarations: declarations
        };
    }

    function createTexMethodAccess(texId, method){
        return {type: Syntax.CallExpression,
            callee: { type: Syntax.MemberExpression,
                object: {type: Syntax.Identifier, name: DEFERRED_VALUE_PREFIX + texId },
                property: {type: Syntax.Identifier, name: method}},
            arguments: []};
    }

    var FetchResolver = {};
    FetchResolver[ArgStorageType.FLOAT] = function(arg){
        var functionName;
        switch(arg.componentIdx){
            case 0: functionName = "x"; break;
            case 1: functionName = "y"; break;
            case 2: functionName = "z"; break;
            case 3: functionName = "w"; break;
        }
        return createTexMethodAccess(arg.texIdx, functionName);
    }
    FetchResolver[ArgStorageType.FLOAT2] = function(arg){
        var functionName;
        switch(arg.componentIdx){
            case 0: functionName = "xy"; break;
            case 1: functionName = "yz"; break;
            case 2: functionName = "zw"; break;
        }
        return createTexMethodAccess(arg.texIdx, functionName);
    }
    FetchResolver[ArgStorageType.FLOAT3] = function(arg){
        var functionName;
        switch(arg.componentIdx){
            case 0: functionName = "xyz"; break;
            case 1: functionName = "yzw"; break;
        }
        return createTexMethodAccess(arg.texIdx, functionName);
    }
    FetchResolver[ArgStorageType.FLOAT4] = function(arg){
        return createTexMethodAccess(arg.texIdx, "xyzw");
    }

    function addTextureSamples(statements, colorClosureSignature){
        for(var i = PRE_TEXTURE_FETCHES; i < colorClosureSignature.textureCount; ++i){
            statements.push(
            {type: Syntax.ExpressionStatement,
                expression: {type: Syntax.AssignmentExpression, operator: "=",
                    left: { type: Syntax.Identifier, name: DEFERRED_VALUE_PREFIX + i },
                    right: { type: Syntax.CallExpression,
                        callee: {type: Syntax.MemberExpression,
                            object: {type: Syntax.MemberExpression,
                                object: {type: Syntax.Identifier, name: "env"},
                                property: {type: Syntax.Identifier, name: DEFERRED_TEX_PREFIX + i }},
                            property: {type: Syntax.Identifier, name: "sample2D"}},
                        arguments: [{ type: Syntax.Identifier, name: TEXCOORD_NAME }]
                    }
                }
            });
        }
    }
    function addArgumentFetching(statements, colorClosureSignature){
        var id = colorClosureSignature.id;
        var defaultArgCount = POSITION_IS_IN_ARGS ? 3 : 2;
        var args = colorClosureSignature.args;
        for(var i = defaultArgCount; i < args.length; ++i){
            var arg = args[i];
            if(!FetchResolver[arg.storeType])
                throw new Error("StoreType '" + arg.storeType + "' not supported in light pass shader");
            var valueFetchAst = FetchResolver[arg.storeType](arg);
            statements.push({type: Syntax.ExpressionStatement,
                expression: {type: Syntax.AssignmentExpression, operator: "=",
                    left: {type: Syntax.Identifier, name: "cc" + id + "Arg" + (i - defaultArgCount)},
                    right: valueFetchAst
                    }});
        }
    }

    function getColorClosureArgs(id, ccEntry){
        var defaultArgCount = POSITION_IS_IN_ARGS ? 3 : 2;
        var args = [], argIndices = ccEntry.argIndices;
        for(var i = 0; i < argIndices.length; ++i){
            args.push({type: Syntax.Identifier, name: "cc" + id + "Arg" + (argIndices[i] - defaultArgCount)});
        }
        return args;
    }

    function getReturnStatement(colorClosureSignature){

        var returnArgument = { type: Syntax.NewExpression,
            callee: {type: Syntax.Identifier, name: "Shade"},
            arguments: []};
        var ccList = colorClosureSignature.colorClosures;
        for(var i = 0; i < ccList.length; ++i){
            var args = getColorClosureArgs(colorClosureSignature.id, ccList[i]);
            returnArgument = {  type: Syntax.CallExpression,
                                callee: {type: Syntax.MemberExpression,
                                    object: returnArgument,
                                    property: {type: Syntax.Identifier, name: ccList[i].name}},
                                arguments: args};
        }

        return {type: Syntax.ReturnStatement,
            argument: returnArgument};
    }


    function getIfStatement(colorClosureSignature){
        var statements = [];
        statements.push(getInputArgDeclaration(colorClosureSignature));
        addTextureSamples(statements, colorClosureSignature);
        addArgumentFetching(statements, colorClosureSignature);
        statements.push(getReturnStatement(colorClosureSignature));

        return  { type: Syntax.IfStatement,
                    test: {type: Syntax.BinaryExpression, operator: "==",
                        left: {type: Syntax.Identifier, name: "ccId"},
                        right: {type: Syntax.Literal, value: colorClosureSignature.id }
                    },
                    consequent: { type: Syntax.BlockStatement,
                        body: statements},
                    alternate: null
                };
    }

    ns.generateLightPassAst = function(colorClosureSignatures){
        var lightPassAst;
        try{
            lightPassAst = parser.parse(Template.toString(), { raw: true });
        }
        catch(e){
            console.error("Error in parsing of lightPass template", e);
            return null;
        }
        var functionBlock = lightPassAst.body[0].body;
        //functionBlock.body.push(getInputArgDeclaration(colorClosureSignatures));

        var resolvedIfStatements = [];
        for(var i = 0; i < colorClosureSignatures.length; ++i){
            if(resolvedIfStatements.indexOf(colorClosureSignatures[i].id) == -1){
                resolvedIfStatements.push(colorClosureSignatures[i].id);
                functionBlock.body.push(getIfStatement(colorClosureSignatures[i]));
            }
        }

        return lightPassAst;
    }


    ns.generateLightPassAast = function(colorClosureSignatures, inject){
        var ast = ns.generateLightPassAst(colorClosureSignatures);
        if(!ast) return null;

        var opt = {};
        opt.entry = "global.shade";
        opt.validate = true;
        opt.throwOnError = true;
        opt.implementation = "xml3d-glsl-forward";
        opt.inject = inject;
        opt.lightLoopNoSpaceTransform = true;
        opt.lightLoopPositionArg = {type: Syntax.Identifier, name: "position"};
        opt.lightLoopAmbientArg = {type: Syntax.Identifier, name: "ambientIntensity"};
        var resultAast = analyzer.analyze(ast, {}, opt).ast;
        return resultAast;
    }

}(exports));
