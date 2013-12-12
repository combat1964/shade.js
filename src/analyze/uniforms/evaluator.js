(function (ns) {

    // Dependencies
    var traverse = require('estraverse'),
        common = require("./../../base/common.js"),
        Shade = require("../../interfaces.js"),
        codegen = require('escodegen'),
        Set = require('analyses').Set;


    // Shortcuts
    var Syntax = traverse.Syntax, ANNO = common.ANNO;

    function toMap(uniformSet) {
        var result = {};
        uniformSet && uniformSet.forEach(function(entry) {
            result[entry.name] = entry.dependencies;
        });
        return result;
    }

    var allowedMemberCalls = ["Math", "Shade"];

    ns.generateUniformExpressions = function (ast, input) {

        var uniformVariables = toMap(input);

        traverse.traverse(ast, {
            leave: function (node, parent) {
                var result = ANNO(node);
                result.clearUniformDependencies();

                switch (node.type) {

                    // New uniforms can come via the env object
                    case Syntax.MemberExpression:
                        var propertyAnnotation = ANNO(node.property);
                        if (propertyAnnotation.getSource() == Shade.SOURCES.UNIFORM) {
                            result.setUniformDependencies(node.property.name);
                        }
                        break;

                    case Syntax.Identifier:
                        // Not a variable
                        if(~[Syntax.MemberExpression, Syntax.FunctionDeclaration,Syntax.VariableDeclarator].indexOf(parent.type))
                            return;

                        if(parent.type == Syntax.NewExpression && parent.callee == node)
                            return;

                        // Not a variable on the right side
                        if(parent.type == Syntax.AssignmentExpression && parent.left == node)
                            return;

                        if(uniformVariables.hasOwnProperty(node.name)) {
                            result.setUniformDependencies(uniformVariables[node.name]);
                        }

                        break;
                    case Syntax.BinaryExpression:
                         var left = ANNO(node.left),
                             right = ANNO(node.right);

                        if (left.canUniformExpression() && right.canUniformExpression()) {
                            result.setUniformDependencies(left.getUniformDependencies(), right.getUniformDependencies());
                        }
                        break;
                    case Syntax.UnaryExpression:
                        var argument = ANNO(node.argument);

                        if(argument.isUniformExpression()) {
                            result.setUniformDependencies(argument.getUniformDependencies())
                        }
                        break;
                    case Syntax.CallExpression:
                        if(node.callee.type == Syntax.MemberExpression) {
                            var object = node.callee.object;
                            if(object.name && ~allowedMemberCalls.indexOf(object.name)) {
                                var dependencies = mergeUniformDependencies(node.arguments);
                                if(dependencies) {
                                    result.setUniformDependencies(dependencies);
                                }
                            }
                        }
                        break;
                    case Syntax.NewExpression:
                        if(node.callee.type == Syntax.Identifier) {
                            var dependencies = mergeUniformDependencies(node.arguments);
                            if(dependencies) {
                                result.setUniformDependencies(dependencies);
                            }
                        }
                        break;

                }
            }
        });

        var result = new Set();
        switch (ast.type) {
            case Syntax.AssignmentExpression:
                var right = ANNO(ast.right);
                if (right.isUniformExpression()) {
                    result.add({ name: ast.left.name, dependencies: right.getUniformDependencies() });
                }
                break;
            case Syntax.VariableDeclaration:
                ast.declarations.forEach(function (declaration) {
                    if (declaration.init) {
                        var init = ANNO(declaration.init);
                        if (init.isUniformExpression()) {
                            result.add({ name: declaration.id.name, dependencies: init.getUniformDependencies() });
                        }
                    }
                });
                break;
        }
        return result;
    }
    
    
    function atLeastOneArgumentIsUniform(args) {
        var allUniformOrStatic = true,
            oneUniform = false;

        for(var i = 0; i < args.length && allUniformOrStatic; i++) {
            var thisUniform = args[i].isUniformExpression();
            allUniformOrStatic = allUniformOrStatic && (thisUniform || args[i].hasStaticValue());
            oneUniform = oneUniform || thisUniform;
        }
        return allUniformOrStatic && oneUniform;
    };

    function mergeUniformDependencies(args) {
        var uniformDependencies = null;
        args = args.map(function(arg) { return ANNO(arg);});

        if(atLeastOneArgumentIsUniform(args)) {
            uniformDependencies = []
            for(var i = 0; i< args.length;i++) {
                if (args[i].isUniformExpression())        {
                    uniformDependencies = uniformDependencies.concat(args[i].getUniformDependencies());
                }
            }
        }
        return uniformDependencies;
    };

}(exports));
