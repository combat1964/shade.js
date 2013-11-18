(function (ns) {

    // dependencies
    var assert = require('assert');
    var esgraph = require('esgraph');
    var worklist = require('analyses');
    var common = require("../../base/common.js");
    var Base = require("../../base/index.js");
    var codegen = require('escodegen');
    var annotateRight = require("./infer_expression.js").annotateRight;
    var InferenceScope = require("./registry/").InferenceScope;
    var System = require("./registry/system.js");
    var Annotations = require("./../../base/annotation.js");
    var walk = require('estraverse');

    // shortcuts
    var Syntax = common.Syntax;
    var Map = common.Map;
    //var Set = worklist.Set;
    var FunctionAnnotation = Annotations.FunctionAnnotation;
    var ANNO = Annotations.ANNO;


    function createGlobalScope(ast) {
        var globalScope = new InferenceScope(ast, null, {name: "global"});
        globalScope.registerGlobals();
        return globalScope;
    };

    function registerSystemInformation(scope, opt) {
        var thisInfo = (opt.inject && opt.inject.this) || null;
        scope.declareVariable("this");
        scope.updateTypeInfo("this", System.getThisTypeInfo(thisInfo));
    }


    function inferBody(ast, context) {


        var cfg = esgraph(ast, { omitExceptions: true });

        //console.log("infer body", cfg)

        worklist(cfg,
            /**
             * @param {Set} input
             * @this {FlowNode}
             * @returns {*}
             */
                function (input) {
                if (!this.astNode || this.type) // Start and end node do not influence the result
                    return input;

                // Local
                if (!this.analyzed) {
                    //console.log("Analyze", codegen.generate(this.astNode), this.astNode.type);
                    var anno = ANNO(this.astNode);
                    anno.clearError();

                    try {
                        context.analyze(this.astNode);
                    } catch(e) {
                        //console.log(e);
                        anno.setError(e);
                    }
                    this.analyzed = true;
                }
                return input;
            }
            , {
                direction: 'forward'
            });
        return ast;
    }


    /**
     *
     * @param {Array.<Object>} params
     * @param {Array.<Object>} types
     */
    function setParameterTypes(params, types) {
        for (var i = 0; i < params.length; i++) {
            var funcParam = ANNO(params[i]);
            if (i < types.length) {
                funcParam.setFromExtra(types[i].getExtra());
                funcParam.setDynamicValue();
            }
        }
    }

    /**
     *
     * @param ast
     * @param {Function} analysis
     * @param {*} opt
     * @constructor
     */
    var AnalysisContext = function (ast, analysis, opt) {
        opt = opt || {};

        /**
         * The root of the program to analyze
         * @type {*}
         */
        this.root = ast;
        this.root.globalParameters = {};

        /**
         * Callback that continues analysis in the same context
         * @see {AnalysisContext.analyze}
         * @type {Function}
         */
        this.analysis = analysis;

        /**
         * @type {Array.<Scope>}
         */
        this.scopeStack = opt.scope ? [opt.scope] : [ new Scope(ast) ];

        /**
         * Map of (global) function name to untyped functions that
         * serve as a template for calls that might come with
         * different signatures
         * @type {Map}
         */
        this.availableFunctions = this.extractAllFunctions(ast);

        var callNumber = 0;
        this.getCallNumber = function() {
            return callNumber++;
        }
        /**
         * Cache of functions that types has already been derived.
         * Maps from signature to annotated ast
         * @type {Map}
         */
        this.derivedFunctions = new Map();

        // We monitor if we are in a declaration, otherwise we can't decide between
        // multiple declaration
        var inDeclaration = false;
        this.inDeclaration = function () {
            return inDeclaration;
        };

        this.setInDeclaration = function (v) {
            inDeclaration = v;
        }


    };

    AnalysisContext.prototype = {
        getTypeInfo: function (node) {
            return common.getTypeInfo(node, this.getScope());
        },
        analyze: function (node) {
            if (this.analysis) {
                this.analysis.apply(this, arguments);
            }
        },
        getScope: function () {
            return this.scopeStack[this.scopeStack.length - 1];
        },
        pushScope: function (scope) {
            return this.scopeStack.push(scope);
        },
        popScope: function () {
            return this.scopeStack.pop();
        },
        getFunctionInformationFor: function (name, args, opt) {
            var signature = this.createSignatureFromNameAndArguments(name, args);
            var info = this.getFunctionInformationBySignature(signature);
            if (info)
                return info;

            return this.createFunctionInformationFor(name, args, opt);
        },
        createSignatureFromNameAndArguments: function (name, args) {
            return args.reduce(function (str, arg) {
                return str + arg.getTypeString()
            }, name);
        },
        getFunctionInformationBySignature: function (signature) {
            if (this.derivedFunctions.has(signature)) {
                var derivedFunction = this.derivedFunctions.get(signature);
                //console.log("Reuse", signature);
                return derivedFunction.info;
            }
            return null;
        },
        createFunctionInformationFor: function (name, args, opt) {
            opt = opt || {};
            if (this.availableFunctions.has(name)) {
                var ast = this.availableFunctions.get(name);

                var derived = {};
                derived.order = this.getCallNumber();
                derived.ast = this.inferFunction(JSON.parse(JSON.stringify(ast)), args);
                derived.info = derived.ast.extra.returnInfo;
                derived.info.newName = opt.name || name.replace(/\./g, '_') + derived.order;
                derived.ast.id.name = derived.info.newName;
                this.derivedFunctions.set(this.createSignatureFromNameAndArguments(name, args), derived);
                return derived.info;
            }
            throw new Error("Could not resolve function " + name);
        },
        /**
         *
         * @param prg
         * @returns {Map}
         */
        extractAllFunctions: function (prg) {
            var result = new Map();

            result.set("global", prg);
            var context = this;

            walk.replace(prg, {
                enter: function (node) {
                    if (node.type == Syntax.FunctionDeclaration) {
                        var localName = node.id.name;
                        var parentScope = context.getScope();
                        var anno = new FunctionAnnotation(node);
                        parentScope.declareVariable(localName);
                        parentScope.updateTypeInfo(localName, anno);

                        var newScope = new InferenceScope(node, parentScope, {name: localName });
                        result.set(newScope.str(), node);
                        context.pushScope(newScope);
                    }
                },
                leave: function (node) {
                    var result;
                    if (node.type == Syntax.FunctionDeclaration) {
                        context.popScope();
                        result = { type: Syntax.EmptyStatement };
                    }
                    return result;
                }
            });
            prg.body = prg.body.filter(function (a) {
                return a.type != Syntax.EmptyStatement;
            });
            return result;
        },
        inferFunction: function (funcDecl, params) {
            var functionScope = new InferenceScope(funcDecl, this.getScope(), {name: funcDecl.id.name });
            var functionAnnotation = new FunctionAnnotation(funcDecl);

            //console.log("inferFunction", functionScope.str());

            setParameterTypes(funcDecl.params, params);
            functionScope.declareParameters(funcDecl.params);

            this.pushScope(functionScope);
            funcDecl.body = inferBody(funcDecl.body, this);

            // Annotate Function Return type from Scope
            functionAnnotation.setReturnInfo(functionScope.getReturnInfo());
            this.popScope();
            return funcDecl;
        },
        handleInjections: function (opt, ast) {
            var entry = opt.entry;
            if (entry && this.availableFunctions.has(entry)) {
                var entryParams = (opt.inject && opt.inject[entry]) || [];

                // First parameter is set as global _env object to be accessible form BRDFs
                // This is a big hack, need better injection mechanism
                var envObject = entryParams[0];
                if (envObject && envObject.extra) {
                    var envAnnotation = new Annotations.Annotation({}, envObject.extra);
                    this.getScope().updateTypeInfo("_env", envAnnotation);
                }

                this.root.globalParameters[entry] = entryParams;
                this.getFunctionInformationFor(entry, entryParams.map(function (param) {
                    return ANNO(param);
                }), { name: "shade"});
            }
        }, /**
         * @param {*} ast
         * @param {*} opt
         * @returns {*}
         */
        inferProgram: function (ast, opt) {
            opt = opt || {};
            ast = inferBody(ast, this);
            this.handleInjections(opt, ast);
            return ast;
        }

    };


    function transformProgram(program) {
        return walk.replace(program, {
            enter: function(node) {
                var annotation = ANNO(node);
                if(annotation.hasError()) {
                    throw annotation.getError();
                }

                if(node.type == Syntax.IfStatement) {
                    var test = ANNO(node.test);

                    if (test.hasStaticValue() || test.canObject()) {
                        this.skip();
                        var staticValue = test.getStaticTruthValue();
                        if (staticValue === true) {
                            return transformProgram(node.consequent);
                        }
                        if (staticValue === false) {
                            if (node.alternate) {
                                return transformProgram(node.alternate);
                            }
                            return {
                                type: Syntax.EmptyStatement
                            }
                        }
                    }
                }

                if(annotation.canEliminate()) {
                    this.skip();
                    return { type: Syntax.EmptyStatement, extra: { eliminate: true } };
                }

            }
        })

    }




    var inferProgram = function (ast, opt) {
        var globalScope = createGlobalScope(ast);
        registerSystemInformation(globalScope, opt);
        var context = new AnalysisContext(ast, annotateRight, { scope: globalScope });
        var result = context.inferProgram(ast, opt);

        // (Re-)add derived function to the program
        result.body = result.body.concat(context.derivedFunctions.values().sort(function(a,b) { return b.order - a.order; }).map(function(derived) {return derived.ast}));

        result = transformProgram(result);

        return result;
    };

    ns.infer = inferProgram;

}(exports));
