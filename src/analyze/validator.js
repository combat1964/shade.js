(function (ns) {

    var common = require("./../base/common.js"),
        Shade = require("../interfaces.js"),
        estraverse = require('estraverse');

    // var codegen = require('escodegen');

    var Syntax = common.Syntax,
        TYPES = Shade.TYPES,
        ANNO = common.ANNO;

    var leaveNode = function(node) {
		var annotation = ANNO(node), right;
		if(!annotation.isValid()) {
            var errorInfo = annotation.getError();
            console.log(errorInfo)
            var error = new Error(errorInfo.message);
            error.loc = errorInfo.loc;
            throw error;
        }

        if(node.type == Syntax.VariableDeclarator) {
            if(node.init) {
                right = ANNO(node.init);
                annotation.copyFrom(right);
            }

            if (annotation.getType() == TYPES.ANY || annotation.isNullOrUndefined()) {
                Shade.throwError(node, "No type could be calculated for ")
            }
        }
        if(node.type == Syntax.AssignmentExpression) {
            right = ANNO(node.right);
            annotation.copyFrom(right);
            annotation.clearUniformDependencies();

            if (annotation.getType() == TYPES.ANY || annotation.isNullOrUndefined()) {
                Shade.throwError(node, "No type could be calculated for ")
            }
        } else if(node.type == Syntax.ExpressionStatement) {
            var exp = ANNO(node.expression);
            annotation.copyFrom(exp);
        }


    };

    /**
     * Validates AST: Tests if the non-eliminated nodes
     * are all valid and have type information
     * @param {Object} ast
     * @returns Object
     */
    var validate = ns.validate = function (ast) {
        return estraverse.replace(ast, {
            leave: leaveNode
        });
    }


}(exports));
