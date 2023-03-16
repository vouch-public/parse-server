"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.SchemaController = void 0;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.classNameIsValid = classNameIsValid;
exports.defaultColumns = exports.default = exports.convertSchemaToAdapterSchema = void 0;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.systemClasses = exports.requiredColumns = exports.load = void 0;
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _Config = _interopRequireDefault(require("../Config"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }
// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// -disable-next
const Parse = require('parse/node').Parse;
const defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: {
      type: 'String'
    },
    createdAt: {
      type: 'Date'
    },
    updatedAt: {
      type: 'Date'
    },
    ACL: {
      type: 'ACL'
    }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: {
      type: 'String'
    },
    password: {
      type: 'String'
    },
    email: {
      type: 'String'
    },
    emailVerified: {
      type: 'Boolean'
    },
    authData: {
      type: 'Object'
    }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: {
      type: 'String'
    },
    deviceToken: {
      type: 'String'
    },
    channels: {
      type: 'Array'
    },
    deviceType: {
      type: 'String'
    },
    pushType: {
      type: 'String'
    },
    GCMSenderId: {
      type: 'String'
    },
    timeZone: {
      type: 'String'
    },
    localeIdentifier: {
      type: 'String'
    },
    badge: {
      type: 'Number'
    },
    appVersion: {
      type: 'String'
    },
    appName: {
      type: 'String'
    },
    appIdentifier: {
      type: 'String'
    },
    parseVersion: {
      type: 'String'
    }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: {
      type: 'String'
    },
    users: {
      type: 'Relation',
      targetClass: '_User'
    },
    roles: {
      type: 'Relation',
      targetClass: '_Role'
    }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    user: {
      type: 'Pointer',
      targetClass: '_User'
    },
    installationId: {
      type: 'String'
    },
    sessionToken: {
      type: 'String'
    },
    expiresAt: {
      type: 'Date'
    },
    createdWith: {
      type: 'Object'
    }
  },
  _Product: {
    productIdentifier: {
      type: 'String'
    },
    download: {
      type: 'File'
    },
    downloadName: {
      type: 'String'
    },
    icon: {
      type: 'File'
    },
    order: {
      type: 'Number'
    },
    title: {
      type: 'String'
    },
    subtitle: {
      type: 'String'
    }
  },
  _PushStatus: {
    pushTime: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    // rest or webui
    query: {
      type: 'String'
    },
    // the stringified JSON query
    payload: {
      type: 'String'
    },
    // the stringified JSON payload,
    title: {
      type: 'String'
    },
    expiry: {
      type: 'Number'
    },
    expiration_interval: {
      type: 'Number'
    },
    status: {
      type: 'String'
    },
    numSent: {
      type: 'Number'
    },
    numFailed: {
      type: 'Number'
    },
    pushHash: {
      type: 'String'
    },
    errorMessage: {
      type: 'Object'
    },
    sentPerType: {
      type: 'Object'
    },
    failedPerType: {
      type: 'Object'
    },
    sentPerUTCOffset: {
      type: 'Object'
    },
    failedPerUTCOffset: {
      type: 'Object'
    },
    count: {
      type: 'Number'
    } // tracks # of batches queued and pending
  },

  _JobStatus: {
    jobName: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    status: {
      type: 'String'
    },
    message: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    // params received when calling the job
    finishedAt: {
      type: 'Date'
    }
  },
  _JobSchedule: {
    jobName: {
      type: 'String'
    },
    description: {
      type: 'String'
    },
    params: {
      type: 'String'
    },
    startAfter: {
      type: 'String'
    },
    daysOfWeek: {
      type: 'Array'
    },
    timeOfDay: {
      type: 'String'
    },
    lastRun: {
      type: 'Number'
    },
    repeatMinutes: {
      type: 'Number'
    }
  },
  _Hooks: {
    functionName: {
      type: 'String'
    },
    className: {
      type: 'String'
    },
    triggerName: {
      type: 'String'
    },
    url: {
      type: 'String'
    }
  },
  _GlobalConfig: {
    objectId: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    masterKeyOnly: {
      type: 'Object'
    }
  },
  _GraphQLConfig: {
    objectId: {
      type: 'String'
    },
    config: {
      type: 'Object'
    }
  },
  _Audience: {
    objectId: {
      type: 'String'
    },
    name: {
      type: 'String'
    },
    query: {
      type: 'String'
    },
    //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: {
      type: 'Date'
    },
    timesUsed: {
      type: 'Number'
    }
  },
  _Idempotency: {
    reqId: {
      type: 'String'
    },
    expire: {
      type: 'Date'
    }
  }
});

// fields required for read or write operations on their respective classes.
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
exports.requiredColumns = requiredColumns;
const invalidColumns = ['length'];
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]);

// clp regex
const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);
function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

// validation before setting class-level permissions on collection
function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }
    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);
    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];
        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];
        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
      const permit = operation[entity];
      if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`);
      }
    }
  }
}
function validateCLPjson(operation, operationKey) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`);
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`);
    }
  }
}
function validatePointerPermission(fieldName, fields, operation) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (!(fields[fieldName] && (fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User' || fields[fieldName].type == 'Array'))) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`);
  }
}
const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName, className)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}
function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}
const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon'];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({
  type,
  targetClass
}) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }
  if (typeof type !== 'string') {
    return invalidJsonError;
  }
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }
  return undefined;
};
const convertSchemaToAdapterSchema = schema => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = {
    type: 'Array'
  };
  schema.fields._wperm = {
    type: 'Array'
  };
  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = {
      type: 'String'
    };
  }
  return schema;
};
exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;
const convertAdapterSchemaToParseSchema = _ref => {
  let schema = _extends({}, _ref);
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  schema.fields.ACL = {
    type: 'ACL'
  };
  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = {
      type: 'String'
    };
  }
  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }
  return schema;
};
class SchemaData {
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }
      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = (0, _deepcopy.default)(schema.classLevelPermissions);
            data.indexes = schema.indexes;
            const classProtectedFields = this.__protectedFields[schema.className];
            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([...(data.classLevelPermissions.protectedFields[key] || []), ...classProtectedFields[key]]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }
            this.__data[schema.className] = data;
          }
          return this.__data[schema.className];
        }
      });
    });

    // Inject the in-memory classes
    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {}
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }
          return this.__data[className];
        }
      });
    });
  }
}
const injectDefaultSchema = ({
  className,
  fields,
  classLevelPermissions,
  indexes
}) => {
  const defaultSchema = {
    className,
    fields: _objectSpread(_objectSpread(_objectSpread({}, defaultColumns._Default), defaultColumns[className] || {}), fields),
    classLevelPermissions
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};
const _HooksSchema = {
  className: '_Hooks',
  fields: defaultColumns._Hooks
};
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig
};
const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_PushStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobSchedule',
  fields: {},
  classLevelPermissions: {}
}));
const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Audience',
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));
const _IdempotencySchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Idempotency',
  fields: defaultColumns._Idempotency,
  classLevelPermissions: {}
}));
const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
exports.VolatileClassesSchemas = VolatileClassesSchemas;
const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};
const typeToString = type => {
  if (typeof type === 'string') {
    return type;
  }
  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }
  return `${type.type}`;
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;
    const customIds = _Config.default.get(Parse.applicationId).allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
  }
  reloadData(options = {
    clearCache: false
  }) {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }
    this.reloadDataPromise = this.getAllClasses(options).then(allSchemas => {
      this.schemaData = new SchemaData(allSchemas, this.protectedFields);
      delete this.reloadDataPromise;
    }, err => {
      this.schemaData = new SchemaData();
      delete this.reloadDataPromise;
      throw err;
    }).then(() => {});
    return this.reloadDataPromise;
  }
  getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    const cached = _SchemaCache.default.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }
  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      _SchemaCache.default.put(allSchemas);
      return allSchemas;
    });
  }
  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      _SchemaCache.default.clear();
    }
    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes
      });
    }
    const cached = _SchemaCache.default.get(className);
    if (cached && !options.clearCache) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses().then(allSchemas => {
      const oneSchema = allSchemas.find(schema => schema.className === className);
      if (!oneSchema) {
        return Promise.reject(undefined);
      }
      return oneSchema;
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  async addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }
      return Promise.reject(validationError);
    }
    try {
      const adapterSchema = await this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
        fields,
        classLevelPermissions,
        indexes,
        className
      }));
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }
  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];
        if (existingFields[name] && existingFields[name].type !== field.type && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }
        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });
      delete existingFields._rperm;
      delete existingFields._wperm;
      const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
      const defaultFields = defaultColumns[className] || defaultColumns._Default;
      const fullNewSchema = Object.assign({}, newSchema, defaultFields);
      const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));
      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
      const deletedFields = [];
      const insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          deletedFields.push(fieldName);
        } else {
          insertedFields.push(fieldName);
        }
      });
      let deletePromise = Promise.resolve();
      if (deletedFields.length > 0) {
        deletePromise = this.deleteFields(deletedFields, className, database);
      }
      let enforceFields = [];
      return deletePromise // Delete Everything
      .then(() => this.reloadData({
        clearCache: true
      })) // Reload our Schema, so we have all the new values
      .then(() => {
        const promises = insertedFields.map(fieldName => {
          const type = submittedFields[fieldName];
          return this.enforceFieldExists(className, fieldName, type);
        });
        return Promise.all(promises);
      }).then(results => {
        enforceFields = results.filter(result => !!result);
        return this.setPermissions(className, classLevelPermissions, newSchema);
      }).then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, fullNewSchema)).then(() => this.reloadData({
        clearCache: true
      }))
      //TODO: Move this logic into the database adapter
      .then(() => {
        this.ensureFields(enforceFields);
        const schema = this.schemaData[className];
        const reloadedSchema = {
          className: className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions
        };
        if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
          reloadedSchema.indexes = schema.indexes;
        }
        return reloadedSchema;
      });
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    });
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className).catch(() => {
        // The schema update failed. This can be okay - it might
        // have failed because there's a race condition and a different
        // client is making the exact same schema update that we want.
        // So just reload the schema.
        return this.reloadData({
          clearCache: true
        });
      }).then(() => {
        // Ensure that the schema now validates
        if (this.schemaData[className]) {
          return this;
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
        }
      }).catch(() => {
        // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
      })
    );
  }
  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className)
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }
  validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName, className)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName
          };
        }
        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added'
          };
        }
        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return {
          code: error.code,
          error: error.message
        };
        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);
          if (typeof defaultValueType === 'string') {
            defaultValueType = {
              type: defaultValueType
            };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`
            };
          }
          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(fieldType)} but got ${typeToString(defaultValueType)}`
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`
            };
          }
        }
      }
    }
    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }
    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
      };
    }
    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  async setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);
    const cached = _SchemaCache.default.get(className);
    if (cached) {
      cached.classLevelPermissions = perms;
    }
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className, fieldName, type, isValidation, maintenance) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    let fieldNameToValidate = `${fieldName}`;
    if (maintenance && fieldNameToValidate.charAt(0) === '_') {
      fieldNameToValidate = fieldNameToValidate.substring(1);
    }
    if (!fieldNameIsValid(fieldNameToValidate, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
    if (!type) {
      return undefined;
    }
    const expectedType = this.getExpectedType(className, fieldName);
    if (typeof type === 'string') {
      type = {
        type
      };
    }
    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);
      if (typeof defaultValueType === 'string') {
        defaultValueType = {
          type: defaultValueType
        };
      }
      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(type)} but got ${typeToString(defaultValueType)}`);
      }
    }
    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`);
      }
      // If type options do not change
      // we can safely return
      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      }
      // Field options are may be changed
      // ensure to have an update to date schema field
      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }
    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      }
      // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema
      return Promise.resolve();
    }).then(() => {
      return {
        className,
        fieldName,
        type
      };
    });
  }
  ensureFields(fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const {
        className,
        fieldName
      } = fields[i];
      let {
        type
      } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);
      if (typeof type === 'string') {
        type = {
          type: type
        };
      }
      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  }

  // maintain compatibility
  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteFields(fieldNames, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }
    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName, className)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });
    return this.getOneSchema(className, false, {
      clearCache: true
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    }).then(schema => {
      fieldNames.forEach(fieldName => {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
        }
      });
      const schemaFields = _objectSpread({}, schema.fields);
      return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
        return Promise.all(fieldNames.map(fieldName => {
          const field = schemaFields[fieldName];
          if (field && field.type === 'Relation') {
            //For relations, drop the _Join table
            return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
          }
          return Promise.resolve();
        }));
      });
    }).then(() => {
      _SchemaCache.default.clear();
    });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  async validateObject(className, object, query, maintenance) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];
    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }
      if (geocount > 1) {
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }
    }
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
      if (!expected) {
        continue;
      }
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true, maintenance));
    }
    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);
    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
    }
    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns.write[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }
    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
        return false;
      }
      return !object[column];
    });
    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }
    return Promise.resolve(this);
  }
  testPermissionsForClassName(className, aclGroup, operation) {
    return SchemaController.testPermissions(this.getClassLevelPermissions(className), aclGroup, operation);
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
    if (Array.isArray(classPermissions[permissionField]) && classPermissions[permissionField].length > 0) {
      return Promise.resolve();
    }
    const pointerFields = classPermissions[operation].pointerFields;
    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }
  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
exports.SchemaController = exports.default = SchemaController;
const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
exports.load = load;
function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {};
  // -disable-next
  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj) {
  const type = typeof obj;
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }
      return getObjectType(obj);
    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }
  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }
        break;
      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className
          };
        }
        break;
      case 'File':
        if (obj.name) {
          return 'File';
        }
        break;
      case 'Date':
        if (obj.iso) {
          return 'Date';
        }
        break;
      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }
        break;
      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }
        break;
      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }
        break;
    }
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJleHBvcnRzIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJfZGJBZGFwdGVyIiwic2NoZW1hRGF0YSIsIlNjaGVtYUNhY2hlIiwiYWxsIiwiQ29uZmlnIiwiYXBwbGljYXRpb25JZCIsImN1c3RvbUlkcyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJjdXN0b21JZFJlZ0V4IiwiYXV0b0lkUmVnRXgiLCJ1c2VySWRSZWdFeCIsIndhdGNoIiwicmVsb2FkRGF0YSIsImNsZWFyQ2FjaGUiLCJvcHRpb25zIiwicmVsb2FkRGF0YVByb21pc2UiLCJnZXRBbGxDbGFzc2VzIiwidGhlbiIsImVyciIsInNldEFsbENsYXNzZXMiLCJjYWNoZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsInB1dCIsImdldE9uZVNjaGVtYSIsImFsbG93Vm9sYXRpbGVDbGFzc2VzIiwiY2xlYXIiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiZXJyb3IiLCJhZGFwdGVyU2NoZW1hIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwibWFpbnRlbmFuY2UiLCJzcGxpdCIsImZpZWxkTmFtZVRvVmFsaWRhdGUiLCJjaGFyQXQiLCJzdWJzdHJpbmciLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZCAoYWxsb3dlZCBmb3IgcHJvdGVjdGVkIGZpZWxkcyBvbmx5KVxuY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IGF1dGhlbnRpY2F0ZWRSZWdleCA9IC9eYXV0aGVudGljYXRlZCQvO1xuXG5jb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXggPSAvXnJlcXVpcmVzQXV0aGVudGljYXRpb24kLztcblxuY29uc3QgY2xwUG9pbnRlclJlZ2V4ID0gL15wb2ludGVyRmllbGRzJC87XG5cbi8vIHJlZ2V4IGZvciB2YWxpZGF0aW5nIGVudGl0aWVzIGluIHByb3RlY3RlZEZpZWxkcyBvYmplY3RcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIGF1dGhlbnRpY2F0ZWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbi8vIGNscCByZWdleFxuY29uc3QgY2xwRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgY2xwUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIGNscEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCBkZXBlbmRzIG9uIHN0YXJ0dXAgb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgcHJvdGVjdGVkRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIHJlZ2V4IGRlcGVuZHMgb24gbGF1bmNoIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBvciBbZW50aXR5XTogYm9vbGVhblxuICAgICAgY29uc3QgcGVybWl0ID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgIGlmIChwZXJtaXQgIT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybWl0fScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX06JHtwZXJtaXR9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uOiBhbnksIG9wZXJhdGlvbktleTogc3RyaW5nKSB7XG4gIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShvcGVyYXRpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIGFycmF5YFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRpb24gPT09ICdvYmplY3QnICYmIG9wZXJhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgLy8gb2sgdG8gcHJvY2VlZFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIG9iamVjdGBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkczogT2JqZWN0LCBvcGVyYXRpb246IHN0cmluZykge1xuICAvLyBVc2VzIGNvbGxlY3Rpb24gc2NoZW1hIHRvIGVuc3VyZSB0aGUgZmllbGQgaXMgb2YgdHlwZTpcbiAgLy8gLSBQb2ludGVyPF9Vc2VyPiAocG9pbnRlcnMpXG4gIC8vIC0gQXJyYXlcbiAgLy9cbiAgLy8gICAgSXQncyBub3QgcG9zc2libGUgdG8gZW5mb3JjZSB0eXBlIG9uIEFycmF5J3MgaXRlbXMgaW4gc2NoZW1hXG4gIC8vICBzbyB3ZSBhY2NlcHQgYW55IEFycmF5IGZpZWxkLCBhbmQgbGF0ZXIgd2hlbiBhcHBseWluZyBwZXJtaXNzaW9uc1xuICAvLyAgb25seSBpdGVtcyB0aGF0IGFyZSBwb2ludGVycyB0byBfVXNlciBhcmUgY29uc2lkZXJlZC5cbiAgaWYgKFxuICAgICEoXG4gICAgICBmaWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgKChmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJyAmJiBmaWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICBmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdBcnJheScpXG4gICAgKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7ZmllbGROYW1lfScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUsIGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4vLyBtdXN0IG5vdCBiZSBhIHJlc2VydmVkIGtleVxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKGNsYXNzTmFtZSAmJiBjbGFzc05hbWUgIT09ICdfSG9va3MnKSB7XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsYXNzQW5kRmllbGRSZWdleC50ZXN0KGZpZWxkTmFtZSkgJiYgIWludmFsaWRDb2x1bW5zLmluY2x1ZGVzKGZpZWxkTmFtZSk7XG59XG5cbi8vIENoZWNrcyB0aGF0IGl0J3Mgbm90IHRyeWluZyB0byBjbG9iYmVyIG9uZSBvZiB0aGUgZGVmYXVsdCBmaWVsZHMgb2YgdGhlIGNsYXNzLlxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbnZhbGlkIEpTT04nKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcykpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUudGFyZ2V0Q2xhc3MgIT09IG9iamVjdFR5cGUudGFyZ2V0Q2xhc3MpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCB0eXBlVG9TdHJpbmcgPSAodHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cbiAgaWYgKHR5cGUudGFyZ2V0Q2xhc3MpIHtcbiAgICByZXR1cm4gYCR7dHlwZS50eXBlfTwke3R5cGUudGFyZ2V0Q2xhc3N9PmA7XG4gIH1cbiAgcmV0dXJuIGAke3R5cGUudHlwZX1gO1xufTtcblxuLy8gU3RvcmVzIHRoZSBlbnRpcmUgc2NoZW1hIG9mIHRoZSBhcHAgaW4gYSB3ZWlyZCBoeWJyaWQgZm9ybWF0IHNvbWV3aGVyZSBiZXR3ZWVuXG4vLyB0aGUgbW9uZ28gZm9ybWF0IGFuZCB0aGUgUGFyc2UgZm9ybWF0LiBTb29uLCB0aGlzIHdpbGwgYWxsIGJlIFBhcnNlIGZvcm1hdC5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaGVtYUNvbnRyb2xsZXIge1xuICBfZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hRGF0YTogeyBbc3RyaW5nXTogU2NoZW1hIH07XG4gIHJlbG9hZERhdGFQcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgdXNlcklkUmVnRXg6IFJlZ0V4cDtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyKSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKFNjaGVtYUNhY2hlLmFsbCgpLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgdGhpcy5wcm90ZWN0ZWRGaWVsZHMgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpLnByb3RlY3RlZEZpZWxkcztcblxuICAgIGNvbnN0IGN1c3RvbUlkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkuYWxsb3dDdXN0b21PYmplY3RJZDtcblxuICAgIGNvbnN0IGN1c3RvbUlkUmVnRXggPSAvXi57MSx9JC91OyAvLyAxKyBjaGFyc1xuICAgIGNvbnN0IGF1dG9JZFJlZ0V4ID0gL15bYS16QS1aMC05XXsxLH0kLztcblxuICAgIHRoaXMudXNlcklkUmVnRXggPSBjdXN0b21JZHMgPyBjdXN0b21JZFJlZ0V4IDogYXV0b0lkUmVnRXg7XG5cbiAgICB0aGlzLl9kYkFkYXB0ZXIud2F0Y2goKCkgPT4ge1xuICAgICAgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbG9hZERhdGEob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICh0aGlzLnJlbG9hZERhdGFQcm9taXNlICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnJlbG9hZERhdGFQcm9taXNlID0gdGhpcy5nZXRBbGxDbGFzc2VzKG9wdGlvbnMpXG4gICAgICAudGhlbihcbiAgICAgICAgYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoYWxsU2NoZW1hcywgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKCk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gIH1cblxuICBnZXRBbGxDbGFzc2VzKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5hbGwoKTtcbiAgICBpZiAoY2FjaGVkICYmIGNhY2hlZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLnB1dChhbGxTY2hlbWFzKTtcbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgaWYgKGFsbG93Vm9sYXRpbGVDbGFzc2VzICYmIHZvbGF0aWxlQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkge1xuICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgaW5kZXhlczogZGF0YS5pbmRleGVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCkudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChzY2hlbWEgPT4gc2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFzeW5jIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhZGFwdGVyU2NoZW1hID0gYXdhaXQgdGhpcy5fZGJBZGFwdGVyLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKGFkYXB0ZXJTY2hlbWEpO1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiZcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdLnR5cGUgIT09IGZpZWxkLnR5cGUgJiZcbiAgICAgICAgICAgIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0XG4gICAgICAgICAgLy8gaGF2ZSBmYWlsZWQgYmVjYXVzZSB0aGVyZSdzIGEgcmFjZSBjb25kaXRpb24gYW5kIGEgZGlmZmVyZW50XG4gICAgICAgICAgLy8gY2xpZW50IGlzIG1ha2luZyB0aGUgZXhhY3Qgc2FtZSBzY2hlbWEgdXBkYXRlIHRoYXQgd2Ugd2FudC5cbiAgICAgICAgICAvLyBTbyBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hLlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNjaGVtYSBub3cgdmFsaWRhdGVzXG4gICAgICAgICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgc3RpbGwgZG9lc24ndCB2YWxpZGF0ZS4gR2l2ZSB1cFxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdzY2hlbWEgY2xhc3MgbmFtZSBkb2VzIG5vdCByZXZhbGlkYXRlJyk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55KTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIFtdKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGZpZWxkVHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlLnJlcXVpcmVkKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ3JlcXVpcmVkJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMsIHRoaXMudXNlcklkUmVnRXgpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBhc3luYyBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgICBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgcGVybXMpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIGNhY2hlZC5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBwZXJtcztcbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3QgaWYgdGhlIHByb3ZpZGVkIGNsYXNzTmFtZS1maWVsZE5hbWUtdHlwZSB0dXBsZSBpcyB2YWxpZC5cbiAgLy8gVGhlIGNsYXNzTmFtZSBtdXN0IGFscmVhZHkgYmUgdmFsaWRhdGVkLlxuICAvLyBJZiAnZnJlZXplJyBpcyB0cnVlLCByZWZ1c2UgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIHRoaXMgZmllbGQuXG4gIGVuZm9yY2VGaWVsZEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcgfCBTY2hlbWFGaWVsZCxcbiAgICBpc1ZhbGlkYXRpb24/OiBib29sZWFuLFxuICAgIG1haW50ZW5hbmNlPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBsZXQgZmllbGROYW1lVG9WYWxpZGF0ZSA9IGAke2ZpZWxkTmFtZX1gO1xuICAgIGlmIChtYWludGVuYW5jZSAmJiBmaWVsZE5hbWVUb1ZhbGlkYXRlLmNoYXJBdCgwKSA9PT0gJ18nKSB7XG4gICAgICBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gZmllbGROYW1lVG9WYWxpZGF0ZS5zdWJzdHJpbmcoMSk7XG4gICAgfVxuICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWVUb1ZhbGlkYXRlLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnksIG1haW50ZW5hbmNlOiBib29sZWFuKSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAndGhlcmUgY2FuIG9ubHkgYmUgb25lIGdlb3BvaW50IGZpZWxkIGluIGEgY2xhc3MnXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmICghZXhwZWN0ZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnQUNMJykge1xuICAgICAgICAvLyBFdmVyeSBvYmplY3QgaGFzIEFDTCBpbXBsaWNpdGx5LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHByb21pc2VzLnB1c2goc2NoZW1hLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgZXhwZWN0ZWQsIHRydWUsIG1haW50ZW5hbmNlKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnMud3JpdGVbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gVGVzdHMgdGhhdCB0aGUgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbiBsZXQgcGFzcyB0aGUgb3BlcmF0aW9uIGZvciBhIGdpdmVuIGFjbEdyb3VwXG4gIHN0YXRpYyB0ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9uczogP2FueSwgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgYWN0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGlmIChTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgLy8gSWYgb25seSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGFuIGFjbEdyb3VwXG4gICAgaWYgKHBlcm1zWydyZXF1aXJlc0F1dGhlbnRpY2F0aW9uJ10pIHtcbiAgICAgIC8vIElmIGFjbEdyb3VwIGhhcyAqIChwdWJsaWMpXG4gICAgICBpZiAoIWFjbEdyb3VwIHx8IGFjbEdyb3VwLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYWNsR3JvdXAuaW5kZXhPZignKicpID4gLTEgJiYgYWNsR3JvdXAubGVuZ3RoID09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gcmVxdWlyZXNBdXRoZW50aWNhdGlvbiBwYXNzZWQsIGp1c3QgbW92ZSBmb3J3YXJkXG4gICAgICAvLyBwcm9iYWJseSB3b3VsZCBiZSB3aXNlIGF0IHNvbWUgcG9pbnQgdG8gcmVuYW1lIHRvICdhdXRoZW50aWNhdGVkVXNlcidcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICAvLyBObyBtYXRjaGluZyBDTFAsIGxldCdzIGNoZWNrIHRoZSBQb2ludGVyIHBlcm1pc3Npb25zXG4gICAgLy8gQW5kIGhhbmRsZSB0aG9zZSBsYXRlclxuICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICAvLyBSZWplY3QgY3JlYXRlIHdoZW4gd3JpdGUgbG9ja2Rvd25cbiAgICBpZiAocGVybWlzc2lvbkZpZWxkID09ICd3cml0ZVVzZXJGaWVsZHMnICYmIG9wZXJhdGlvbiA9PSAnY3JlYXRlJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICApO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgdmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nLCBhY3Rpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb24sXG4gICAgICBhY3Rpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiYgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZXhwZWN0ZWQgdHlwZSBmb3IgYSBjbGFzc05hbWUra2V5IGNvbWJpbmF0aW9uXG4gIC8vIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2NoZW1hIGlzIG5vdCBzZXRcbiAgZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZyk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGV4cGVjdGVkVHlwZSA9PT0gJ21hcCcgPyAnT2JqZWN0JyA6IGV4cGVjdGVkVHlwZTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIENoZWNrcyBpZiBhIGdpdmVuIGNsYXNzIGlzIGluIHRoZSBzY2hlbWEuXG4gIGhhc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKCkudGhlbigoKSA9PiAhIXRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBuZXcgU2NoZW1hLlxuY29uc3QgbG9hZCA9IChkYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBhbnkpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+ID0+IHtcbiAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYUNvbnRyb2xsZXIoZGJBZGFwdGVyKTtcbiAgcmV0dXJuIHNjaGVtYS5yZWxvYWREYXRhKG9wdGlvbnMpLnRoZW4oKCkgPT4gc2NoZW1hKTtcbn07XG5cbi8vIEJ1aWxkcyBhIG5ldyBzY2hlbWEgKGluIHNjaGVtYSBBUEkgcmVzcG9uc2UgZm9ybWF0KSBvdXQgb2YgYW5cbi8vIGV4aXN0aW5nIG1vbmdvIHNjaGVtYSArIGEgc2NoZW1hcyBBUEkgcHV0IHJlcXVlc3QuIFRoaXMgcmVzcG9uc2Vcbi8vIGRvZXMgbm90IGluY2x1ZGUgdGhlIGRlZmF1bHQgZmllbGRzLCBhcyBpdCBpcyBpbnRlbmRlZCB0byBiZSBwYXNzZWRcbi8vIHRvIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS4gTm8gdmFsaWRhdGlvbiBpcyBkb25lIGhlcmUsIGl0XG4vLyBpcyBkb25lIGluIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS5cbmZ1bmN0aW9uIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzOiBTY2hlbWFGaWVsZHMsIHB1dFJlcXVlc3Q6IGFueSk6IFNjaGVtYUZpZWxkcyB7XG4gIGNvbnN0IG5ld1NjaGVtYSA9IHt9O1xuICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgY29uc3Qgc3lzU2NoZW1hRmllbGQgPVxuICAgIE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zKS5pbmRleE9mKGV4aXN0aW5nRmllbGRzLl9pZCkgPT09IC0xXG4gICAgICA/IFtdXG4gICAgICA6IE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zW2V4aXN0aW5nRmllbGRzLl9pZF0pO1xuICBmb3IgKGNvbnN0IG9sZEZpZWxkIGluIGV4aXN0aW5nRmllbGRzKSB7XG4gICAgaWYgKFxuICAgICAgb2xkRmllbGQgIT09ICdfaWQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ0FDTCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAndXBkYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdjcmVhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ29iamVjdElkJ1xuICAgICkge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihvbGRGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZmllbGRJc0RlbGV0ZWQgPSBwdXRSZXF1ZXN0W29sZEZpZWxkXSAmJiBwdXRSZXF1ZXN0W29sZEZpZWxkXS5fX29wID09PSAnRGVsZXRlJztcbiAgICAgIGlmICghZmllbGRJc0RlbGV0ZWQpIHtcbiAgICAgICAgbmV3U2NoZW1hW29sZEZpZWxkXSA9IGV4aXN0aW5nRmllbGRzW29sZEZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBuZXdGaWVsZCBpbiBwdXRSZXF1ZXN0KSB7XG4gICAgaWYgKG5ld0ZpZWxkICE9PSAnb2JqZWN0SWQnICYmIHB1dFJlcXVlc3RbbmV3RmllbGRdLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG5ld0ZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBuZXdTY2hlbWFbbmV3RmllbGRdID0gcHV0UmVxdWVzdFtuZXdGaWVsZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXdTY2hlbWE7XG59XG5cbi8vIEdpdmVuIGEgc2NoZW1hIHByb21pc2UsIGNvbnN0cnVjdCBhbm90aGVyIHNjaGVtYSBwcm9taXNlIHRoYXRcbi8vIHZhbGlkYXRlcyB0aGlzIGZpZWxkIG9uY2UgdGhlIHNjaGVtYSBsb2Fkcy5cbmZ1bmN0aW9uIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhzY2hlbWFQcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpIHtcbiAgcmV0dXJuIHNjaGVtYVByb21pc2UudGhlbihzY2hlbWEgPT4ge1xuICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfSk7XG59XG5cbi8vIEdldHMgdGhlIHR5cGUgZnJvbSBhIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3QsIHdoZXJlICd0eXBlJyBpc1xuLy8gZXh0ZW5kZWQgcGFzdCBqYXZhc2NyaXB0IHR5cGVzIHRvIGluY2x1ZGUgdGhlIHJlc3Qgb2YgdGhlIFBhcnNlXG4vLyB0eXBlIHN5c3RlbS5cbi8vIFRoZSBvdXRwdXQgc2hvdWxkIGJlIGEgdmFsaWQgc2NoZW1hIHZhbHVlLlxuLy8gVE9ETzogZW5zdXJlIHRoYXQgdGhpcyBpcyBjb21wYXRpYmxlIHdpdGggdGhlIGZvcm1hdCB1c2VkIGluIE9wZW4gREJcbmZ1bmN0aW9uIGdldFR5cGUob2JqOiBhbnkpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGNvbnN0IHR5cGUgPSB0eXBlb2Ygb2JqO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiAnQm9vbGVhbic7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiAnU3RyaW5nJztcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmopO1xuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICdiYWQgb2JqOiAnICsgb2JqO1xuICB9XG59XG5cbi8vIFRoaXMgZ2V0cyB0aGUgdHlwZSBmb3Igbm9uLUpTT04gdHlwZXMgbGlrZSBwb2ludGVycyBhbmQgZmlsZXMsIGJ1dFxuLy8gYWxzbyBnZXRzIHRoZSBhcHByb3ByaWF0ZSB0eXBlIGZvciAkIG9wZXJhdG9ycy5cbi8vIFJldHVybnMgbnVsbCBpZiB0aGUgdHlwZSBpcyB1bmtub3duLlxuZnVuY3Rpb24gZ2V0T2JqZWN0VHlwZShvYmopOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGlmIChvYmogaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiAnQXJyYXknO1xuICB9XG4gIGlmIChvYmouX190eXBlKSB7XG4gICAgc3dpdGNoIChvYmouX190eXBlKSB7XG4gICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgaWYgKG9iai5uYW1lKSB7XG4gICAgICAgICAgcmV0dXJuICdGaWxlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICBpZiAob2JqLmlzbykge1xuICAgICAgICAgIHJldHVybiAnRGF0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgIGlmIChvYmoubGF0aXR1ZGUgIT0gbnVsbCAmJiBvYmoubG9uZ2l0dWRlICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgaWYgKG9iai5iYXNlNjQpIHtcbiAgICAgICAgICByZXR1cm4gJ0J5dGVzJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgICBpZiAob2JqLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgcmV0dXJuICdQb2x5Z29uJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCAnVGhpcyBpcyBub3QgYSB2YWxpZCAnICsgb2JqLl9fdHlwZSk7XG4gIH1cbiAgaWYgKG9ialsnJG5lJ10pIHtcbiAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmpbJyRuZSddKTtcbiAgfVxuICBpZiAob2JqLl9fb3ApIHtcbiAgICBzd2l0Y2ggKG9iai5fX29wKSB7XG4gICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgcmV0dXJuICdBcnJheSc7XG4gICAgICBjYXNlICdBZGRSZWxhdGlvbic6XG4gICAgICBjYXNlICdSZW1vdmVSZWxhdGlvbic6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLm9iamVjdHNbMF0uY2xhc3NOYW1lLFxuICAgICAgICB9O1xuICAgICAgY2FzZSAnQmF0Y2gnOlxuICAgICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmoub3BzWzBdKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93ICd1bmV4cGVjdGVkIG9wOiAnICsgb2JqLl9fb3A7XG4gICAgfVxuICB9XG4gIHJldHVybiAnT2JqZWN0Jztcbn1cblxuZXhwb3J0IHtcbiAgbG9hZCxcbiAgY2xhc3NOYW1lSXNWYWxpZCxcbiAgZmllbGROYW1lSXNWYWxpZCxcbiAgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UsXG4gIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0LFxuICBzeXN0ZW1DbGFzc2VzLFxuICBkZWZhdWx0Q29sdW1ucyxcbiAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSxcbiAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgU2NoZW1hQ29udHJvbGxlcixcbiAgcmVxdWlyZWRDb2x1bW5zLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBa0JBLElBQUFBLGVBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFlBQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLG1CQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxPQUFBLEdBQUFGLHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBSyxTQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFBZ0MsU0FBQUUsdUJBQUFJLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxNQUFBLEVBQUFDLGNBQUEsUUFBQUMsSUFBQSxHQUFBQyxNQUFBLENBQUFELElBQUEsQ0FBQUYsTUFBQSxPQUFBRyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLE9BQUEsR0FBQUYsTUFBQSxDQUFBQyxxQkFBQSxDQUFBSixNQUFBLEdBQUFDLGNBQUEsS0FBQUksT0FBQSxHQUFBQSxPQUFBLENBQUFDLE1BQUEsV0FBQUMsR0FBQSxXQUFBSixNQUFBLENBQUFLLHdCQUFBLENBQUFSLE1BQUEsRUFBQU8sR0FBQSxFQUFBRSxVQUFBLE9BQUFQLElBQUEsQ0FBQVEsSUFBQSxDQUFBQyxLQUFBLENBQUFULElBQUEsRUFBQUcsT0FBQSxZQUFBSCxJQUFBO0FBQUEsU0FBQVUsY0FBQUMsTUFBQSxhQUFBQyxDQUFBLE1BQUFBLENBQUEsR0FBQUMs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