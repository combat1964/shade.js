(function (ns) {
    /**
     * Shade.js specific type inference that is also inferring
     * virtual types {@link Shade.TYPES }
     */

    var walk = require('estraverse'),
        enterExpression = require('./infer_expression.js').enterExpression,
        exitExpression = require('./infer_expression.js').exitExpression,
        enterStatement = require('./infer_statement.js').enterStatement,
        exitStatement = require('./infer_statement.js').exitStatement,

        // Objects
        ObjectRegistry = require("./registry/index.js").Registry,
        Context = require("./../../base/context.js").getContext(ObjectRegistry),
        Base = require("../../base/index.js"),
        Kinds = require("../../interfaces.js").OBJECT_KINDS;


    var Syntax = walk.Syntax;




    var registerGlobalContext = function (program) {
        var ctx = new Context(program, null, {name: "global"});
        ctx.registerObject("Math", ObjectRegistry.getByName("Math"));
        ctx.registerObject("Color", ObjectRegistry.getByName("Color"));
        ctx.registerObject("Vec2", ObjectRegistry.getByName("Vec2"));
        ctx.registerObject("Vec3", ObjectRegistry.getByName("Vec3"));
        ctx.registerObject("Shade", ObjectRegistry.getByName("Shade"));
        ctx.registerObject("this", ObjectRegistry.getByName("System"));
        return ctx;
    }

    var TypeInference = function (root, opt) {
        opt = opt || {};
        this.root = root;
        this.context = [];
        this.injections = opt.injections || {};
        this.entryPoint = opt.entry || "global.shade";
        this.pushContext(registerGlobalContext(root));
        this.root.injections = this.injections;

    }

    Base.extend(TypeInference.prototype, {
        pushContext: function(context) {
            this.context.push(context);
            var injection = this.injections[context.str()];
            if (injection) {
                context.injectParameters(injection);
            }
        },
        popContext: function() {
            this.context.pop();
        },
        peekContext: function() {
            return this.context[this.context.length-1];
        },
        createContext: function(node, parent, opt) {
            return new Context(node, parent, opt);
        },

        traverse: function (node) {
            //variables && variables.env && (variables.env.global = true);

            walk.traverse(node, {
                enter: this.enterNode.bind(this),
                leave: this.exitNode.bind(this)
            });
            return node;
        },

        enterNode : function (node, parent) {
            var context = this.context[this.context.length-1];
            return this.switchKind(node, parent, context, enterStatement, enterExpression);
        },

        exitNode : function (node, parent) {
            var context = this.context[this.context.length-1];
            return this.switchKind(node, parent, context, exitStatement, exitExpression);
        },

        switchKind : function (node, parent, ctx, statement, expression) {
        switch (node.type) {
            case Syntax.BlockStatement:
            case Syntax.BreakStatement:
            case Syntax.CatchClause:
            case Syntax.ContinueStatement:
            case Syntax.DirectiveStatement:
            case Syntax.DoWhileStatement:
            case Syntax.DebuggerStatement:
            case Syntax.EmptyStatement:
            case Syntax.ExpressionStatement:
            case Syntax.ForStatement:
            case Syntax.ForInStatement:
            case Syntax.FunctionDeclaration:
            case Syntax.IfStatement:
            case Syntax.LabeledStatement:
            case Syntax.Program:
            case Syntax.ReturnStatement:
            case Syntax.SwitchStatement:
            case Syntax.SwitchCase:
            case Syntax.ThrowStatement:
            case Syntax.TryStatement:
            case Syntax.VariableDeclaration:
            case Syntax.VariableDeclarator:
            case Syntax.WhileStatement:
            case Syntax.WithStatement:
                return statement.call(this, node, parent, ctx);

            case Syntax.AssignmentExpression:
            case Syntax.ArrayExpression:
            case Syntax.ArrayPattern:
            case Syntax.BinaryExpression:
            case Syntax.CallExpression:
            case Syntax.ConditionalExpression:
            case Syntax.FunctionExpression:
            case Syntax.Identifier:
            case Syntax.Literal:
            case Syntax.LogicalExpression:
            case Syntax.MemberExpression:
            case Syntax.NewExpression:
            case Syntax.ObjectExpression:
            case Syntax.ObjectPattern:
            case Syntax.Property:
            case Syntax.SequenceExpression:
            case Syntax.ThisExpression:
            case Syntax.UnaryExpression:
            case Syntax.UpdateExpression:
            case Syntax.YieldExpression:
                return expression.call(this, node, parent, ctx);

            default:
                throw new Error('Unknown node type: ' + node.type);
        }
    }
    });


    ns.infer = function (ast, opt) {
        var ti = new TypeInference(ast, opt);
        return ti.traverse(ti.root);
    };


}(exports));
