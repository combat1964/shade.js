(function(ns){

    var Base = require("./index.js"),
        Shade = require("../interfaces.js"),
        TYPES = Shade.TYPES,
        Annotation = require("./annotation.js").Annotation,
        TypeInfo = require("./typeinfo.js").TypeInfo,
        Syntax = require('estraverse').Syntax;

    ns.getContext = function(registry) {

    /**
     *
     * @param binding
     * @extends TypeInfo
     * @constructor
     */
    var Binding = function(binding, registery) {
        TypeInfo.call(this, binding);
        if(this.node.ref) {
            if (!registery[this.node.ref])
                throw Error("No object has been registered for: " + this.node.ref);
            this.globalObject = registery[this.node.ref].object;
            if (this.globalObject) {
                this.setType(TYPES.OBJECT);
            }
        }
    };


    Base.createClass(Binding, TypeInfo, {
        hasConstructor: function() {
            return !!this.getConstructor();
        },
        getConstructor: function() {
            return this.globalObject && this.globalObject.constructor;
        },
        isInitialized: function() {
            return this.node.initialized;
        },
        setInitialized: function(v) {
            this.node.initialized = v;
        },
        hasStaticValue: function() {
            return false;
        },
        isGlobal: function() {
            return this.node.info && this.node.info._global || TypeInfo.prototype.isGlobal.call(this);
        },
        getType: function() {
            return this.globalObject? TYPES.OBJECT : TypeInfo.prototype.getType.call(this);
        },
        getObjectInfo: function() {
            if (this.globalObject)
                return this.globalObject.static;
            if (this.isObject()) {
                return this.node.info || registry.getInstanceForKind(this.getKind());
            }
            return null;
        },
        getInfoForSignature: function(signature) {
            var extra = this.getExtra();
            if(!extra.signatures)
                return null;
            return extra.signatures[signature];
        },
        setInfoForSignature: function(signature, info) {
            var extra = this.getExtra();
            if(!extra.signatures)
                extra.signatures = {};
            return extra.signatures[signature] = info;
        }


    })


    /**
     * @param {Context|null} parent
     * @param opt
     * @constructor
     */
    var Context = function(node, parent, opt) {
        opt = opt || {};

        /** @type (Context|null) */
        this.parent = parent || opt.parent || null;
        this.registery = parent ? parent.registery : {};

        this.context = node.context = node.context || {};

        /** @type {Object.<string, {initialized: boolean, annotation: Annotation}>} */
        this.context.bindings = this.context.bindings || {};
        if(opt.bindings) {
            Base.extend(this.context.bindings, opt.bindings);
        }

        this.context.name = opt.name || node.name || "<anonymous>";

    };

    Base.extend(Context.prototype, {

        getName: function() {
            return this.context.name;
        },

        getBindings: function() {
            return this.context.bindings;
        },

        updateReturnInfo: function(annotation) {
            this.context.returnInfo = annotation.getExtra();
        },
        getReturnInfo: function() {
            return this.context.returnInfo;
        },

        /**
         * @param {string} name
         * @returns {*}
         */
        getBindingByName: function(name) {
            var bindings = this.getBindings();
            var binding = bindings[name];
            if(binding !== undefined)
                return new Binding(binding, this.registery);
            if (this.parent)
                return this.parent.getBindingByName(name);
            return undefined;
        },

        /**
         * @param {string} name
         * @returns {Context|null}
         */
        getContextForName: function(name) {
            var bindings = this.getBindings();
            if(bindings[name] !== undefined)
                return this;
            if (this.parent)
                return this.parent.getContextForName(name);
            return null;
        },

        getVariableIdentifier: function(name) {
            var context = this.getContextForName(name);
            if(!context)
                return null;
            return context.str() + "." + name;
        },

        declareVariable: function(name, fail, position) {
            var bindings = this.getBindings();
            fail = (fail == undefined) ? true : fail;
            if (bindings[name]) {
                if (fail) {
                    throw new Error(name + " was already declared in this scope.")
                } else {
                    return false;
                }
            }

            var init = {
                initialized : false,
                initPosition: position,
                extra: {
                    type: TYPES.UNDEFINED
                }
            };
            bindings[name] = init;
            return true;
        },

        /**
         *
         * @param {string} name
         * @param {TypeInfo} typeInfo
         */
        updateExpression: function (name, typeInfo) {
            var v = this.getBindingByName(name);
            if (!v) {
                throw new Error("Variable was not declared in this scope: " + name);
            }
            if (v.isInitialized() && v.getType() !== typeInfo.getType()) {
                throw new Error("Variable may not change it's type: " + name);
            }
            if (!v.isInitialized()) {
                // Annotate the declaration, if one is given
                if(v.node.initPosition)
                    v.node.initPosition.copy(typeInfo);
            }

            v.copy(typeInfo);
            v.setDynamicValue();
            v.setInitialized(!typeInfo.isUndefined());
        },

        registerObject: function(name, obj) {
            this.registery[obj.id] = obj;
            var bindings = this.getBindings();
            bindings[name] = {
                extra: {
                    type: TYPES.OBJECT
                },
                ref: obj.id
            };
        },

        declareParameters: function(params) {
            var bindings = this.getBindings();
            this.params = [];
            for(var i = 0; i < params.length; i++) {
                var parameter = params[i];
                this.params[i] = parameter.name;
                bindings[parameter.name] = { type: TYPES.UNDEFINED };
            }
        },

        /**
         *
         * @param {Array.<TypeInfo>} <params
         */
        injectParameters: function(params) {
            for(var i = 0; i< params.length; i++) {
                if (i == this.params.length)
                    break;
                var name = this.params[i];
                var bindings = this.getBindings();
                bindings[name] = { extra: {} };
                Base.deepExtend(bindings[name].extra, params[i].getExtra());
                if (params[i].getNodeInfo()) {
                    bindings[name].info = {};
                    Base.deepExtend(bindings[name].info, params[i].getNodeInfo());
                }
            }
        },

        str: function() {
            var ctx = this;
            var names = [];
            while(ctx) {
                names.unshift(ctx.getName());
                ctx = ctx.parent;
            }
            return names.join(".");
        },

        getAllBindings: function() {
            var result = Object.keys(this.getBindings());
            if (this.parent) {
                var parentBindings = this.parent.getAllBindings();
                for(var i = 0; i < parentBindings.length; i++) {
                    if (result.indexOf(parentBindings[i]) !== -1) {
                        result.push(parentBindings[i]);
                    }
                }
            }
            return result;
        },

        /**
         *
         * @param node
         * @returns {TypeInfo}
         */
        createTypeInfo: function (node) {
            var result = new Annotation(node);
            if (result.getType() !== TYPES.ANY) {
                return result;
            }

            if (node.type == Syntax.Identifier) {
                var name = node.name;
                var binding = this.getBindingByName(name);
                if (!binding) {
                    Shade.throwError(node, "ReferenceError: " + name + " is not defined");
                }
                return binding;
            }
            return result;
        },

        getObjectInfoFor: function(obj) {
            if (!obj.isObject())
                return null;

            /* The TypeInfo might know about it's object type */
            if (obj.getObjectInfo) {
                return obj.getObjectInfo();
            };

            var nodeInfo = obj.getNodeInfo();
            if (nodeInfo) {
                console.error("Found NodeInfo");
                return nodeInfo;
            }
            return registry.getInstanceForKind(obj.getKind())
        }

    });


        return Context;

    };



}(exports));
