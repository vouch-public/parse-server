"use strict";

var _node = require("parse/node");
var _lodash = _interopRequireDefault(require("lodash"));
var _intersect = _interopRequireDefault(require("intersect"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _logger = _interopRequireDefault(require("../logger"));
var _Utils = _interopRequireDefault(require("../Utils"));
var SchemaController = _interopRequireWildcard(require("./SchemaController"));
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and
  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}
function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query);
  //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and
  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
}

// Transforms a REST API formatted ACL object to our two-field mongo format.
const transformObjectACL = _ref => {
  let {
      ACL
    } = _ref,
    result = _objectWithoutProperties(_ref, ["ACL"]);
  if (!ACL) {
    return result;
  }
  result._wperm = [];
  result._rperm = [];
  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }
    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }
  return result;
};
const specialQueryKeys = ['$and', '$or', '$nor', '_rperm', '_wperm'];
const specialMasterQueryKeys = [...specialQueryKeys, '_email_verify_token', '_perishable_token', '_tombstone', '_email_verify_token_expires_at', '_failed_login_count', '_account_lockout_expires_at', '_password_changed_at', '_password_history'];
const validateQuery = (query, isMaster, update) => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }
  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(value => validateQuery(value, isMaster, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }
  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(value => validateQuery(value, isMaster, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }
  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(value => validateQuery(value, isMaster, update));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }
  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }
    if (!key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/) && (!specialQueryKeys.includes(key) && !isMaster && !update || update && isMaster && !specialMasterQueryKeys.includes(key))) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
};

// Filters out any data that shouldn't be on this REST-formatted object.
const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id;

  // replace protectedFields when using pointer-permissions
  const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : {};
  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;
    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false;

      // check if the object grants the current user access based on the extracted fields
      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];
        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }
        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      });

      // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C
      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      }
      // intersect all sets of protectedFields
      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }
  const isUserClass = className === '_User';

  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */
  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]);

    // fields not requested by client (excluded),
    //but were needed to apply protecttedFields
    perms.protectedFields && perms.protectedFields.temporaryKeys && perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }
  if (isUserClass) {
    object.password = object._hashed_password;
    delete object._hashed_password;
    delete object.sessionToken;
  }
  if (isMaster) {
    return object;
  }
  for (const key in object) {
    if (key.charAt(0) === '_') {
      delete object[key];
    }
  }
  if (!isUserClass) {
    return object;
  }
  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }
  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];
const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};
function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}
const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].amount;
          break;
        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = object[key].objects;
          break;
        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }
          object[key] = [];
          break;
        case 'Delete':
          delete object[key];
          break;
        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};
const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;
      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
};
// Transforms a Database format ACL to a REST API format ACL
const untransformObjectACL = _ref2 => {
  let {
      _rperm,
      _wperm
    } = _ref2,
    output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);
  if (_rperm || _wperm) {
    output.ACL = {};
    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });
    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }
  return output;
};

/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */
const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};
const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};
const maybeTransformUsernameAndEmailToLowerCase = (object, className, options) => {
  if (className === '_User' && options.forceEmailAndUsernameToLowerCase) {
    const toLowerCaseFields = ['email', 'username'];
    toLowerCaseFields.forEach(key => {
      if (typeof object[key] === 'string') {
        object[key] = object[key].toLowerCase();
      }
    });
  }
};
class DatabaseController {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {};
    // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.
    this.schemaPromise = null;
    this._transactionalSession = null;
    this.options = options;
  }
  collectionExists(className) {
    return this.adapter.classExists(className);
  }
  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }
  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }
    return Promise.resolve();
  }

  // Returns a promise for a schemaController.
  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }
    this.schemaPromise = SchemaController.load(this.adapter, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }
  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  }

  // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface
  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);
      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }
      return className;
    });
  }

  // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.
  validateObject(className, object, query, runOptions) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;
      if (isMaster) {
        return Promise.resolve();
      }
      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }
  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update;
    // Make a copy of the object, so we don't mutate the incoming data.
    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
        }
        if (!query) {
          return Promise.resolve();
        }
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, true);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }
          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
            const rootFieldName = getRootFieldName(fieldName);
            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });
          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }
          update = transformObjectACL(update);
          maybeTransformUsernameAndEmailToLowerCase(update, className, this.options);
          transformAuthData(className, update, schema);
          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }
              return {};
            });
          }
          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        if (validateOnly) {
          return result;
        }
        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }
        return this._sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  }

  // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.
  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;
    var process = (op, key) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }
      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }
      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };
    for (const key in update) {
      process(update[key], key);
    }
    for (const key of deleteMe) {
      delete update[key];
    }
    return ops;
  }

  // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed
  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }
      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }
      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  }

  // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.
  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  }

  // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.
  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }
      throw error;
    });
  }

  // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.
  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);
          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        }
        // delete by query
        if (acl) {
          query = addWriteACL(query, acl);
        }
        validateQuery(query, isMaster, false);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }
          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }
          throw error;
        });
      });
    });
  }

  // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.
  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    maybeTransformUsernameAndEmailToLowerCase(object, className, this.options);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);
        if (validateOnly) {
          return {};
        }
        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }
        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return this._sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }
  canAddField(schema, className, object, aclGroup, runOptions) {
    const classSchema = schema.schemaData[className];
    if (!classSchema) {
      return Promise.resolve();
    }
    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }
      return schemaFields.indexOf(getRootFieldName(field)) < 0;
    });
    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }
    return Promise.resolve();
  }

  // Won't delete collections in the system namespace
  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */
  deleteEverything(fast = false) {
    this.schemaPromise = null;
    _SchemaCache.default.clear();
    return this.adapter.deleteAllClasses(fast);
  }

  // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.
  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};
    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  }

  // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.
  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  }

  // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated
  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    const promises = [];
    if (query['$or']) {
      const ors = query['$or'];
      promises.push(...ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      }));
    }
    if (query['$and']) {
      const ands = query['$and'];
      promises.push(...ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
        });
      }));
    }
    const otherKeys = Object.keys(query).map(key => {
      if (key === '$and' || key === '$or') {
        return;
      }
      const t = schema.getExpectedType(className, key);
      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }
      let queries = null;
      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;
          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }
          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      }

      // remove the current queryKey as we don,t need it anymore
      delete query[key];
      // execute each query independently to build the list of
      // $in / $nin
      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }
        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }
          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all([...promises, ...otherKeys]).then(() => {
      return Promise.resolve(query);
    });
  }

  // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated
  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }
    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }
    var relatedTo = query['$relatedTo'];
    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }
  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null;

    // -disable-next
    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];
    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    }

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }
    query.objectId['$in'] = idsIntersection;
    return query;
  }
  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null);

    // make a set and spread to remove duplicates
    allIds = [...new Set(allIds)];

    // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.
    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }
    query.objectId['$nin'] = allIds;
    return query;
  }

  // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  caseInsensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.
  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    hint,
    caseInsensitive = false,
    explain
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find');
    // Count operation if counting
    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }
        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }
        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }
        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          hint,
          caseInsensitive: this.options.disableCaseInsensitivity ? false : caseInsensitive,
          explain
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }
          const rootFieldName = getRootFieldName(fieldName);
          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
          if (!schema.fields[fieldName.split('.')[0]] && fieldName !== 'score') {
            delete sort[fieldName];
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;
          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
              based on pointer-permissions are determined after querying. The filtering can
              overwrite the protected fields. */
            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
          }
          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }
          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }
          validateQuery(query, isMaster, false);
          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }
  deleteSchema(className) {
    let schemaController;
    return this.loadSchema({
      clearCache: true
    }).then(s => {
      schemaController = s;
      return schemaController.getOneSchema(className, true);
    }).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }
        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            _SchemaCache.default.del(className);
            return schemaController.reloadData();
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json
  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  }

  // Naive logic reducer for OR operations meant to be used only for pointer permissions.
  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }
    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$or.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
      delete query.$or;
    }
    return query;
  }

  // Naive logic reducer for AND operations meant to be used only for pointer permissions.
  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }
    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;
    do {
      repeat = false;
      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;
          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);
    if (query.$and.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
      delete query.$and;
    }
    return query;
  }

  // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)
  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }
    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];
    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }
    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    }
    // the ACL should have exactly 1 user
    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }
      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;
        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        }
        // if we already have a constraint on the key, use the $and
        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        }
        // otherwise just add the constaint
        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
    } else {
      return query;
    }
  }
  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null;

    // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'
    const preserveKeys = queryOptions.keys;

    // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)
    const serverOnlyKeys = [];
    const authenticated = auth.user;

    // map to allow check without array search
    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {});

    // array of sets of protected fields. separate item for each applicable criteria
    const protectedKeysSets = [];
    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);
          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName);
            // 2. preserve it delete later
            serverOnlyKeys.push(fieldName);
          }
        }
        continue;
      }

      // add public tier
      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }
      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }
        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    }

    // check if there's a rule for current user's id
    if (authenticated) {
      const userId = auth.user.id;
      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    }

    // preserve fields to be removed before sending response to client
    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }
    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }
      return acc;
    }, []);

    // intersect all sets of protectedFields
    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }
  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }
  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }
    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }
  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }
    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.
  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);
      throw error;
    });
    if (!this.options.disableCaseInsensitivity) {
      await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive username index: ', error);
        throw error;
      });
      await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
        _logger.default.warn('Unable to create case insensitive email index: ', error);
        throw error;
      });
    }
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);
      throw error;
    });
    await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);
      throw error;
    });
    const isMongoAdapter = this.adapter instanceof _MongoStorageAdapter.default;
    const isPostgresAdapter = this.adapter instanceof _PostgresStorageAdapter.default;
    if (isMongoAdapter || isPostgresAdapter) {
      let options = {};
      if (isMongoAdapter) {
        options = {
          ttl: 0
        };
      } else if (isPostgresAdapter) {
        options = this.idempotencyOptions;
        options.setIdempotencyFunction = true;
      }
      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, options).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);
        throw error;
      });
    }
    await this.adapter.updateSchemaWithIndexes();
  }
  _expandResultOnKeyPath(object, key, value) {
    if (key.indexOf('.') < 0) {
      object[key] = value[key];
      return object;
    }
    const path = key.split('.');
    const firstKey = path[0];
    const nextPath = path.slice(1).join('.');

    // Scan request data for denied keywords
    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          [firstKey]: true,
          [nextPath]: true
        }, keyword.key, true);
        if (match) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
        }
      }
    }
    object[firstKey] = this._expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
    delete object[key];
    return object;
  }
  _sanitizeDatabaseResult(originalObject, result) {
    const response = {};
    if (!result) {
      return Promise.resolve(response);
    }
    Object.keys(originalObject).forEach(key => {
      const keyUpdate = originalObject[key];
      // determine if that was an op
      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }
}
module.exports = DatabaseController;
// Expose validateQuery for tests
module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeUtleXMiLCJzcGVjaWFsTWFzdGVyUXVlcnlLZXlzIiwidmFsaWRhdGVRdWVyeSIsImlzTWFzdGVyIiwidXBkYXRlIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJ2YWx1ZSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwiT2JqZWN0Iiwia2V5cyIsImtleSIsIiRyZWdleCIsIiRvcHRpb25zIiwibWF0Y2giLCJpbmNsdWRlcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiYWNsR3JvdXAiLCJhdXRoIiwib3BlcmF0aW9uIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwicHJvdGVjdGVkRmllbGRzIiwib2JqZWN0IiwidXNlcklkIiwidXNlciIsImlkIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpc1JlYWRPcGVyYXRpb24iLCJpbmRleE9mIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwibmV3UHJvdGVjdGVkRmllbGRzIiwib3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMiLCJwb2ludGVyUGVybSIsInBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyIiwicmVhZFVzZXJGaWVsZFZhbHVlIiwiaXNBcnJheSIsInNvbWUiLCJvYmplY3RJZCIsImZpZWxkcyIsInYiLCJpc1VzZXJDbGFzcyIsImsiLCJ0ZW1wb3JhcnlLZXlzIiwicGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwic2Vzc2lvblRva2VuIiwiY2hhckF0IiwiYXV0aERhdGEiLCJzcGVjaWFsS2V5c0ZvclVwZGF0ZSIsImlzU3BlY2lhbFVwZGF0ZUtleSIsImpvaW5UYWJsZU5hbWUiLCJmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlIiwiX19vcCIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJzcGxpdCIsInJlbGF0aW9uU2NoZW1hIiwicmVsYXRlZElkIiwib3duaW5nSWQiLCJtYXliZVRyYW5zZm9ybVVzZXJuYW1lQW5kRW1haWxUb0xvd2VyQ2FzZSIsIm9wdGlvbnMiLCJmb3JjZUVtYWlsQW5kVXNlcm5hbWVUb0xvd2VyQ2FzZSIsInRvTG93ZXJDYXNlRmllbGRzIiwidG9Mb3dlckNhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwicHJvbWlzZXMiLCJvcnMiLCJhUXVlcnkiLCJpbmRleCIsImFuZHMiLCJvdGhlcktleXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJkaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJVdGlscyIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5S2V5cyA9IFsnJGFuZCcsICckb3InLCAnJG5vcicsICdfcnBlcm0nLCAnX3dwZXJtJ107XG5jb25zdCBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzID0gW1xuICAuLi5zcGVjaWFsUXVlcnlLZXlzLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfdG9tYnN0b25lJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnksIGlzTWFzdGVyOiBib29sZWFuLCB1cGRhdGU6IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKFxuICAgICAgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSAmJlxuICAgICAgKCghc3BlY2lhbFF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpICYmICFpc01hc3RlciAmJiAhdXBkYXRlKSB8fFxuICAgICAgICAodXBkYXRlICYmIGlzTWFzdGVyICYmICFzcGVjaWFsTWFzdGVyUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkpKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSkgOiB7fTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKGlzVXNlckNsYXNzKSB7XG4gICAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5LmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmZvcmNlRW1haWxBbmRVc2VybmFtZVRvTG93ZXJDYXNlKSB7XG4gICAgY29uc3QgdG9Mb3dlckNhc2VGaWVsZHMgPSBbJ2VtYWlsJywgJ3VzZXJuYW1lJ107XG4gICAgdG9Mb3dlckNhc2VGaWVsZHMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIHRydWUpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5vcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4uYW5kcy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5WyckYW5kJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvdGhlcktleXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG9yJykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoWy4uLnByb21pc2VzLCAuLi5vdGhlcktleXNdKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBxdWVyeU9wdGlvbnM6IGFueSk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkgPyBmYWxzZSA6IGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWUuc3BsaXQoJy4nKVswXV0gJiYgZmllbGROYW1lICE9PSAnc2NvcmUnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICdnZXQnKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5KSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXSwibWFwcGluZ3MiOiI7O0FBS0E7QUFFQTtBQUVBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUF3RDtBQUFBO0FBQUE7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