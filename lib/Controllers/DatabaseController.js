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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


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
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

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
      let overrideProtectedFields = false; // check if the object grants the current user access based on the extracted fields

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
      }); // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C

      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      } // intersect all sets of protectedFields


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
    protectedFields && protectedFields.forEach(k => delete object[k]); // fields not requested by client (excluded),
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
}; // Runs an update on the database.
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
}; // Transforms a Database format ACL to a REST API format ACL


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
    this.idempotencyOptions = this.options.idempotencyOptions || {}; // Prevent mutable this.schema, otherwise one request could use
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
  } // Returns a promise for a schemaController.


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
  } // Returns a promise for the classname that is related to the given
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
  } // Uses the schema to validate the object (REST API format).
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
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

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
  } // Collect all relation-updating operations from a REST-format update.
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
  } // Processes relation-updating operations from a REST-format update.
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
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  } // Removes a relation.
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
  } // Removes objects matches this query from the database.
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
        } // delete by query


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
  } // Inserts an object into the database.
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
  } // Won't delete collections in the system namespace

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
  } // Returns a promise for a list of related ids given an owning id.
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
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
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
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
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
  } // Modifies query so that it no longer has $relatedTo
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
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


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
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

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
  } // Runs a query on the database.
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
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

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
  } // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json


  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  } // Naive logic reducer for OR operations meant to be used only for pointer permissions.


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
  } // Naive logic reducer for AND operations meant to be used only for pointer permissions.


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
  } // Constraints query using CLP's pointer permissions (PP) if any.
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
    } // the ACL should have exactly 1 user


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
        } // if we already have a constraint on the key, use the $and


        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        } // otherwise just add the constaint


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
    if (aclGroup.indexOf(query.objectId) > -1) return null; // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'

    const preserveKeys = queryOptions.keys; // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)

    const serverOnlyKeys = [];
    const authenticated = auth.user; // map to allow check without array search

    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {}); // array of sets of protected fields. separate item for each applicable criteria

    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);

          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName); // 2. preserve it delete later

            serverOnlyKeys.push(fieldName);
          }
        }

        continue;
      } // add public tier


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
    } // check if there's a rule for current user's id


    if (authenticated) {
      const userId = auth.user.id;

      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    } // preserve fields to be removed before sending response to client


    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }

      return acc;
    }, []); // intersect all sets of protectedFields

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
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
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
    const nextPath = path.slice(1).join('.'); // Scan request data for denied keywords

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
      const keyUpdate = originalObject[key]; // determine if that was an op

      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlLZXlzIiwic3BlY2lhbE1hc3RlclF1ZXJ5S2V5cyIsInZhbGlkYXRlUXVlcnkiLCJpc01hc3RlciIsInVwZGF0ZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiJG9yIiwiQXJyYXkiLCJmb3JFYWNoIiwidmFsdWUiLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCJrZXkiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiaW5jbHVkZXMiLCJJTlZBTElEX0tFWV9OQU1FIiwiZmlsdGVyU2Vuc2l0aXZlRGF0YSIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwiaW5kZXhPZiIsInByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtIiwiZmlsdGVyIiwic3RhcnRzV2l0aCIsIm1hcCIsInN1YnN0cmluZyIsIm5ld1Byb3RlY3RlZEZpZWxkcyIsIm92ZXJyaWRlUHJvdGVjdGVkRmllbGRzIiwicG9pbnRlclBlcm0iLCJwb2ludGVyUGVybUluY2x1ZGVzVXNlciIsInJlYWRVc2VyRmllbGRWYWx1ZSIsImlzQXJyYXkiLCJzb21lIiwib2JqZWN0SWQiLCJmaWVsZHMiLCJ2IiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsImNoYXJBdCIsImF1dGhEYXRhIiwic3BlY2lhbEtleXNGb3JVcGRhdGUiLCJpc1NwZWNpYWxVcGRhdGVLZXkiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsIl9fb3AiLCJhbW91bnQiLCJJTlZBTElEX0pTT04iLCJvYmplY3RzIiwiQ09NTUFORF9VTkFWQUlMQUJMRSIsInRyYW5zZm9ybUF1dGhEYXRhIiwicHJvdmlkZXIiLCJwcm92aWRlckRhdGEiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidW50cmFuc2Zvcm1PYmplY3RBQ0wiLCJvdXRwdXQiLCJnZXRSb290RmllbGROYW1lIiwic3BsaXQiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwibWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UiLCJvcHRpb25zIiwiZm9yY2VFbWFpbEFuZFVzZXJuYW1lVG9Mb3dlckNhc2UiLCJ0b0xvd2VyQ2FzZUZpZWxkcyIsInRvTG93ZXJDYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwic2NoZW1hUHJvbWlzZSIsIl90cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbGxlY3Rpb25FeGlzdHMiLCJjbGFzc0V4aXN0cyIsInB1cmdlQ29sbGVjdGlvbiIsImxvYWRTY2hlbWEiLCJ0aGVuIiwic2NoZW1hQ29udHJvbGxlciIsImdldE9uZVNjaGVtYSIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwidmFsaWRhdGVDbGFzc05hbWUiLCJTY2hlbWFDb250cm9sbGVyIiwiY2xhc3NOYW1lSXNWYWxpZCIsIlByb21pc2UiLCJyZWplY3QiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJyZXNvbHZlIiwiY2xlYXJDYWNoZSIsImxvYWQiLCJsb2FkU2NoZW1hSWZOZWVkZWQiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInQiLCJnZXRFeHBlY3RlZFR5cGUiLCJ0YXJnZXRDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwicnVuT3B0aW9ucyIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsIm1hbnkiLCJ1cHNlcnQiLCJhZGRzRmllbGQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiSU5WQUxJRF9ORVNURURfS0VZIiwiZmluZCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwc2VydE9uZU9iamVjdCIsImZpbmRPbmVBbmRVcGRhdGUiLCJoYW5kbGVSZWxhdGlvblVwZGF0ZXMiLCJfc2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwib3JpZ2luYWxPYmplY3QiLCJjcmVhdGVkQXQiLCJpc28iLCJfX3R5cGUiLCJ1cGRhdGVkQXQiLCJlbmZvcmNlQ2xhc3NFeGlzdHMiLCJjcmVhdGVPYmplY3QiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwiY2xhc3NTY2hlbWEiLCJzY2hlbWFEYXRhIiwic2NoZW1hRmllbGRzIiwibmV3S2V5cyIsImZpZWxkIiwiYWN0aW9uIiwiZGVsZXRlRXZlcnl0aGluZyIsImZhc3QiLCJTY2hlbWFDYWNoZSIsImNsZWFyIiwiZGVsZXRlQWxsQ2xhc3NlcyIsInJlbGF0ZWRJZHMiLCJxdWVyeU9wdGlvbnMiLCJza2lwIiwibGltaXQiLCJzb3J0IiwiZmluZE9wdGlvbnMiLCJjYW5Tb3J0T25Kb2luVGFibGVzIiwiX2lkIiwicmVzdWx0cyIsIm93bmluZ0lkcyIsInJlZHVjZUluUmVsYXRpb24iLCJwcm9taXNlcyIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwiYW5kcyIsIm90aGVyS2V5cyIsInF1ZXJpZXMiLCJjb25zdHJhaW50S2V5IiwiaXNOZWdhdGlvbiIsInIiLCJxIiwiaWRzIiwiYWRkTm90SW5PYmplY3RJZHNJZHMiLCJhZGRJbk9iamVjdElkc0lkcyIsInJlZHVjZVJlbGF0aW9uS2V5cyIsInJlbGF0ZWRUbyIsImlkc0Zyb21TdHJpbmciLCJpZHNGcm9tRXEiLCJpZHNGcm9tSW4iLCJhbGxJZHMiLCJsaXN0IiwidG90YWxMZW5ndGgiLCJyZWR1Y2UiLCJtZW1vIiwiaWRzSW50ZXJzZWN0aW9uIiwiaW50ZXJzZWN0IiwiYmlnIiwiJGVxIiwiaWRzRnJvbU5pbiIsIlNldCIsIiRuaW4iLCJjb3VudCIsImRpc3RpbmN0IiwicGlwZWxpbmUiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwiX2NyZWF0ZWRfYXQiLCJfdXBkYXRlZF9hdCIsImRpc2FibGVDYXNlSW5zZW5zaXRpdml0eSIsImFkZFByb3RlY3RlZEZpZWxkcyIsImFnZ3JlZ2F0ZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImRlbGV0ZVNjaGVtYSIsImRlbGV0ZUNsYXNzIiwid2FzUGFyc2VDb2xsZWN0aW9uIiwicmVsYXRpb25GaWVsZE5hbWVzIiwibmFtZSIsImRlbCIsInJlbG9hZERhdGEiLCJvYmplY3RUb0VudHJpZXNTdHJpbmdzIiwiZW50cmllcyIsImEiLCJKU09OIiwic3RyaW5naWZ5Iiwiam9pbiIsInJlZHVjZU9yT3BlcmF0aW9uIiwicmVwZWF0IiwiaSIsImoiLCJzaG9ydGVyIiwibG9uZ2VyIiwiZm91bmRFbnRyaWVzIiwiYWNjIiwic2hvcnRlckVudHJpZXMiLCJzcGxpY2UiLCJyZWR1Y2VBbmRPcGVyYXRpb24iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJ1c2VyQUNMIiwiZ3JvdXBLZXkiLCJwZXJtRmllbGRzIiwicG9pbnRlckZpZWxkcyIsInVzZXJQb2ludGVyIiwiZmllbGREZXNjcmlwdG9yIiwiZmllbGRUeXBlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicXVlcnlDbGF1c2UiLCIkYWxsIiwiYXNzaWduIiwicHJlc2VydmVLZXlzIiwic2VydmVyT25seUtleXMiLCJhdXRoZW50aWNhdGVkIiwicm9sZXMiLCJ1c2VyUm9sZXMiLCJwcm90ZWN0ZWRLZXlzU2V0cyIsInByb3RlY3RlZEtleXMiLCJuZXh0IiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJyZXF1aXJlZFVzZXJGaWVsZHMiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiX1VzZXIiLCJyZXF1aXJlZFJvbGVGaWVsZHMiLCJfUm9sZSIsInJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMiLCJfSWRlbXBvdGVuY3kiLCJlbnN1cmVVbmlxdWVuZXNzIiwibG9nZ2VyIiwid2FybiIsImVuc3VyZUluZGV4IiwiaXNNb25nb0FkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiaXNQb3N0Z3Jlc0FkYXB0ZXIiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidHRsIiwic2V0SWRlbXBvdGVuY3lGdW5jdGlvbiIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiX2V4cGFuZFJlc3VsdE9uS2V5UGF0aCIsInBhdGgiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0Iiwia2V5d29yZCIsIlV0aWxzIiwib2JqZWN0Q29udGFpbnNLZXlWYWx1ZSIsInJlc3BvbnNlIiwia2V5VXBkYXRlIiwibW9kdWxlIiwiZXhwb3J0cyIsIl92YWxpZGF0ZVF1ZXJ5Il0sIm1hcHBpbmdzIjoiOztBQUtBOztBQUVBOztBQUVBOztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFLQSxTQUFTQSxXQUFULENBQXFCQyxLQUFyQixFQUE0QkMsR0FBNUIsRUFBaUM7QUFDL0IsUUFBTUMsUUFBUSxHQUFHQyxnQkFBRUMsU0FBRixDQUFZSixLQUFaLENBQWpCLENBRCtCLENBRS9COzs7QUFDQUUsRUFBQUEsUUFBUSxDQUFDRyxNQUFULEdBQWtCO0FBQUVDLElBQUFBLEdBQUcsRUFBRSxDQUFDLElBQUQsRUFBTyxHQUFHTCxHQUFWO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0Q7O0FBRUQsU0FBU0ssVUFBVCxDQUFvQlAsS0FBcEIsRUFBMkJDLEdBQTNCLEVBQWdDO0FBQzlCLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQ4QixDQUU5Qjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ00sTUFBVCxHQUFrQjtBQUFFRixJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBUCxFQUFZLEdBQUdMLEdBQWY7QUFBUCxHQUFsQjtBQUNBLFNBQU9DLFFBQVA7QUFDRCxDLENBRUQ7OztBQUNBLE1BQU1PLGtCQUFrQixHQUFHLFFBQXdCO0FBQUEsTUFBdkI7QUFBRUMsSUFBQUE7QUFBRixHQUF1QjtBQUFBLE1BQWJDLE1BQWE7O0FBQ2pELE1BQUksQ0FBQ0QsR0FBTCxFQUFV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QUFMLENBQTRCUyxRQUE1QixFQUFzQzVTLEdBQXRDLEVBQTJDdEIsTUFBM0M7QUFDRDtBQUNGLEtBYkQ7QUFjQSxXQUFPNkcsT0FBTyxDQUFDRyxPQUFSLENBQWdCa04sUUFBaEIsQ0FBUDtBQUNEOztBQTE2Q3NCOztBQWc3Q3pCRSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ6TyxrQkFBakIsQyxDQUNBOztBQUNBd08sTUFBTSxDQUFDQyxPQUFQLENBQWVDLGNBQWYsR0FBZ0MvVCxhQUFoQztBQUNBNlQsTUFBTSxDQUFDQyxPQUFQLENBQWV6UyxtQkFBZixHQUFxQ0EsbUJBQXJDIiwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5S2V5cyA9IFsnJGFuZCcsICckb3InLCAnJG5vcicsICdfcnBlcm0nLCAnX3dwZXJtJ107XG5jb25zdCBzcGVjaWFsTWFzdGVyUXVlcnlLZXlzID0gW1xuICAuLi5zcGVjaWFsUXVlcnlLZXlzLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbicsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfdG9tYnN0b25lJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfcGFzc3dvcmRfY2hhbmdlZF9hdCcsXG4gICdfcGFzc3dvcmRfaGlzdG9yeScsXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVF1ZXJ5ID0gKHF1ZXJ5OiBhbnksIGlzTWFzdGVyOiBib29sZWFuLCB1cGRhdGU6IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgaWYgKHF1ZXJ5LkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQ2Fubm90IHF1ZXJ5IG9uIEFDTC4nKTtcbiAgfVxuXG4gIGlmIChxdWVyeS4kb3IpIHtcbiAgICBpZiAocXVlcnkuJG9yIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRvci5mb3JFYWNoKHZhbHVlID0+IHZhbGlkYXRlUXVlcnkodmFsdWUsIGlzTWFzdGVyLCB1cGRhdGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnQmFkICRhbmQgZm9ybWF0IC0gdXNlIGFuIGFycmF5IHZhbHVlLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaCh2YWx1ZSA9PiB2YWxpZGF0ZVF1ZXJ5KHZhbHVlLCBpc01hc3RlciwgdXBkYXRlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKFxuICAgICAgIWtleS5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOV9cXC5dKiQvKSAmJlxuICAgICAgKCghc3BlY2lhbFF1ZXJ5S2V5cy5pbmNsdWRlcyhrZXkpICYmICFpc01hc3RlciAmJiAhdXBkYXRlKSB8fFxuICAgICAgICAodXBkYXRlICYmIGlzTWFzdGVyICYmICFzcGVjaWFsTWFzdGVyUXVlcnlLZXlzLmluY2x1ZGVzKGtleSkpKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGtleSBuYW1lOiAke2tleX1gKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gRmlsdGVycyBvdXQgYW55IGRhdGEgdGhhdCBzaG91bGRuJ3QgYmUgb24gdGhpcyBSRVNULWZvcm1hdHRlZCBvYmplY3QuXG5jb25zdCBmaWx0ZXJTZW5zaXRpdmVEYXRhID0gKFxuICBpc01hc3RlcjogYm9vbGVhbixcbiAgYWNsR3JvdXA6IGFueVtdLFxuICBhdXRoOiBhbnksXG4gIG9wZXJhdGlvbjogYW55LFxuICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHByb3RlY3RlZEZpZWxkczogbnVsbCB8IEFycmF5PGFueT4sXG4gIG9iamVjdDogYW55XG4pID0+IHtcbiAgbGV0IHVzZXJJZCA9IG51bGw7XG4gIGlmIChhdXRoICYmIGF1dGgudXNlcikgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuXG4gIC8vIHJlcGxhY2UgcHJvdGVjdGVkRmllbGRzIHdoZW4gdXNpbmcgcG9pbnRlci1wZXJtaXNzaW9uc1xuICBjb25zdCBwZXJtcyA9XG4gICAgc2NoZW1hICYmIHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMgPyBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSkgOiB7fTtcbiAgaWYgKHBlcm1zKSB7XG4gICAgY29uc3QgaXNSZWFkT3BlcmF0aW9uID0gWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xO1xuXG4gICAgaWYgKGlzUmVhZE9wZXJhdGlvbiAmJiBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgIC8vIGV4dHJhY3QgcHJvdGVjdGVkRmllbGRzIGFkZGVkIHdpdGggdGhlIHBvaW50ZXItcGVybWlzc2lvbiBwcmVmaXhcbiAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtID0gT2JqZWN0LmtleXMocGVybXMucHJvdGVjdGVkRmllbGRzKVxuICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgndXNlckZpZWxkOicpKVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBrZXkuc3Vic3RyaW5nKDEwKSwgdmFsdWU6IHBlcm1zLnByb3RlY3RlZEZpZWxkc1trZXldIH07XG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBuZXdQcm90ZWN0ZWRGaWVsZHM6IEFycmF5PHN0cmluZz5bXSA9IFtdO1xuICAgICAgbGV0IG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzID0gZmFsc2U7XG5cbiAgICAgIC8vIGNoZWNrIGlmIHRoZSBvYmplY3QgZ3JhbnRzIHRoZSBjdXJyZW50IHVzZXIgYWNjZXNzIGJhc2VkIG9uIHRoZSBleHRyYWN0ZWQgZmllbGRzXG4gICAgICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUGVybS5mb3JFYWNoKHBvaW50ZXJQZXJtID0+IHtcbiAgICAgICAgbGV0IHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJlYWRVc2VyRmllbGRWYWx1ZSA9IG9iamVjdFtwb2ludGVyUGVybS5rZXldO1xuICAgICAgICBpZiAocmVhZFVzZXJGaWVsZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVhZFVzZXJGaWVsZFZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSByZWFkVXNlckZpZWxkVmFsdWUuc29tZShcbiAgICAgICAgICAgICAgdXNlciA9PiB1c2VyLm9iamVjdElkICYmIHVzZXIub2JqZWN0SWQgPT09IHVzZXJJZFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPVxuICAgICAgICAgICAgICByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgJiYgcmVhZFVzZXJGaWVsZFZhbHVlLm9iamVjdElkID09PSB1c2VySWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvaW50ZXJQZXJtSW5jbHVkZXNVc2VyKSB7XG4gICAgICAgICAgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSB0cnVlO1xuICAgICAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5wdXNoKHBvaW50ZXJQZXJtLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIGlmIGF0IGxlYXN0IG9uZSBwb2ludGVyLXBlcm1pc3Npb24gYWZmZWN0ZWQgdGhlIGN1cnJlbnQgdXNlclxuICAgICAgLy8gaW50ZXJzZWN0IHZzIHByb3RlY3RlZEZpZWxkcyBmcm9tIHByZXZpb3VzIHN0YWdlIChAc2VlIGFkZFByb3RlY3RlZEZpZWxkcylcbiAgICAgIC8vIFNldHMgdGhlb3J5IChpbnRlcnNlY3Rpb25zKTogQSB4IChCIHggQykgPT0gKEEgeCBCKSB4IENcbiAgICAgIGlmIChvdmVycmlkZVByb3RlY3RlZEZpZWxkcyAmJiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocHJvdGVjdGVkRmllbGRzKTtcbiAgICAgIH1cbiAgICAgIC8vIGludGVyc2VjdCBhbGwgc2V0cyBvZiBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgIG5ld1Byb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGZpZWxkcyA9PiB7XG4gICAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgICAvLyBpZiB0aGVyZSdyZSBubyBwcm90Y3RlZEZpZWxkcyBieSBvdGhlciBjcml0ZXJpYSAoIGlkIC8gcm9sZSAvIGF1dGgpXG4gICAgICAgICAgLy8gdGhlbiB3ZSBtdXN0IGludGVyc2VjdCBlYWNoIHNldCAocGVyIHVzZXJGaWVsZClcbiAgICAgICAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gZmllbGRzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHMuZmlsdGVyKHYgPT4gZmllbGRzLmluY2x1ZGVzKHYpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlzVXNlckNsYXNzID0gY2xhc3NOYW1lID09PSAnX1VzZXInO1xuXG4gIC8qIHNwZWNpYWwgdHJlYXQgZm9yIHRoZSB1c2VyIGNsYXNzOiBkb24ndCBmaWx0ZXIgcHJvdGVjdGVkRmllbGRzIGlmIGN1cnJlbnRseSBsb2dnZWRpbiB1c2VyIGlzXG4gIHRoZSByZXRyaWV2ZWQgdXNlciAqL1xuICBpZiAoIShpc1VzZXJDbGFzcyAmJiB1c2VySWQgJiYgb2JqZWN0Lm9iamVjdElkID09PSB1c2VySWQpKSB7XG4gICAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgICAvLyBmaWVsZHMgbm90IHJlcXVlc3RlZCBieSBjbGllbnQgKGV4Y2x1ZGVkKSxcbiAgICAvL2J1dCB3ZXJlIG5lZWRlZCB0byBhcHBseSBwcm90ZWN0dGVkRmllbGRzXG4gICAgcGVybXMucHJvdGVjdGVkRmllbGRzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyAmJlxuICAgICAgcGVybXMucHJvdGVjdGVkRmllbGRzLnRlbXBvcmFyeUtleXMuZm9yRWFjaChrID0+IGRlbGV0ZSBvYmplY3Rba10pO1xuICB9XG5cbiAgaWYgKGlzVXNlckNsYXNzKSB7XG4gICAgb2JqZWN0LnBhc3N3b3JkID0gb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgZGVsZXRlIG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIGRlbGV0ZSBvYmplY3Quc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5LmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc1VzZXJDbGFzcykge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY29uc3QgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2UgPSAob2JqZWN0LCBjbGFzc05hbWUsIG9wdGlvbnMpID0+IHtcbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiBvcHRpb25zLmZvcmNlRW1haWxBbmRVc2VybmFtZVRvTG93ZXJDYXNlKSB7XG4gICAgY29uc3QgdG9Mb3dlckNhc2VGaWVsZHMgPSBbJ2VtYWlsJywgJ3VzZXJuYW1lJ107XG4gICAgdG9Mb3dlckNhc2VGaWVsZHMuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS50b0xvd2VyQ2FzZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5jbGFzcyBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBhZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcbiAgc2NoZW1hUHJvbWlzZTogP1Byb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPjtcbiAgX3RyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55O1xuICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIGlkZW1wb3RlbmN5T3B0aW9uczogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmFkYXB0ZXIgPSBhZGFwdGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdGhpcy5pZGVtcG90ZW5jeU9wdGlvbnMgPSB0aGlzLm9wdGlvbnMuaWRlbXBvdGVuY3lPcHRpb25zIHx8IHt9O1xuICAgIC8vIFByZXZlbnQgbXV0YWJsZSB0aGlzLnNjaGVtYSwgb3RoZXJ3aXNlIG9uZSByZXF1ZXN0IGNvdWxkIHVzZVxuICAgIC8vIG11bHRpcGxlIHNjaGVtYXMsIHNvIGluc3RlYWQgdXNlIGxvYWRTY2hlbWEgdG8gZ2V0IGEgc2NoZW1hLlxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBjb2xsZWN0aW9uRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICB9XG5cbiAgcHVyZ2VDb2xsZWN0aW9uKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihzY2hlbWEgPT4gdGhpcy5hZGFwdGVyLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCB7fSkpO1xuICB9XG5cbiAgdmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsICdpbnZhbGlkIGNsYXNzTmFtZTogJyArIGNsYXNzTmFtZSlcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHNjaGVtYUNvbnRyb2xsZXIuXG4gIGxvYWRTY2hlbWEoXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFQcm9taXNlICE9IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYVByb21pc2U7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IFNjaGVtYUNvbnRyb2xsZXIubG9hZCh0aGlzLmFkYXB0ZXIsIG9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIgPyBQcm9taXNlLnJlc29sdmUoc2NoZW1hQ29udHJvbGxlcikgOiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGNsYXNzbmFtZSB0aGF0IGlzIHJlbGF0ZWQgdG8gdGhlIGdpdmVuXG4gIC8vIGNsYXNzbmFtZSB0aHJvdWdoIHRoZSBrZXkuXG4gIC8vIFRPRE86IG1ha2UgdGhpcyBub3QgaW4gdGhlIERhdGFiYXNlQ29udHJvbGxlciBpbnRlcmZhY2VcbiAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXkoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nKTogUHJvbWlzZTw/c3RyaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIHZhciB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAodCAhPSBudWxsICYmIHR5cGVvZiB0ICE9PSAnc3RyaW5nJyAmJiB0LnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHQudGFyZ2V0Q2xhc3M7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xhc3NOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVXNlcyB0aGUgc2NoZW1hIHRvIHZhbGlkYXRlIHRoZSBvYmplY3QgKFJFU1QgQVBJIGZvcm1hdCkuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEuXG4gIC8vIFRoaXMgZG9lcyBub3QgdXBkYXRlIHRoaXMuc2NoZW1hLCBiZWNhdXNlIGluIGEgc2l0dWF0aW9uIGxpa2UgYVxuICAvLyBiYXRjaCByZXF1ZXN0LCB0aGF0IGNvdWxkIGNvbmZ1c2Ugb3RoZXIgdXNlcnMgb2YgdGhlIHNjaGVtYS5cbiAgdmFsaWRhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgcXVlcnk6IGFueSxcbiAgICBydW5PcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgbGV0IHNjaGVtYTtcbiAgICBjb25zdCBhY2wgPSBydW5PcHRpb25zLmFjbDtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cDogc3RyaW5nW10gPSBhY2wgfHwgW107XG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hID0gcztcbiAgICAgICAgaWYgKGlzTWFzdGVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbkFkZEZpZWxkKHNjaGVtYSwgY2xhc3NOYW1lLCBvYmplY3QsIGFjbEdyb3VwLCBydW5PcHRpb25zKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgdXBkYXRlOiBhbnksXG4gICAgeyBhY2wsIG1hbnksIHVwc2VydCwgYWRkc0ZpZWxkIH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAndXBkYXRlJylcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsIHVwZGF0ZSk7XG4gICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoYWRkc0ZpZWxkKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0ge1xuICAgICAgICAgICAgICAgICRhbmQ6IFtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ2FkZEZpZWxkJyxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgaXNNYXN0ZXIsIHRydWUpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIG1heWJlVHJhbnNmb3JtVXNlcm5hbWVBbmRFbWFpbFRvTG93ZXJDYXNlKHVwZGF0ZSwgY2xhc3NOYW1lLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgICAgICAgICB0cmFuc2Zvcm1BdXRoRGF0YShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHt9KS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1hbnkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodXBzZXJ0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmZpbmRPbmVBbmRVcGRhdGUoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKChyZXN1bHQ6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICB1cGRhdGUsXG4gICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDb2xsZWN0IGFsbCByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBsaXN0IG9mIGFsbCByZWxhdGlvbiB1cGRhdGVzIHRvIHBlcmZvcm1cbiAgLy8gVGhpcyBtdXRhdGVzIHVwZGF0ZS5cbiAgY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6ID9zdHJpbmcsIHVwZGF0ZTogYW55KSB7XG4gICAgdmFyIG9wcyA9IFtdO1xuICAgIHZhciBkZWxldGVNZSA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuXG4gICAgdmFyIHByb2Nlc3MgPSAob3AsIGtleSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIG9wcy5wdXNoKHsga2V5LCBvcCB9KTtcbiAgICAgICAgZGVsZXRlTWUucHVzaChrZXkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnQmF0Y2gnKSB7XG4gICAgICAgIGZvciAodmFyIHggb2Ygb3Aub3BzKSB7XG4gICAgICAgICAgcHJvY2Vzcyh4LCBrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHVwZGF0ZSkge1xuICAgICAgcHJvY2Vzcyh1cGRhdGVba2V5XSwga2V5KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGVsZXRlTWUpIHtcbiAgICAgIGRlbGV0ZSB1cGRhdGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIG9wcztcbiAgfVxuXG4gIC8vIFByb2Nlc3NlcyByZWxhdGlvbi11cGRhdGluZyBvcGVyYXRpb25zIGZyb20gYSBSRVNULWZvcm1hdCB1cGRhdGUuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGwgdXBkYXRlcyBoYXZlIGJlZW4gcGVyZm9ybWVkXG4gIGhhbmRsZVJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0SWQ6IHN0cmluZywgdXBkYXRlOiBhbnksIG9wczogYW55KSB7XG4gICAgdmFyIHBlbmRpbmcgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcbiAgICBvcHMuZm9yRWFjaCgoeyBrZXksIG9wIH0pID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKHRoaXMuYWRkUmVsYXRpb24oa2V5LCBjbGFzc05hbWUsIG9iamVjdElkLCBvYmplY3Qub2JqZWN0SWQpKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3AuX19vcCA9PSAnUmVtb3ZlUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgZG9jID0ge1xuICAgICAgcmVsYXRlZElkOiB0b0lkLFxuICAgICAgb3duaW5nSWQ6IGZyb21JZCxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgYF9Kb2luOiR7a2V5fToke2Zyb21DbGFzc05hbWV9YCxcbiAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgZG9jLFxuICAgICAgZG9jLFxuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBhIHJlbGF0aW9uLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSBpZmYgdGhlIHJlbW92ZSB3YXNcbiAgLy8gc3VjY2Vzc2Z1bC5cbiAgcmVtb3ZlUmVsYXRpb24oa2V5OiBzdHJpbmcsIGZyb21DbGFzc05hbWU6IHN0cmluZywgZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZykge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jLFxuICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBpZiB0aGV5IHRyeSB0byBkZWxldGUgYSBub24tZXhpc3RlbnQgcmVsYXRpb24uXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZXMgb2JqZWN0cyBtYXRjaGVzIHRoaXMgcXVlcnkgZnJvbSB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHdhc1xuICAvLyBkZWxldGVkLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIGFjbDogIGEgbGlzdCBvZiBzdHJpbmdzLiBJZiB0aGUgb2JqZWN0IHRvIGJlIHVwZGF0ZWQgaGFzIGFuIEFDTCxcbiAgLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuICAvLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuICBkZXN0cm95KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuXG4gICAgcmV0dXJuIHRoaXMubG9hZFNjaGVtYUlmTmVlZGVkKHZhbGlkU2NoZW1hQ29udHJvbGxlcikudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdkZWxldGUnKVxuICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgJ2RlbGV0ZScsXG4gICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGRlbGV0ZSBieSBxdWVyeVxuICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgfVxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG4gICAgbWF5YmVUcmFuc2Zvcm1Vc2VybmFtZUFuZEVtYWlsVG9Mb3dlckNhc2Uob2JqZWN0LCBjbGFzc05hbWUsIHRoaXMub3B0aW9ucyk7XG4gICAgb2JqZWN0LmNyZWF0ZWRBdCA9IHsgaXNvOiBvYmplY3QuY3JlYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuICAgIG9iamVjdC51cGRhdGVkQXQgPSB7IGlzbzogb2JqZWN0LnVwZGF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcblxuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcbiAgICBjb25zdCByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBudWxsLCBvYmplY3QpO1xuXG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVDbGFzc05hbWUoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2NyZWF0ZScpXG4gICAgICAgIClcbiAgICAgICAgICAudGhlbigoKSA9PiBzY2hlbWFDb250cm9sbGVyLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSkpXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICAgICAgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZShvYmplY3QpO1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBTY2hlbWFDb250cm9sbGVyLmNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoc2NoZW1hKSxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlbGF0aW9uVXBkYXRlcyhcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBvYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzXG4gICAgICAgICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdCwgcmVzdWx0Lm9wc1swXSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2FuQWRkRmllbGQoXG4gICAgc2NoZW1hOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXIsXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIHJ1bk9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChvYmplY3RbZmllbGRdICYmIG9iamVjdFtmaWVsZF0uX19vcCAmJiBvYmplY3RbZmllbGRdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihnZXRSb290RmllbGROYW1lKGZpZWxkKSkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFkZHMgYSBtYXJrZXIgdGhhdCBuZXcgZmllbGQgaXMgYmVpbmcgYWRkaW5nIGR1cmluZyB1cGRhdGVcbiAgICAgIHJ1bk9wdGlvbnMuYWRkc0ZpZWxkID0gdHJ1ZTtcblxuICAgICAgY29uc3QgYWN0aW9uID0gcnVuT3B0aW9ucy5hY3Rpb247XG4gICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnYWRkRmllbGQnLCBhY3Rpb24pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kZWxldGVBbGxDbGFzc2VzKGZhc3QpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiByZWxhdGVkIGlkcyBnaXZlbiBhbiBvd25pbmcgaWQuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICByZWxhdGVkSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIG93bmluZ0lkOiBzdHJpbmcsXG4gICAgcXVlcnlPcHRpb25zOiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxBcnJheTxzdHJpbmc+PiB7XG4gICAgY29uc3QgeyBza2lwLCBsaW1pdCwgc29ydCB9ID0gcXVlcnlPcHRpb25zO1xuICAgIGNvbnN0IGZpbmRPcHRpb25zID0ge307XG4gICAgaWYgKHNvcnQgJiYgc29ydC5jcmVhdGVkQXQgJiYgdGhpcy5hZGFwdGVyLmNhblNvcnRPbkpvaW5UYWJsZXMpIHtcbiAgICAgIGZpbmRPcHRpb25zLnNvcnQgPSB7IF9pZDogc29ydC5jcmVhdGVkQXQgfTtcbiAgICAgIGZpbmRPcHRpb25zLmxpbWl0ID0gbGltaXQ7XG4gICAgICBmaW5kT3B0aW9ucy5za2lwID0gc2tpcDtcbiAgICAgIHF1ZXJ5T3B0aW9ucy5za2lwID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmZpbmQoam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksIHJlbGF0aW9uU2NoZW1hLCB7IG93bmluZ0lkIH0sIGZpbmRPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlbGF0ZWRJZCkpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbGlzdCBvZiBvd25pbmcgaWRzIGdpdmVuIHNvbWUgcmVsYXRlZCBpZHMuXG4gIC8vIGNsYXNzTmFtZSBoZXJlIGlzIHRoZSBvd25pbmcgY2xhc3NOYW1lLlxuICBvd25pbmdJZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGtleTogc3RyaW5nLCByZWxhdGVkSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7IGtleXM6IFsnb3duaW5nSWQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQub3duaW5nSWQpKTtcbiAgfVxuXG4gIC8vIE1vZGlmaWVzIHF1ZXJ5IHNvIHRoYXQgaXQgbm8gbG9uZ2VyIGhhcyAkaW4gb24gcmVsYXRpb24gZmllbGRzLCBvclxuICAvLyBlcXVhbC10by1wb2ludGVyIGNvbnN0cmFpbnRzIG9uIHJlbGF0aW9uIGZpZWxkcy5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IGFueSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIFNlYXJjaCBmb3IgYW4gaW4tcmVsYXRpb24gb3IgZXF1YWwtdG8tcmVsYXRpb25cbiAgICAvLyBNYWtlIGl0IHNlcXVlbnRpYWwgZm9yIG5vdywgbm90IHN1cmUgb2YgcGFyYWxsZWl6YXRpb24gc2lkZSBlZmZlY3RzXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAuLi5vcnMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJG9yJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHF1ZXJ5WyckYW5kJ10pIHtcbiAgICAgIGNvbnN0IGFuZHMgPSBxdWVyeVsnJGFuZCddO1xuICAgICAgcHJvbWlzZXMucHVzaChcbiAgICAgICAgLi4uYW5kcy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5WyckYW5kJ11baW5kZXhdID0gYVF1ZXJ5O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvdGhlcktleXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09PSAnJGFuZCcgfHwga2V5ID09PSAnJG9yJykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoWy4uLnByb21pc2VzLCAuLi5vdGhlcktleXNdKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRyZWxhdGVkVG9cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHF1ZXJ5IGlzIG11dGF0ZWRcbiAgcmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBxdWVyeU9wdGlvbnM6IGFueSk6ID9Qcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5Wyckb3InXS5tYXAoYVF1ZXJ5ID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBhUXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJGFuZCddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIHZhciByZWxhdGVkVG8gPSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgIGlmIChyZWxhdGVkVG8pIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbGF0ZWRJZHMoXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICByZWxhdGVkVG8ua2V5LFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0Lm9iamVjdElkLFxuICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgIClcbiAgICAgICAgLnRoZW4oaWRzID0+IHtcbiAgICAgICAgICBkZWxldGUgcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICAgICAgICB0aGlzLmFkZEluT2JqZWN0SWRzSWRzKGlkcywgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgfVxuICB9XG5cbiAgYWRkSW5PYmplY3RJZHNJZHMoaWRzOiA/QXJyYXk8c3RyaW5nPiA9IG51bGwsIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tU3RyaW5nOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnID8gW3F1ZXJ5Lm9iamVjdElkXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUVxOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGVxJ10gPyBbcXVlcnkub2JqZWN0SWRbJyRlcSddXSA6IG51bGw7XG4gICAgY29uc3QgaWRzRnJvbUluOiA/QXJyYXk8c3RyaW5nPiA9XG4gICAgICBxdWVyeS5vYmplY3RJZCAmJiBxdWVyeS5vYmplY3RJZFsnJGluJ10gPyBxdWVyeS5vYmplY3RJZFsnJGluJ10gOiBudWxsO1xuXG4gICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgY29uc3QgYWxsSWRzOiBBcnJheTxBcnJheTxzdHJpbmc+PiA9IFtpZHNGcm9tU3RyaW5nLCBpZHNGcm9tRXEsIGlkc0Zyb21JbiwgaWRzXS5maWx0ZXIoXG4gICAgICBsaXN0ID0+IGxpc3QgIT09IG51bGxcbiAgICApO1xuICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gYWxsSWRzLnJlZHVjZSgobWVtbywgbGlzdCkgPT4gbWVtbyArIGxpc3QubGVuZ3RoLCAwKTtcblxuICAgIGxldCBpZHNJbnRlcnNlY3Rpb24gPSBbXTtcbiAgICBpZiAodG90YWxMZW5ndGggPiAxMjUpIHtcbiAgICAgIGlkc0ludGVyc2VjdGlvbiA9IGludGVyc2VjdC5iaWcoYWxsSWRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0KGFsbElkcyk7XG4gICAgfVxuXG4gICAgLy8gTmVlZCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgY2xvYmJlciBleGlzdGluZyBzaG9ydGhhbmQgJGVxIGNvbnN0cmFpbnRzIG9uIG9iamVjdElkLlxuICAgIGlmICghKCdvYmplY3RJZCcgaW4gcXVlcnkpKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRpbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gICAgcXVlcnkub2JqZWN0SWRbJyRpbiddID0gaWRzSW50ZXJzZWN0aW9uO1xuXG4gICAgcmV0dXJuIHF1ZXJ5O1xuICB9XG5cbiAgYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzOiBzdHJpbmdbXSA9IFtdLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbU5pbiA9IHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGNhc2VJbnNlbnNpdGl2ZSBtYWtlIHN0cmluZyBjb21wYXJpc29ucyBjYXNlIGluc2Vuc2l0aXZlXG4gIC8vIFRPRE86IG1ha2UgdXNlcklkcyBub3QgbmVlZGVkIGhlcmUuIFRoZSBkYiBhZGFwdGVyIHNob3VsZG4ndCBrbm93XG4gIC8vIGFueXRoaW5nIGFib3V0IHVzZXJzLCBpZGVhbGx5LiBUaGVuLCBpbXByb3ZlIHRoZSBmb3JtYXQgb2YgdGhlIEFDTFxuICAvLyBhcmcgdG8gd29yayBsaWtlIHRoZSBvdGhlcnMuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBhY2wsXG4gICAgICBzb3J0ID0ge30sXG4gICAgICBjb3VudCxcbiAgICAgIGtleXMsXG4gICAgICBvcCxcbiAgICAgIGRpc3RpbmN0LFxuICAgICAgcGlwZWxpbmUsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgfTogYW55ID0ge30sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIG9wID1cbiAgICAgIG9wIHx8ICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT0gJ3N0cmluZycgJiYgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMSA/ICdnZXQnIDogJ2ZpbmQnKTtcbiAgICAvLyBDb3VudCBvcGVyYXRpb24gaWYgY291bnRpbmdcbiAgICBvcCA9IGNvdW50ID09PSB0cnVlID8gJ2NvdW50JyA6IG9wO1xuXG4gICAgbGV0IGNsYXNzRXhpc3RzID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAvL1RPRE86IE1vdmUgdm9sYXRpbGUgY2xhc3NlcyBjb25jZXB0IGludG8gbW9uZ28gYWRhcHRlciwgcG9zdGdyZXMgYWRhcHRlciBzaG91bGRuJ3QgY2FyZVxuICAgICAgLy90aGF0IGFwaS5wYXJzZS5jb20gYnJlYWtzIHdoZW4gX1B1c2hTdGF0dXMgZXhpc3RzIGluIG1vbmdvLlxuICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGlzTWFzdGVyKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgIC8vIEZvciBub3csIHByZXRlbmQgdGhlIGNsYXNzIGV4aXN0cyBidXQgaGFzIG5vIG9iamVjdHMsXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgLy8gc28gZHVwbGljYXRlIHRoYXQgYmVoYXZpb3IgaGVyZS4gSWYgYm90aCBhcmUgc3BlY2lmaWVkLCB0aGUgY29ycmVjdCBiZWhhdmlvciB0byBtYXRjaCBQYXJzZS5jb20gaXMgdG9cbiAgICAgICAgICAvLyB1c2UgdGhlIG9uZSB0aGF0IGFwcGVhcnMgZmlyc3QgaW4gdGhlIHNvcnQgbGlzdC5cbiAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgc29ydC5jcmVhdGVkQXQgPSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgZGVsZXRlIHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzb3J0Ll91cGRhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LnVwZGF0ZWRBdCA9IHNvcnQuX3VwZGF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc29ydCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmU6IHRoaXMub3B0aW9ucy5kaXNhYmxlQ2FzZUluc2Vuc2l0aXZpdHkgPyBmYWxzZSA6IGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWUuc3BsaXQoJy4nKVswXV0gJiYgZmllbGROYW1lICE9PSAnc2NvcmUnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgPyBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCBvcClcbiAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIHF1ZXJ5LCBxdWVyeU9wdGlvbnMpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBsZXQgcHJvdGVjdGVkRmllbGRzO1xuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8qIERvbid0IHVzZSBwcm9qZWN0aW9ucyB0byBvcHRpbWl6ZSB0aGUgcHJvdGVjdGVkRmllbGRzIHNpbmNlIHRoZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgIGJhc2VkIG9uIHBvaW50ZXItcGVybWlzc2lvbnMgYXJlIGRldGVybWluZWQgYWZ0ZXIgcXVlcnlpbmcuIFRoZSBmaWx0ZXJpbmcgY2FuXG4gICAgICAgICAgICAgICAgICBvdmVyd3JpdGUgdGhlIHByb3RlY3RlZCBmaWVsZHMuICovXG4gICAgICAgICAgICAgICAgcHJvdGVjdGVkRmllbGRzID0gdGhpcy5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBxdWVyeU9wdGlvbnNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAob3AgPT09ICdnZXQnKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ3VwZGF0ZScgfHwgb3AgPT09ICdkZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkUmVhZEFDTChxdWVyeSwgYWNsR3JvdXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCBpc01hc3RlciwgZmFsc2UpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgaWYgKCF0aGlzLm9wdGlvbnMuZGlzYWJsZUNhc2VJbnNlbnNpdGl2aXR5KSB7XG4gICAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddLCAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsIHRydWUpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcblxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsnZW1haWwnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLCB0cnVlKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgZW1haWwgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfUm9sZScsIHJlcXVpcmVkUm9sZUZpZWxkcywgWyduYW1lJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHJvbGUgbmFtZTogJywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVVbmlxdWVuZXNzKCdfSWRlbXBvdGVuY3knLCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzLCBbJ3JlcUlkJ10pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciBpZGVtcG90ZW5jeSByZXF1ZXN0IElEOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpc01vbmdvQWRhcHRlciA9IHRoaXMuYWRhcHRlciBpbnN0YW5jZW9mIE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4gICAgY29uc3QgaXNQb3N0Z3Jlc0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuICAgIGlmIChpc01vbmdvQWRhcHRlciB8fCBpc1Bvc3RncmVzQWRhcHRlcikge1xuICAgICAgbGV0IG9wdGlvbnMgPSB7fTtcbiAgICAgIGlmIChpc01vbmdvQWRhcHRlcikge1xuICAgICAgICBvcHRpb25zID0ge1xuICAgICAgICAgIHR0bDogMCxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAoaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zO1xuICAgICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gPSB0cnVlO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAgIC5lbnN1cmVJbmRleCgnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydleHBpcmUnXSwgJ3R0bCcsIGZhbHNlLCBvcHRpb25zKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIFRUTCBpbmRleCBmb3IgaWRlbXBvdGVuY3kgZXhwaXJlIGRhdGU6ICcsIGVycm9yKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci51cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpO1xuICB9XG5cbiAgX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChvYmplY3Q6IGFueSwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpIDwgMCkge1xuICAgICAgb2JqZWN0W2tleV0gPSB2YWx1ZVtrZXldO1xuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguc2xpY2UoMSkuam9pbignLicpO1xuXG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGlmICh0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLm9wdGlvbnMucmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoXG4gICAgICAgICAgeyBbZmlyc3RLZXldOiB0cnVlLCBbbmV4dFBhdGhdOiB0cnVlIH0sXG4gICAgICAgICAga2V5d29yZC5rZXksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb2JqZWN0W2ZpcnN0S2V5XSA9IHRoaXMuX2V4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICAgIG9iamVjdFtmaXJzdEtleV0gfHwge30sXG4gICAgICBuZXh0UGF0aCxcbiAgICAgIHZhbHVlW2ZpcnN0S2V5XVxuICAgICk7XG4gICAgZGVsZXRlIG9iamVjdFtrZXldO1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBfc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbE9iamVjdDogYW55LCByZXN1bHQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB7fTtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKG9yaWdpbmFsT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgICAgLy8gZGV0ZXJtaW5lIGlmIHRoYXQgd2FzIGFuIG9wXG4gICAgICBpZiAoXG4gICAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgICB0eXBlb2Yga2V5VXBkYXRlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBrZXlVcGRhdGUuX19vcCAmJlxuICAgICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICAgICkge1xuICAgICAgICAvLyBvbmx5IHZhbGlkIG9wcyB0aGF0IHByb2R1Y2UgYW4gYWN0aW9uYWJsZSByZXN1bHRcbiAgICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmVkIG9uIGEga2V5cGF0aFxuICAgICAgICB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbiAgfVxuXG4gIHN0YXRpYyBfdmFsaWRhdGVRdWVyeTogKGFueSwgYm9vbGVhbiwgYm9vbGVhbikgPT4gdm9pZDtcbiAgc3RhdGljIGZpbHRlclNlbnNpdGl2ZURhdGE6IChib29sZWFuLCBhbnlbXSwgYW55LCBhbnksIGFueSwgc3RyaW5nLCBhbnlbXSwgYW55KSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xubW9kdWxlLmV4cG9ydHMuZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IGZpbHRlclNlbnNpdGl2ZURhdGE7XG4iXX0=