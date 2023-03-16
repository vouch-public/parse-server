"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;
var _node = _interopRequireDefault(require("parse/node"));
var _logger = require("./logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
exports.Types = Types;
const ConnectClassName = '@Connect';
const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  const Functions = {};
  const Jobs = {};
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};
function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}
function validateClassNameForTriggers(className, type) {
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }
  if ((type === Types.beforeLogin || type === Types.afterLogin) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin and afterLogin triggers';
  }
  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }
  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }
  return className;
}
const _triggerStore = {};
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};
function getStore(category, name, applicationId) {
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];
  for (const component of path) {
    store = store[component];
    if (!store) {
      return undefined;
    }
  }
  return store;
}
function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }
  store[lastComponent] = handler;
}
function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}
function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  return store[lastComponent];
}
function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}
function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}
function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}
function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}
function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}
function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}
function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}
function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}
function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = _node.default.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  if (className) {
    toJSON.className = className;
  }
  return toJSON;
}
function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}
async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
}
function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}
function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}
function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];
  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];
      if (namespace) {
        name = `${namespace}.${name}`;
      }
      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };
  extractFunctionNames(null, store);
  return functionNames;
}
function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}
function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}
function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}
function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
  };
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.afterFind) {
    // Set a copy of the context on the request object.
    request.context = Object.assign({}, context);
  }
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    context: context || {}
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(object => {
          return toJSONwithObjects(object);
        });
        return resolve(response);
      }
      // Use the JSON response
      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }
      if (request.triggerName === Types.afterSave) {
        return resolve();
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
        response['object']['objectId'] = request.object.id;
      }
      return resolve(response);
    },
    error: function (error) {
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
    }
  };
}
function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}
function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}
function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query, context) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context);
    if (query) {
      request.query = query;
    }
    const {
      success,
      error
    } = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth, config.logLevels.triggerBeforeSuccess);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const response = trigger(request);
      if (response && typeof response.then === 'function') {
        return response.then(results => {
          return results;
        });
      }
      return response;
    }).then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth, config.logLevels.triggerAfter);
    return results;
  });
}
function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }
  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;
  if (restOptions) {
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
  return Promise.resolve().then(() => {
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }
    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;
    if (result && result instanceof _node.default.Query) {
      queryResult = result;
    }
    const jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }
    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }
    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }
    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }
    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }
    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
    }
    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }
    return {
      restWhere,
      restOptions
    };
  }, err => {
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}
function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }
  if (message instanceof _node.default.Error) {
    return message;
  }
  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }
  const error = new _node.default.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}
function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }
  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }
  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }
  let params = request.params || {};
  if (request.object) {
    params = request.object.toJSON();
  }
  const requiredParam = key => {
    const value = params[key];
    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };
  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
        throw opt.error || e.message || e;
      }
      return;
    }
    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }
    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };
  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };
  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionPromises = [];
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];
      if (typeof opt === 'string') {
        requiredParam(opt);
      }
      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;
          if (request.object) {
            request.object.set(key, val);
          }
        }
        if (opt.constant && request.object) {
          if (request.original) {
            request.object.revert(key);
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }
    await Promise.all(optionPromises);
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }
  const userKeys = options.requireUserKeys || [];
  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }
      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth, triggerType.startsWith('after') ? config.logLevels.triggerAfter : config.logLevels.triggerBeforeSuccess);
      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }
      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error, config.logLevels.triggerBeforeError);
      reject(error);
    });

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }
      const promise = trigger(request);
      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth, config.logLevels.triggerAfter);
      }
      // beforeSave is expected to return null (nothing)
      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }
            return null;
          });
        }
        return null;
      }
      return promise;
    }).then(success, error);
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node.default.Object.fromJSON(copy);
}
function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = _objectSpread(_objectSpread({}, fileObject), {}, {
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
  });
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const FileClassName = getClassName(_node.default.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return fileObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiZXhwb3J0cyIsIkNvbm5lY3RDbGFzc05hbWUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwicmVkdWNlIiwiYmFzZSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImFwcElkIiwidG9KU09Od2l0aE9iamVjdHMiLCJ0b0pTT04iLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsInZhbCIsIl90b0Z1bGxKU09OIiwiZ2V0VHJpZ2dlciIsInRyaWdnZXJUeXBlIiwicnVuVHJpZ2dlciIsInRyaWdnZXIiLCJyZXF1ZXN0IiwiYXV0aCIsIm1heWJlUnVuVmFsaWRhdG9yIiwic2tpcFdpdGhNYXN0ZXJLZXkiLCJ0cmlnZ2VyRXhpc3RzIiwiZ2V0RnVuY3Rpb24iLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lcyIsImV4dHJhY3RGdW5jdGlvbk5hbWVzIiwibmFtZXNwYWNlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJsb2dMZXZlbCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsInRyaWdnZXJBZnRlciIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwic2V0IiwiY29uc3RhbnQiLCJyZXZlcnQiLCJyZXF1aXJlZCIsIm9wdGlvbmFsIiwidmFsVHlwZSIsImFsbCIsInVzZXJSb2xlcyIsInJlcXVpcmVBbGxSb2xlcyIsInByb21pc2VzIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJyZXNvbHZlZFVzZXJSb2xlcyIsInJlc29sdmVkUmVxdWlyZUFsbCIsImhhc1JvbGUiLCJzb21lIiwicmVxdWlyZWRSb2xlIiwidXNlcktleXMiLCJyZXF1aXJlVXNlcktleXMiLCJtYXliZVJ1blRyaWdnZXIiLCJzdGFydHNXaXRoIiwidHJpZ2dlckJlZm9yZUVycm9yIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsIkZpbGVDbGFzc05hbWUiLCJGaWxlIiwiZmlsZVRyaWdnZXIiLCJmaWxlIiwiZmlsZVNpemUiXSwic291cmNlcyI6WyIuLi9zcmMvdHJpZ2dlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gdHJpZ2dlcnMuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dpbjogJ2FmdGVyTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlU2F2ZTogJ2JlZm9yZVNhdmUnLFxuICBhZnRlclNhdmU6ICdhZnRlclNhdmUnLFxuICBiZWZvcmVEZWxldGU6ICdiZWZvcmVEZWxldGUnLFxuICBhZnRlckRlbGV0ZTogJ2FmdGVyRGVsZXRlJyxcbiAgYmVmb3JlRmluZDogJ2JlZm9yZUZpbmQnLFxuICBhZnRlckZpbmQ6ICdhZnRlckZpbmQnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IENvbm5lY3RDbGFzc05hbWUgPSAnQENvbm5lY3QnO1xuXG5jb25zdCBiYXNlU3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IFZhbGlkYXRvcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuICBjb25zdCBGdW5jdGlvbnMgPSB7fTtcbiAgY29uc3QgSm9icyA9IHt9O1xuICBjb25zdCBMaXZlUXVlcnkgPSBbXTtcbiAgY29uc3QgVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICBGdW5jdGlvbnMsXG4gICAgSm9icyxcbiAgICBWYWxpZGF0b3JzLFxuICAgIFRyaWdnZXJzLFxuICAgIExpdmVRdWVyeSxcbiAgfSk7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpIHtcbiAgaWYgKHBhcnNlQ2xhc3MgJiYgcGFyc2VDbGFzcy5jbGFzc05hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIH1cbiAgaWYgKHBhcnNlQ2xhc3MgJiYgcGFyc2VDbGFzcy5uYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MubmFtZS5yZXBsYWNlKCdQYXJzZScsICdAJyk7XG4gIH1cbiAgcmV0dXJuIHBhcnNlQ2xhc3M7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKSB7XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmICgodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbikgJiYgY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gYW5kIGFmdGVyTG9naW4gdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QsIGNsYXNzTmFtZSkge1xuICBpZiAoIW9iamVjdCB8fCAhb2JqZWN0LnRvSlNPTikge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBjb25zdCB0b0pTT04gPSBvYmplY3QudG9KU09OKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhvYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcGVuZGluZykge1xuICAgIGNvbnN0IHZhbCA9IG9iamVjdC5nZXQoa2V5KTtcbiAgICBpZiAoIXZhbCB8fCAhdmFsLl90b0Z1bGxKU09OKSB7XG4gICAgICB0b0pTT05ba2V5XSA9IHZhbDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0b0pTT05ba2V5XSA9IHZhbC5fdG9GdWxsSlNPTigpO1xuICB9XG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9XG4gIHJldHVybiB0b0pTT047XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVHJpZ2dlcih0cmlnZ2VyLCBuYW1lLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBuYW1lLCBhdXRoKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuLy8gQ3JlYXRlcyB0aGUgcmVzcG9uc2Ugb2JqZWN0LCBhbmQgdXNlcyB0aGUgcmVxdWVzdCBvYmplY3QgdG8gcGFzcyBkYXRhXG4vLyBUaGUgQVBJIHdpbGwgY2FsbCB0aGlzIHdpdGggUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdHMsIHRoaXMgd2lsbFxuLy8gdHJhbnNmb3JtIHRoZW0gdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBleHBlY3RlZCBieSBDbG91ZCBDb2RlLlxuLy8gQW55IGNoYW5nZXMgbWFkZSB0byB0aGUgb2JqZWN0IGluIGEgYmVmb3JlU2F2ZSB3aWxsIGJlIGluY2x1ZGVkLlxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlc3BvbnNlT2JqZWN0KHJlcXVlc3QsIHJlc29sdmUsIHJlamVjdCkge1xuICByZXR1cm4ge1xuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gdG9KU09Od2l0aE9iamVjdHMob2JqZWN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJiByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J11bJ29iamVjdElkJ10gPSByZXF1ZXN0Lm9iamVjdC5pZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9LFxuICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyb3IsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgcmVqZWN0KGUpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgbG9nTGV2ZWwpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIHJlc3VsdCwgYXV0aCwgbG9nTGV2ZWwpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yLCBsb2dMZXZlbCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dFxuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZywgY29udGV4dCk7XG4gICAgaWYgKHF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcbiAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgICdBZnRlckZpbmQnLFxuICAgICAgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2UudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICApO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNvbnRleHQsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3RPYmplY3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0T2JqZWN0LnF1ZXJ5O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4cGxhaW4pIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4cGxhaW4gPSBqc29uUXVlcnkuZXhwbGFpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmhpbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmhpbnQgPSBqc29uUXVlcnkuaGludDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybiByZXNvbHZlKCk7XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgdHJpZ2dlclR5cGUuc3RhcnRzV2l0aCgnYWZ0ZXInKVxuICAgICAgICAgICAgPyBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICAgOiBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke3BhcnNlT2JqZWN0LmNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckFmdGVyXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKGRhdGEsIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkKSB7XG4gIGlmICghX3RyaWdnZXJTdG9yZSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZykge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIC4uLmZpbGVPYmplY3QsXG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGZpbGVPYmplY3QsIGNvbmZpZywgYXV0aCkge1xuICBjb25zdCBGaWxlQ2xhc3NOYW1lID0gZ2V0Q2xhc3NOYW1lKFBhcnNlLkZpbGUpO1xuICBjb25zdCBmaWxlVHJpZ2dlciA9IGdldFRyaWdnZXIoRmlsZUNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBmaWxlVHJpZ2dlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZyk7XG4gICAgICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVPYmplY3Q7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlVHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgKTtcbiAgICAgIHJldHVybiByZXN1bHQgfHwgZmlsZU9iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRCxPQUFBO0FBQWtDLFNBQUFELHVCQUFBRyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsTUFBQSxFQUFBQyxjQUFBLFFBQUFDLElBQUEsR0FBQUMsTUFBQSxDQUFBRCxJQUFBLENBQUFGLE1BQUEsT0FBQUcsTUFBQSxDQUFBQyxxQkFBQSxRQUFBQyxPQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQUosTUFBQSxHQUFBQyxjQUFBLEtBQUFJLE9BQUEsR0FBQUEsT0FBQSxDQUFBQyxNQUFBLFdBQUFDLEdBQUEsV0FBQUosTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixNQUFB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