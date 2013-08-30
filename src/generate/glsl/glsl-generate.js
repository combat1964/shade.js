(function (ns) {

    var FunctionAnnotation = require("./../../base/annotation.js").FunctionAnnotation;
    var Shade = require("./../../interfaces.js");
    var walk = require('estraverse'),
        Syntax = walk.Syntax,
        VisitorOption = walk.VisitorOption,
        ANNO = require("../../base/annotation.js").ANNO;

    var Types = Shade.TYPES,
        Kinds = Shade.OBJECT_KINDS,
        Sources = Shade.SOURCES;

    var InternalFunctions = {
        "MatCol" : function(name, details){
            var matType = details.matType,
                colType = details.colType;
            return [matType + " " + name + "(" + matType + " mat, int idx, " + colType + " value){",
                  "  " + matType + " result = " + matType + "(mat);",
                  "  result[idx] = value;",
                  "  return result;",
                  "}"];
        }
    }



    /**
     * @param {object} opt
     */
    var getHeader = function (opt) {
        if (opt.omitHeader == true)
            return [];
        var header = [
            "// Generated by shade.js"
        ];
        var floatPrecision = opt.floatPrecision || "mediump";
        header.push("precision " + floatPrecision + " float;");
        return header;
    }

    var toGLSLType = function (info, allowUndefined) {
        switch (info.type) {
            case Types.OBJECT:
                switch (info.kind) {
                    case Kinds.FLOAT4:
                        return "vec4";
                    case Kinds.FLOAT3:
                        return "vec3";
                    case Kinds.FLOAT2:
                        return "vec2";
                    case Kinds.TEXTURE:
                        return "sampler2D";
                    case Kinds.MATRIX3:
                        return "mat3";
                    case Kinds.MATRIX3:
                        return "mat4";
                    default:
                        return "<undefined>";
                }
            case Types.ARRAY:
                return toGLSLType(info.elements);

            case Types.UNDEFINED:
                if (allowUndefined)
                    return "void";
                throw new Error("Could not determine type");
            case Types.NUMBER:
                return "float";
            case Types.BOOLEAN:
                return "bool";
            case Types.INT:
                return "int";
            case Types.BOOLEAN:
                return "bool";
            default:
                throw new Error("toGLSLType: Unhandled type: " + info.type);

        }
    }

    var toGLSLSource = function(info) {
        if (!info.source)
            return "";
        if (info.source == Sources.VERTEX)
            return "varying";
        if (info.source == Sources.UNIFORM)
            return "uniform";
        if (info.source == Sources.CONSTANT)
            return "const";
        throw new Error("toGLSLSource: Unhandled type: " + info.source);
    }

    function createLineStack() {
        var arr = [];
        arr.push.apply(arr, arguments);
        var indent = "";
        arr.appendLine = function(line){
            this.push(indent + line);
        };
        arr.changeIndention = function(add){
            while(add > 0){
                indent += "    "; add--;
            }
            if(add < 0){
                indent = indent.substr(0, indent.length + add*4);
            }
        };
        arr.append = function(str){
            this[this.length-1] = this[this.length-1] + str;
        };
        return arr;
    };


    /*Base.extend(LineStack.prototype, {

    });*/

    var generate = function (ast, opt) {

        opt = opt || {};

        var lines = createLineStack();

        traverse(ast, lines, opt);

        return lines.join("\n");
    }

    function appendInternalFunctions(lines, internalFunctions){
        if(!internalFunctions) return;
        for(var key in internalFunctions){
            var entry = internalFunctions[key];
            if(InternalFunctions[entry.type]){
                var linesToAdd = InternalFunctions[entry.type](entry.name, entry.details);
                lines.push.apply(lines, linesToAdd);
            }
            else{
                throw Error("Internal: InlineFunction of type '" + entry.type + "' not available!");
            }
        }
    }

    function traverse(ast, lines, opt) {
        var insideMain = false;


        walk.traverse(ast, {
                enter: function (node) {
                    try {
                        var type = node.type;
                        switch (type) {

                            case Syntax.Program:
                                getHeader(opt).forEach(function (e) {
                                    lines.push(e)
                                });
                                appendInternalFunctions(lines, ANNO(ast).getUserData().internalFunctions);
                                break;


                            case Syntax.FunctionDeclaration:
                                var func = new FunctionAnnotation(node);
                                var methodStart = [toGLSLType(func.getReturnInfo(), true)];
                                methodStart.push(node.id.name, '(');
                                if(node.id.name == "main")
                                    insideMain = true;

                                if (!(node.params && node.params.length)) {
                                    methodStart.push("void");
                                } else {
                                    var methodArgs = [];
                                    node.params.forEach(function (param) {
                                        methodArgs.push(toGLSLType(param.extra)+ " " + param.name);
                                    })
                                    methodStart.push(methodArgs.join(", "));
                                }
                                methodStart.push(') {');
                                lines.appendLine(methodStart.join(" "));
                                lines.changeIndention(1);
                                return;


                            case Syntax.ReturnStatement:
                                var hasArguments = node.argument;
                                lines.appendLine("return " + (hasArguments ? handleExpression(node.argument) : "") + ";");
                                return;

                            case Syntax.VariableDeclarator :
                                // console.log("Meep!");
                                var source = !insideMain ? toGLSLSource(node.extra) : null;
                                var line = source ? source + " " : "";
                                line += toGLSLType(node.extra) + " " + node.id.name;
                                if (node.extra.elements) {
                                    line += "[" + (node.extra.staticSize ? node.extra.staticSize : "0") + "]";
                                }
                                if (node.init) line += " = " + handleExpression(node.init);
                                lines.appendLine(line + ";");
                                return;

                            case Syntax.AssignmentExpression:
                                lines.appendLine(handleExpression(node) + ";")
                                return;

                            case Syntax.ExpressionStatement:
                                lines.appendLine(handleExpression(node.expression) + ";");
                                return VisitorOption.Skip;

                            case Syntax.IfStatement:
                                lines.appendLine("if(" + handleExpression(node.test) + ") {");

                                lines.changeIndention(1);
                                traverse(node.consequent, lines, opt);
                                lines.changeIndention(-1);

                                if (node.alternate) {
                                    lines.appendLine("} else {");
                                    lines.changeIndention(1);
                                    traverse(node.alternate, lines, opt);
                                    lines.changeIndention(-1);
                                }
                                lines.appendLine("}");
                                return VisitorOption.Skip;

                            case Syntax.ForStatement:
                                lines.appendLine("for (" + handleInlineDeclaration(node.init) + "; " + handleExpression(node.test) +"; " + handleExpression(node.update) + ") {");
                                lines.changeIndention(1);
                                traverse(node.body, lines, opt);
                                lines.changeIndention(-1);
                                lines.appendLine("}");
                                return VisitorOption.Skip;

                            case Syntax.ContinueStatement:
                                lines.appendLine("continue;");


                            default:
                            //console.log("Unhandled: " + type);

                        }
                    } catch (e) {
                        Shade.throwError(node, e.message);
                    }
                },
                leave: function (node) {
                    var type = node.type;
                    switch (type) {
                        case Syntax.Program:
                            break;
                        case Syntax.FunctionDeclaration:
                            lines.changeIndention(-1);
                            lines.appendLine("}");
                            break;
                    }
                }
            }
        );
    }

    var generateFloat = function(value) {
        if(isNaN(value))
            throw Error("Internal: Expression generated NaN!");
        var result = '' + value;
        if (result.indexOf(".") == -1) {
            result += ".0";
        }
        return result;
    }

    /**
     *
     * @param node
     * @returns {string}
     */
    var handleExpression = function(node) {
        var result = "<unhandled: " + node.type+ ">";
        switch(node.type) {
            case Syntax.NewExpression:
                result = toGLSLType(node.extra);
                result += handleArguments(node.arguments);
                break;

            case Syntax.Literal:
                var value = node.extra.staticValue !== undefined ? node.extra.staticValue : node.value;
                if (node.extra.type == Types.NUMBER)
                    result = generateFloat(value);
                else
                    result = value;
                break;


            case Syntax.Identifier:
                result = node.name;
                break;

            case Syntax.BinaryExpression:
            case Syntax.LogicalExpression:
            case Syntax.AssignmentExpression:
                result = handleBinaryArgument(node.left);
                result += " " + node.operator + " ";
                result += handleBinaryArgument(node.right);
                break;
            case Syntax.UnaryExpression:
                result = node.operator;
                result += handleBinaryArgument(node.argument);
                break;

            case Syntax.CallExpression:
                result = handleExpression(node.callee);
                result += handleArguments(node.arguments);
                break;

            case Syntax.MemberExpression:
                result = handleBinaryArgument(node.object);
                result += node.computed ? "[" : ".";
                result += handleExpression(node.property);
                node.computed && (result += "]");
                break;

            case Syntax.ConditionalExpression:
                result = handleExpression(node.test);
                result += " ? ";
                result += handleExpression(node.consequent);
                result += " : ";
                result += handleExpression(node.alternate);
                break;

            case Syntax.UpdateExpression:
                result = "";
                if (node.isPrefix) {
                    result += node.operator;
                }
                result += handleExpression(node.argument);
                if (!node.isPrefix) {
                    result += node.operator;
                }
            default:
                //console.log("Unhandled: " , node.type);
        }
        return result;
    }


    function handleInlineDeclaration(node) {
        if (node.type != Syntax.VariableDeclaration)
            Shade.throwError(node, "Internal error in GLSL::handleInlineDeclaration");
        var result = node.declarations.reduce(function(declString, declaration){
            var decl = toGLSLType(declaration.extra) + " " + declaration.id.name;
            if (declaration.init) {
                decl += " = " + handleExpression(declaration.init);
            }
            return declString + decl;
        }, "");
        return result;
    }

    function handleBinaryArgument(node){
        var result = handleExpression(node);
        switch(node.type) {
            case Syntax.BinaryExpression:
            case Syntax.LogicalExpression:
            case Syntax.AssignmentExpression: result = "( " + result + " )"; break;
        }
        return result;
    }

    function handleArguments(container) {
        var result = "(";
        container.forEach(function (arg, index) {
            result += handleExpression(arg);
            if (index < container.length - 1) {
                result += ", ";
            }
        });
        return result + ")";
    }


    exports.generate = generate;


}(exports));
