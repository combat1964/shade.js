var Shade = require(".."),
    expect = require('should'),
    TYPES = Shade.TYPES,
    KINDS = Shade.OBJECT_KINDS;


var parseAndInferenceExpression = function (str, ctx) {
    var aast = Shade.parseAndInferenceExpression(str, ctx || {});
    return aast;
}

describe('Inference:', function () {
    describe('Variables', function () {
        describe('initialization', function () {

        it("should throw if declared twice", function () {
            var program = parseAndInferenceExpression.bind(null,"var a = 5.0; var a = 4.0;");
            program.should.throw();
        });

        it("is annotated for simple expression", function () {
            var program = parseAndInferenceExpression("var a = 5;");
            var declaration = program.body[0].declarations[0];
            declaration.should.have.property("extra");
            declaration.extra.should.have.property("type", TYPES.INT);
            declaration.extra.should.have.property("constantValue", 5);

            program.should.have.property("scope").property("bindings").property("a");
            var a = program.scope.bindings.a;
            a.should.have.property("initialized", true);
            a.extra.should.have.property("type", TYPES.INT);
            a.extra.should.not.have.property("constantValue");

        });

        it("is annotated for expression", function () {
            var program = parseAndInferenceExpression("var a = 5.0 * (3 + 4);");
            var declaration = program.body[0].declarations[0];
            declaration.should.have.property("extra");
            declaration.extra.should.have.property("type", TYPES.NUMBER);
            declaration.extra.should.have.property("constantValue", 35);

            program.should.have.property("scope").property("bindings").property("a");
            var a = program.scope.bindings.a;
            a.should.have.property("initialized", true);
            a.extra.should.have.property("type", TYPES.NUMBER);
            a.extra.should.not.have.property("constantValue");
        });

        it("is annotated for member expression", function () {
            var program = parseAndInferenceExpression("var a = Math.PI;");
            var exp = program.body[0].declarations[0].init;
            exp.extra.should.have.property("type", TYPES.NUMBER);
            exp.extra.should.have.property("constantValue", Math.PI);

            program.should.have.property("scope").property("bindings").property("a");
            var a = program.scope.bindings.a;
            a.should.have.property("initialized", true);
            a.extra.should.have.property("type", TYPES.NUMBER);
            a.extra.should.not.have.property("constantValue");
        });


        it("for multiple variables", function () {
            var program = parseAndInferenceExpression("var a = b = c = 5.0;");
            var declaration = program.body[0].declarations[0];
            declaration.should.have.property("extra");
            declaration.extra.should.have.property("type", TYPES.NUMBER);
            declaration.extra.should.have.property("constantValue", 5);

            program.should.have.property("scope").property("bindings").property("a");
            var variable = program.scope.bindings.a;
            variable.should.have.property("initialized", true);
            variable.extra.should.have.property("type", TYPES.NUMBER);
            variable.extra.should.not.have.property("constantValue");
            program.should.have.property("scope").property("bindings").property("b");
            variable = program.scope.bindings.b;
            variable.should.have.property("initialized", true);
            variable.extra.should.have.property("type", TYPES.NUMBER);
            variable.extra.should.not.have.property("constantValue");
            program.should.have.property("scope").property("bindings").property("c");
            variable = program.scope.bindings.c;
            variable.should.have.property("initialized", true);
            variable.extra.should.have.property("type", TYPES.NUMBER);
            variable.extra.should.not.have.property("constantValue");
        });

        it("throws if already defined in same context", function () {
            var program = parseAndInferenceExpression.bind(null,"var a = 5.0; var a = 4.0;");
            program.should.throw();
        });

    });

    describe('reassignment', function () {

        it("of same type is okay", function () {
            var program = parseAndInferenceExpression("var a = 5; a = 3;");
            var declaration = program.body[0].declarations[0];
            declaration.should.have.property("extra");
            declaration.extra.should.have.property("type", TYPES.INT);
            declaration.extra.should.have.property("constantValue", 5);

            var exp = program.body[1].expression;
            exp.should.have.property("extra");
            exp.extra.should.have.property("type", TYPES.INT);
            exp.extra.should.have.property("constantValue", 3);

            program.should.have.property("scope").property("bindings").property("a");
            var a = program.scope.bindings.a;
            a.should.have.property("initialized", true);
            a.extra.should.have.property("type", TYPES.INT);
            a.extra.should.not.have.property("constantValue");
        });

        it("of uninitialized variable is okay", function () {
            var program = parseAndInferenceExpression("var a; a = 3;");
            //program.body[0].should.have.property("type", "EmptyStatement");
            var exp = program.body[0].declarations[0];
            exp.should.have.property("extra");
            exp.extra.should.have.property("type", TYPES.INT);
            exp.extra.should.not.have.property("constantValue", 3);

            var exp = program.body[1].expression;
            exp.should.have.property("extra");
            exp.extra.should.have.property("type", TYPES.INT);
            exp.extra.should.have.property("constantValue", 3);
        });

        it("with change of type throws", function () {
            var exp = parseAndInferenceExpression.bind(null, "var a = true; a = 3;");
            exp.should.throw();
        });


    });

    describe('Use variable in', function () {
        it("UnaryExpression", function () {
            var program = parseAndInferenceExpression("var a = 5; -a;");
            var exp = program.body[1].expression;
            exp.extra.should.have.property("type", TYPES.INT);
            exp.extra.should.not.have.property("constantValue");
        });
        it("UnaryExpression: typeof", function () {
            var program = parseAndInferenceExpression("var a = 5; typeof a;");
            var exp = program.body[1].expression;
            exp.extra.should.have.property("type", TYPES.STRING);
            exp.extra.should.have.property("constantValue", "number");
        });
        it("BinaryExpression", function () {
            var program = parseAndInferenceExpression("var a = 5; 2-a;");
            var exp = program.body[1].expression;
            exp.extra.should.have.property("type", TYPES.INT);
            exp.extra.should.not.have.property("constantValue");
        });
        it("CallExpression", function () {
            var program = parseAndInferenceExpression("var a = Math.PI; Math.cos(a);");
            var init = program.body[0].declarations[0].init;
            init.extra.should.have.property("type", TYPES.NUMBER);
            init.extra.should.have.property("constantValue", Math.PI);

            program.should.have.property("scope").property("bindings").property("a");
            var a = program.scope.bindings.a;
            a.should.have.property("initialized", true);
            a.extra.should.have.property("type", TYPES.NUMBER);
            a.extra.should.not.have.property("constantValue");

            var exp = program.body[1].expression;
            exp.extra.should.have.property("type", TYPES.NUMBER);
            exp.extra.should.not.have.property("constantValue");
        });

        it("ConditionalExpression", function () {
            var program = parseAndInferenceExpression("var test = true, cond = 2.0, alt = 1.0; test ? cond : alt");
            var init = program.body[0].declarations[0].init;
            init.extra.should.have.property("type", TYPES.BOOLEAN);
            init.extra.should.have.property("constantValue", true);

            program.should.have.property("scope").property("bindings").property("cond");
            var cond = program.scope.bindings.cond;
            cond.should.have.property("initialized", true);
            cond.extra.should.have.property("type", TYPES.NUMBER);
            cond.extra.should.not.have.property("constantValue");

            var exp = program.body[1].expression;
            exp.extra.should.have.property("type", TYPES.NUMBER);
            exp.extra.should.not.have.property("constantValue");
        });

        it("Custom expression", function () {
            var program = parseAndInferenceExpression("var a = 1, b = 0.5; new Vec3(a, 0, b);");
            var newExpression = program.body[1].expression;

            newExpression.extra.should.have.property("type", TYPES.OBJECT);
            newExpression.extra.should.have.property("kind", "Vec3");
        });

        it("Update expression (pre)", function () {
            var program = parseAndInferenceExpression("var a = 1, b, c; b = ++a; c = a", {propagateConstants: true});
            var expression = program.body[1].expression;

            expression.extra.should.have.property("type", TYPES.INT);
            expression.extra.should.have.property("constantValue", 2);

            var expression = program.body[2].expression;

            expression.extra.should.have.property("type", TYPES.INT);
            expression.extra.should.have.property("constantValue", 2);
        });

        it("Update expression (post)", function () {
            var program = parseAndInferenceExpression("var a = 1, b, c; b = a++; c = a;", {propagateConstants: true});
            var expression = program.body[1].expression;

            expression.extra.should.have.property("type", TYPES.INT);
            expression.extra.should.have.property("constantValue", 1);

            var expression = program.body[2].expression;
            expression.extra.should.have.property("type", TYPES.INT);
            expression.extra.should.have.property("constantValue", 2);

        });

    });
    });


});
