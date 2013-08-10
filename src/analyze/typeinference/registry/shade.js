(function(ns){

    var Shade = require("../../../interfaces.js"),
        TYPES = Shade.TYPES,
        KINDS = Shade.OBJECT_KINDS,
        Base = require("../../../base/index.js"),
        Annotation = require("../../../base/annotation.js").Annotation;

    var ShadeObject = {
        diffuse: {
            type: TYPES.OBJECT,
            kind: KINDS.COLOR_CLOSURE,
            evaluate: function(result, args, ctx) {
                if (args.length < 1)
                    throw new Error("Shade.diffuse expects at least 1 parameter.")
                var normal = args[0];
                if(!(normal && normal.canNormal())) {
                    throw new Error("First argument of Shade.diffuse must evaluate to a normal");
                }
                if (args.length > 1) {
                    var color = args[1];
                    //console.log("Color: ", color.str(), color.getType(ctx));
                    if(!color.canColor()) {
                        throw new Error("Second argument of Shade.diffuse must evaluate to a color. Found: " + color.str());
                    }
                }
            }
        },
        phong: {
            type: TYPES.OBJECT,
            kind: KINDS.COLOR_CLOSURE,
            evaluate: function(result, args, ctx) {
                if (args.length < 1)
                    throw new Error("Shade.phong expects at least 1 parameter.")
                var normal = args[0];
                if(!(normal && normal.canNormal())) {
                    throw new Error("First argument of Shade.phong must evaluate to a normal");
                }
                if (args.length > 1) {
                    var shininess = args[1];
                    //console.log("Color: ", color.str(), color.getType(ctx));
                    if(!shininess.canNumber()) {
                        throw new Error("Second argument of Shade.phong must evaluate to a number. Found: " + color.str());
                    }
                }
            }
        }
    };

    var ShadeInstance = {
        multiply: {
            type: TYPES.OBJECT,
            kind: KINDS.COLOR_CLOSURE,
            evaluate: function() {

            }
        },
        add: {
            type: TYPES.OBJECT,
            kind: KINDS.COLOR_CLOSURE,
            evaluate: function() {

            }
        }
    };

    Base.extend(ns, {
        id: "Shade",
        kind:  KINDS.COLOR_CLOSURE,
        object: {
            constructor: null,
            static: ShadeObject
        },
        instance: ShadeInstance
    });

}(exports));
