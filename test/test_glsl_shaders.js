var esprima = require('esprima');
var Shade = require("..");
var fs = require('fs');
var should = require('should');
var GLSLCompiler = require("../src/generate/glsl/compiler").GLSLCompiler;



function createTest(dir, file) {
    var filename = dir + file;
    var contents = fs.readFileSync(filename, 'utf8');
    var ast = esprima.parse(contents, {comment: true, range: true, raw: true});
    var comments = ast.comments;
    delete ast.comments;

    var ctx = filename.replace(/\.[^/.]+$/, "") + "-context.json";
    var contextData = {};
    if (fs.existsSync(ctx)) {
        contextData = JSON.parse(fs.readFileSync(ctx, "utf-8"));
    }


    it(comments[0].value.trim() + ' (' + file + ')', function () {
        if(contextData.this && contextData.this.properties && contextData.this.properties.hasOwnProperty("fwidth")) {
            Shade.getSystem().setDerivatives(true);
        } else {
            Shade.getSystem().setDerivatives(false);
        }
        var options = {inject: contextData, entry: "global.shade", propagateConstants: true, validate: true, sanitize: false, extractUniformExpressions: true};
        var aast = Shade.parseAndInferenceExpression(ast, options);
        var result = new GLSLCompiler().compileFragmentShader(aast, {useStatic: true, omitHeader: true, uniformExpressions: options.uniformExpressions});
        var actual = result.source.trim();
        var expected = comments[1].value.trim();
        expected = expected.replace(/\r\n/g,"\n");
        //console.log(actual);
        expected.should.eql(actual);
    });
}

describe('GLSL Shader Code:', function () {
    var dir = __dirname + '/data/shaders/glsl/';
    var files = fs.readdirSync(dir);
    files = files.filter(function(filename) { return filename.split('.').pop() == "js" });
    files.forEach(function (file) {
        createTest(dir, file);
    });
    //createTest(dir, files[10]);
});
