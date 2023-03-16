"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = _interopRequireDefault(require("path-to-regexp"));
var _ipRangeCheck = _interopRequireDefault(require("ip-range-check"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
exports.DEFAULT_ALLOWED_HEADERS = DEFAULT_ALLOWED_HEADERS;
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }
  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }
  var fileViaJSON = false;
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if ((0, _ipRangeCheck.default)(clientIp, req.config.maintenanceKeyIps || [])) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !(0, _ipRangeCheck.default)(clientIp, req.config.masterKeyIps || [])) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });
  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth) {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';
  var match = header.toLowerCase().indexOf(authPrefix);
  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');
    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];
      var jsKeyPrefix = 'javascript-key=';
      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const allowOrigin = config && config.allowOrigin || '*';
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.default)(route.requestPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: request => {
        return request.config.ip;
      }
    })
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
    }
    throw e;
  });
}
function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}
function malformedContext(req, res) {
  res.status(400);
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfaXBSYW5nZUNoZWNrIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZSIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlwIiwiaXNNYWludGVuYW5jZSIsIl9yZXEkY29uZmlnIiwiaXBSYW5nZUNoZWNrIiwibWFpbnRlbmFuY2VLZXlJcHMiLCJhdXRoIiwiQXV0aCIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkZWZhdWx0TG9nZ2VyIiwiaXNNYXN0ZXIiLCJtYXN0ZXJLZXlJcHMiLCJfcmVxJGNvbmZpZzIiLCJoYW5kbGVSYXRlTGltaXQiLCJpc1JlYWRPbmx5TWFzdGVyIiwicmVhZE9ubHlNYXN0ZXJLZXkiLCJpc1JlYWRPbmx5Iiwia2V5cyIsIm9uZUtleUNvbmZpZ3VyZWQiLCJzb21lIiwia2V5IiwidW5kZWZpbmVkIiwib25lS2V5TWF0Y2hlcyIsInVzZXJGcm9tSldUIiwidXNlciIsInJhdGVMaW1pdHMiLCJQcm9taXNlIiwiYWxsIiwibWFwIiwibGltaXQiLCJwYXRoRXhwIiwiUmVnRXhwIiwicGF0aCIsInRlc3QiLCJoYW5kbGVyIiwiZXJyIiwiQ09OTkVDVElPTl9GQUlMRUQiLCJtZXNzYWdlIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwicmVxdWVzdEF1dGgiLCJpbmRleE9mIiwiZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJVTktOT1dOX0VSUk9SIiwiYXV0aG9yaXphdGlvbiIsImhlYWRlciIsImF1dGhQcmVmaXgiLCJtYXRjaCIsInRvTG93ZXJDYXNlIiwiZW5jb2RlZEF1dGgiLCJzdWJzdHJpbmciLCJjcmVkZW50aWFscyIsImRlY29kZUJhc2U2NCIsInNwbGl0IiwianNLZXlQcmVmaXgiLCJtYXRjaEtleSIsInN0ciIsImFsbG93Q3Jvc3NEb21haW4iLCJhbGxvd0hlYWRlcnMiLCJqb2luIiwiYWxsb3dPcmlnaW4iLCJtZXRob2QiLCJzZW5kU3RhdHVzIiwiYWxsb3dNZXRob2RPdmVycmlkZSIsIl9tZXRob2QiLCJvcmlnaW5hbE1ldGhvZCIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW5hYmxlRXhwcmVzc0Vycm9ySGFuZGxlciIsImh0dHBTdGF0dXMiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicHJvY2VzcyIsImVudiIsIlRFU1RJTkciLCJzdGFjayIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJlbmQiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyIsInJlcXVlc3QiLCJyZXNvbHZlIiwiYWRkUmF0ZUxpbWl0Iiwicm91dGUiLCJSYXRlTGltaXRPcHRpb25zIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJlcXVlc3RQYXRoIiwicmF0ZUxpbWl0Iiwid2luZG93TXMiLCJyZXF1ZXN0VGltZVdpbmRvdyIsIm1heCIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwicmVzcG9uc2UiLCJvcHRpb25zIiwic2tpcCIsIl9yZXF1ZXN0JGF1dGgiLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsImluY2x1ZGVNYXN0ZXJLZXkiLCJyZXF1ZXN0TWV0aG9kcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwicmVnRXhwIiwia2V5R2VuZXJhdG9yIiwicHV0IiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiZGF0YWJhc2UiLCJhZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIlBvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJyZXF1ZXN0SWQiLCJwYXRocyIsInR0bCIsImlkZW1wb3RlbmN5T3B0aW9ucyIsInJlcVBhdGgiLCJyZXBsYWNlIiwicmVnZXgiLCJjaGFyQXQiLCJleHBpcnlEYXRlIiwiRGF0ZSIsInNldFNlY29uZHMiLCJnZXRTZWNvbmRzIiwicmVzdCIsImNyZWF0ZSIsIm1hc3RlciIsInJlcUlkIiwiZXhwaXJlIiwiX2VuY29kZSIsImNhdGNoIiwiRFVQTElDQVRFX1ZBTFVFIiwiRFVQTElDQVRFX1JFUVVFU1QiLCJJTlZBTElEX0pTT04iXSwic291cmNlcyI6WyIuLi9zcmMvbWlkZGxld2FyZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IGF1dGggZnJvbSAnLi9BdXRoJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IENsaWVudFNESyBmcm9tICcuL0NsaWVudFNESyc7XG5pbXBvcnQgZGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuL3Jlc3QnO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHJhdGVMaW1pdCBmcm9tICdleHByZXNzLXJhdGUtbGltaXQnO1xuaW1wb3J0IHsgUmF0ZUxpbWl0T3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgcGF0aFRvUmVnZXhwIGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBpcFJhbmdlQ2hlY2sgZnJvbSAnaXAtcmFuZ2UtY2hlY2snO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICB2YXIgaW5mbyA9IHtcbiAgICBhcHBJZDogcmVxLmdldCgnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCcpLFxuICAgIHNlc3Npb25Ub2tlbjogcmVxLmdldCgnWC1QYXJzZS1TZXNzaW9uLVRva2VuJyksXG4gICAgbWFzdGVyS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1hc3Rlci1LZXknKSxcbiAgICBtYWludGVuYW5jZUtleTogcmVxLmdldCgnWC1QYXJzZS1NYWludGVuYW5jZS1LZXknKSxcbiAgICBpbnN0YWxsYXRpb25JZDogcmVxLmdldCgnWC1QYXJzZS1JbnN0YWxsYXRpb24tSWQnKSxcbiAgICBjbGllbnRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LUtleScpLFxuICAgIGphdmFzY3JpcHRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtSmF2YXNjcmlwdC1LZXknKSxcbiAgICBkb3ROZXRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtV2luZG93cy1LZXknKSxcbiAgICByZXN0QVBJS2V5OiByZXEuZ2V0KCdYLVBhcnNlLVJFU1QtQVBJLUtleScpLFxuICAgIGNsaWVudFZlcnNpb246IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LVZlcnNpb24nKSxcbiAgICBjb250ZXh0OiBjb250ZXh0LFxuICB9O1xuXG4gIHZhciBiYXNpY0F1dGggPSBodHRwQXV0aChyZXEpO1xuXG4gIGlmIChiYXNpY0F1dGgpIHtcbiAgICB2YXIgYmFzaWNBdXRoQXBwSWQgPSBiYXNpY0F1dGguYXBwSWQ7XG4gICAgaWYgKEFwcENhY2hlLmdldChiYXNpY0F1dGhBcHBJZCkpIHtcbiAgICAgIGluZm8uYXBwSWQgPSBiYXNpY0F1dGhBcHBJZDtcbiAgICAgIGluZm8ubWFzdGVyS2V5ID0gYmFzaWNBdXRoLm1hc3RlcktleSB8fCBpbmZvLm1hc3RlcktleTtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IGJhc2ljQXV0aC5qYXZhc2NyaXB0S2V5IHx8IGluZm8uamF2YXNjcmlwdEtleTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxLmJvZHkpIHtcbiAgICAvLyBVbml0eSBTREsgc2VuZHMgYSBfbm9Cb2R5IGtleSB3aGljaCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICAgIC8vIFVuY2xlYXIgYXQgdGhpcyBwb2ludCBpZiBhY3Rpb24gbmVlZHMgdG8gYmUgdGFrZW4uXG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9ub0JvZHk7XG4gIH1cblxuICB2YXIgZmlsZVZpYUpTT04gPSBmYWxzZTtcblxuICBpZiAoIWluZm8uYXBwSWQgfHwgIUFwcENhY2hlLmdldChpbmZvLmFwcElkKSkge1xuICAgIC8vIFNlZSBpZiB3ZSBjYW4gZmluZCB0aGUgYXBwIGlkIG9uIHRoZSBib2R5LlxuICAgIGlmIChyZXEuYm9keSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgLy8gVGhlIG9ubHkgY2hhbmNlIHRvIGZpbmQgdGhlIGFwcCBpZCBpcyBpZiB0aGlzIGlzIGEgZmlsZVxuICAgICAgLy8gdXBsb2FkIHRoYXQgYWN0dWFsbHkgaXMgYSBKU09OIGJvZHkuIFNvIHRyeSB0byBwYXJzZSBpdC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy82NTg5XG4gICAgICAvLyBJdCBpcyBhbHNvIHBvc3NpYmxlIHRoYXQgdGhlIGNsaWVudCBpcyB0cnlpbmcgdG8gdXBsb2FkIGEgZmlsZSBidXQgZm9yZ290XG4gICAgICAvLyB0byBwcm92aWRlIHgtcGFyc2UtYXBwLWlkIGluIGhlYWRlciBhbmQgcGFyc2UgYSBiaW5hcnkgZmlsZSB3aWxsIGZhaWxcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5ib2R5ID0gSlNPTi5wYXJzZShyZXEuYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGlmIChyZXEuYm9keS5fQ2xpZW50VmVyc2lvbikge1xuICAgICAgICBpbmZvLmNsaWVudFZlcnNpb24gPSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZCkge1xuICAgICAgICBpbmZvLmluc3RhbGxhdGlvbklkID0gcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fTWFzdGVyS2V5KSB7XG4gICAgICAgIGluZm8ubWFzdGVyS2V5ID0gcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQpIHtcbiAgICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0IGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgaW5mby5jb250ZXh0ID0gcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGluZm8uY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmJvZHkuX2NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpbmZvLmNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGluZm8uY2xpZW50VmVyc2lvbikge1xuICAgIGluZm8uY2xpZW50U0RLID0gQ2xpZW50U0RLLmZyb21TdHJpbmcoaW5mby5jbGllbnRWZXJzaW9uKTtcbiAgfVxuXG4gIGlmIChmaWxlVmlhSlNPTikge1xuICAgIHJlcS5maWxlRGF0YSA9IHJlcS5ib2R5LmZpbGVEYXRhO1xuICAgIC8vIFdlIG5lZWQgdG8gcmVwb3B1bGF0ZSByZXEuYm9keSB3aXRoIGEgYnVmZmVyXG4gICAgdmFyIGJhc2U2NCA9IHJlcS5ib2R5LmJhc2U2NDtcbiAgICByZXEuYm9keSA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgY2xpZW50SXAgPSBnZXRDbGllbnRJcChyZXEpO1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGluZm8uYXBwSWQsIG1vdW50KTtcbiAgaWYgKGNvbmZpZy5zdGF0ZSAmJiBjb25maWcuc3RhdGUgIT09ICdvaycpIHtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgZXJyb3I6IGBJbnZhbGlkIHNlcnZlciBzdGF0ZTogJHtjb25maWcuc3RhdGV9YCxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpbmZvLmFwcCA9IEFwcENhY2hlLmdldChpbmZvLmFwcElkKTtcbiAgcmVxLmNvbmZpZyA9IGNvbmZpZztcbiAgcmVxLmNvbmZpZy5oZWFkZXJzID0gcmVxLmhlYWRlcnMgfHwge307XG4gIHJlcS5jb25maWcuaXAgPSBjbGllbnRJcDtcbiAgcmVxLmluZm8gPSBpbmZvO1xuXG4gIGNvbnN0IGlzTWFpbnRlbmFuY2UgPVxuICAgIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXkgJiYgaW5mby5tYWludGVuYW5jZUtleSA9PT0gcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleTtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpZiAoaXBSYW5nZUNoZWNrKGNsaWVudElwLCByZXEuY29uZmlnLm1haW50ZW5hbmNlS2V5SXBzIHx8IFtdKSkge1xuICAgICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgaXNNYWludGVuYW5jZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFpbnRlbmFuY2Uga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21haW50ZW5hbmNlS2V5SXBzJy5gXG4gICAgKTtcbiAgfVxuXG4gIGxldCBpc01hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLm1hc3RlcktleTtcbiAgaWYgKGlzTWFzdGVyICYmICFpcFJhbmdlQ2hlY2soY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgfVxuXG4gIGlmIChpc01hc3Rlcikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgdmFyIGlzUmVhZE9ubHlNYXN0ZXIgPSBpbmZvLm1hc3RlcktleSA9PT0gcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleTtcbiAgaWYgKFxuICAgIHR5cGVvZiByZXEuY29uZmlnLnJlYWRPbmx5TWFzdGVyS2V5ICE9ICd1bmRlZmluZWQnICYmXG4gICAgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAmJlxuICAgIGlzUmVhZE9ubHlNYXN0ZXJcbiAgKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IHRydWUsXG4gICAgICBpc1JlYWRPbmx5OiB0cnVlLFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgLy8gQ2xpZW50IGtleXMgYXJlIG5vdCByZXF1aXJlZCBpbiBwYXJzZS1zZXJ2ZXIsIGJ1dCBpZiBhbnkgaGF2ZSBiZWVuIGNvbmZpZ3VyZWQgaW4gdGhlIHNlcnZlciwgdmFsaWRhdGUgdGhlbVxuICAvLyAgdG8gcHJlc2VydmUgb3JpZ2luYWwgYmVoYXZpb3IuXG4gIGNvbnN0IGtleXMgPSBbJ2NsaWVudEtleScsICdqYXZhc2NyaXB0S2V5JywgJ2RvdE5ldEtleScsICdyZXN0QVBJS2V5J107XG4gIGNvbnN0IG9uZUtleUNvbmZpZ3VyZWQgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZDtcbiAgfSk7XG4gIGNvbnN0IG9uZUtleU1hdGNoZXMgPSBrZXlzLnNvbWUoZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiByZXEuY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZCAmJiBpbmZvW2tleV0gPT09IHJlcS5jb25maWdba2V5XTtcbiAgfSk7XG5cbiAgaWYgKG9uZUtleUNvbmZpZ3VyZWQgJiYgIW9uZUtleU1hdGNoZXMpIHtcbiAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICB9XG5cbiAgaWYgKHJlcS51cmwgPT0gJy9sb2dpbicpIHtcbiAgICBkZWxldGUgaW5mby5zZXNzaW9uVG9rZW47XG4gIH1cblxuICBpZiAocmVxLnVzZXJGcm9tSldUKSB7XG4gICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgdXNlcjogcmVxLnVzZXJGcm9tSldULFxuICAgIH0pO1xuICAgIHJldHVybiBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xuICB9XG5cbiAgaWYgKCFpbmZvLnNlc3Npb25Ub2tlbikge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICB9KTtcbiAgfVxuICBoYW5kbGVSYXRlTGltaXQocmVxLCByZXMsIG5leHQpO1xufVxuXG5jb25zdCBoYW5kbGVSYXRlTGltaXQgPSBhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgY29uc3QgcmF0ZUxpbWl0cyA9IHJlcS5jb25maWcucmF0ZUxpbWl0cyB8fCBbXTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIHJhdGVMaW1pdHMubWFwKGFzeW5jIGxpbWl0ID0+IHtcbiAgICAgICAgY29uc3QgcGF0aEV4cCA9IG5ldyBSZWdFeHAobGltaXQucGF0aCk7XG4gICAgICAgIGlmIChwYXRoRXhwLnRlc3QocmVxLnVybCkpIHtcbiAgICAgICAgICBhd2FpdCBsaW1pdC5oYW5kbGVyKHJlcSwgcmVzLCBlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICAgICAgICAnQW4gdW5rbm93biBlcnJvciBvY2N1cmVkIHdoZW4gYXR0ZW1wdGluZyB0byBhcHBseSB0aGUgcmF0ZSBsaW1pdGVyOiAnLFxuICAgICAgICAgICAgICAgIGVyclxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmVzLnN0YXR1cyg0MjkpO1xuICAgIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlUGFyc2VTZXNzaW9uID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgaW5mbyA9IHJlcS5pbmZvO1xuICAgIGlmIChyZXEuYXV0aCkge1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcmVxdWVzdEF1dGggPSBudWxsO1xuICAgIGlmIChcbiAgICAgIGluZm8uc2Vzc2lvblRva2VuICYmXG4gICAgICByZXEudXJsID09PSAnL3VwZ3JhZGVUb1Jldm9jYWJsZVNlc3Npb24nICYmXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbi5pbmRleE9mKCdyOicpICE9IDBcbiAgICApIHtcbiAgICAgIHJlcXVlc3RBdXRoID0gYXdhaXQgYXV0aC5nZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBpbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmVxLmF1dGggPSByZXF1ZXN0QXV0aDtcbiAgICBuZXh0KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgIG5leHQoZXJyb3IpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBUT0RPOiBEZXRlcm1pbmUgdGhlIGNvcnJlY3QgZXJyb3Igc2NlbmFyaW8uXG4gICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLmVycm9yKCdlcnJvciBnZXR0aW5nIGF1dGggZm9yIHNlc3Npb25Ub2tlbicsIGVycm9yKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVU5LTk9XTl9FUlJPUiwgZXJyb3IpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBnZXRDbGllbnRJcChyZXEpIHtcbiAgcmV0dXJuIHJlcS5pcDtcbn1cblxuZnVuY3Rpb24gaHR0cEF1dGgocmVxKSB7XG4gIGlmICghKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb24pIHJldHVybjtcblxuICB2YXIgaGVhZGVyID0gKHJlcS5yZXEgfHwgcmVxKS5oZWFkZXJzLmF1dGhvcml6YXRpb247XG4gIHZhciBhcHBJZCwgbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5O1xuXG4gIC8vIHBhcnNlIGhlYWRlclxuICB2YXIgYXV0aFByZWZpeCA9ICdiYXNpYyAnO1xuXG4gIHZhciBtYXRjaCA9IGhlYWRlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YoYXV0aFByZWZpeCk7XG5cbiAgaWYgKG1hdGNoID09IDApIHtcbiAgICB2YXIgZW5jb2RlZEF1dGggPSBoZWFkZXIuc3Vic3RyaW5nKGF1dGhQcmVmaXgubGVuZ3RoLCBoZWFkZXIubGVuZ3RoKTtcbiAgICB2YXIgY3JlZGVudGlhbHMgPSBkZWNvZGVCYXNlNjQoZW5jb2RlZEF1dGgpLnNwbGl0KCc6Jyk7XG5cbiAgICBpZiAoY3JlZGVudGlhbHMubGVuZ3RoID09IDIpIHtcbiAgICAgIGFwcElkID0gY3JlZGVudGlhbHNbMF07XG4gICAgICB2YXIga2V5ID0gY3JlZGVudGlhbHNbMV07XG5cbiAgICAgIHZhciBqc0tleVByZWZpeCA9ICdqYXZhc2NyaXB0LWtleT0nO1xuXG4gICAgICB2YXIgbWF0Y2hLZXkgPSBrZXkuaW5kZXhPZihqc0tleVByZWZpeCk7XG4gICAgICBpZiAobWF0Y2hLZXkgPT0gMCkge1xuICAgICAgICBqYXZhc2NyaXB0S2V5ID0ga2V5LnN1YnN0cmluZyhqc0tleVByZWZpeC5sZW5ndGgsIGtleS5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWFzdGVyS2V5ID0ga2V5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGFwcElkOiBhcHBJZCwgbWFzdGVyS2V5OiBtYXN0ZXJLZXksIGphdmFzY3JpcHRLZXk6IGphdmFzY3JpcHRLZXkgfTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0KHN0cikge1xuICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAnYmFzZTY0JykudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93Q3Jvc3NEb21haW4oYXBwSWQpIHtcbiAgcmV0dXJuIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoYXBwSWQsIGdldE1vdW50Rm9yUmVxdWVzdChyZXEpKTtcbiAgICBsZXQgYWxsb3dIZWFkZXJzID0gREVGQVVMVF9BTExPV0VEX0hFQURFUlM7XG4gICAgaWYgKGNvbmZpZyAmJiBjb25maWcuYWxsb3dIZWFkZXJzKSB7XG4gICAgICBhbGxvd0hlYWRlcnMgKz0gYCwgJHtjb25maWcuYWxsb3dIZWFkZXJzLmpvaW4oJywgJyl9YDtcbiAgICB9XG4gICAgY29uc3QgYWxsb3dPcmlnaW4gPSAoY29uZmlnICYmIGNvbmZpZy5hbGxvd09yaWdpbikgfHwgJyonO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsIGFsbG93T3JpZ2luKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcpID0+IHtcbiAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uZmlnID0gQ29uZmlnLmdldChjb25maWcpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHJvdXRlKSB7XG4gICAgaWYgKCFSYXRlTGltaXRPcHRpb25zW2tleV0pIHtcbiAgICAgIHRocm93IGBJbnZhbGlkIHJhdGUgbGltaXQgb3B0aW9uIFwiJHtrZXl9XCJgO1xuICAgIH1cbiAgfVxuICBpZiAoIWNvbmZpZy5yYXRlTGltaXRzKSB7XG4gICAgY29uZmlnLnJhdGVMaW1pdHMgPSBbXTtcbiAgfVxuICBjb25maWcucmF0ZUxpbWl0cy5wdXNoKHtcbiAgICBwYXRoOiBwYXRoVG9SZWdleHAocm91dGUucmVxdWVzdFBhdGgpLFxuICAgIGhhbmRsZXI6IHJhdGVMaW1pdCh7XG4gICAgICB3aW5kb3dNczogcm91dGUucmVxdWVzdFRpbWVXaW5kb3csXG4gICAgICBtYXg6IHJvdXRlLnJlcXVlc3RDb3VudCxcbiAgICAgIG1lc3NhZ2U6IHJvdXRlLmVycm9yUmVzcG9uc2VNZXNzYWdlIHx8IFJhdGVMaW1pdE9wdGlvbnMuZXJyb3JSZXNwb25zZU1lc3NhZ2UuZGVmYXVsdCxcbiAgICAgIGhhbmRsZXI6IChyZXF1ZXN0LCByZXNwb25zZSwgbmV4dCwgb3B0aW9ucykgPT4ge1xuICAgICAgICB0aHJvdyB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuQ09OTkVDVElPTl9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogb3B0aW9ucy5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHNraXA6IHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5pcCA9PT0gJzEyNy4wLjAuMScgJiYgIXJvdXRlLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLmluY2x1ZGVNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnJlcXVlc3RNZXRob2RzKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocm91dGUucmVxdWVzdE1ldGhvZHMpKSB7XG4gICAgICAgICAgICBpZiAoIXJvdXRlLnJlcXVlc3RNZXRob2RzLmluY2x1ZGVzKHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChyb3V0ZS5yZXF1ZXN0TWV0aG9kcyk7XG4gICAgICAgICAgICBpZiAoIXJlZ0V4cC50ZXN0KHJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aD8uaXNNYXN0ZXI7XG4gICAgICB9LFxuICAgICAga2V5R2VuZXJhdG9yOiByZXF1ZXN0ID0+IHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmlwO1xuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIENvbmZpZy5wdXQoY29uZmlnKTtcbn07XG5cbi8qKlxuICogRGVkdXBsaWNhdGVzIGEgcmVxdWVzdCB0byBlbnN1cmUgaWRlbXBvdGVuY3kuIER1cGxpY2F0ZXMgYXJlIGRldGVybWluZWQgYnkgdGhlIHJlcXVlc3QgSURcbiAqIGluIHRoZSByZXF1ZXN0IGhlYWRlci4gSWYgYSByZXF1ZXN0IGhhcyBubyByZXF1ZXN0IElELCBpdCBpcyBleGVjdXRlZCBhbnl3YXkuXG4gKiBAcGFyYW0geyp9IHJlcSBUaGUgcmVxdWVzdCB0byBldmFsdWF0ZS5cbiAqIEByZXR1cm5zIFByb21pc2U8e30+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kocmVxKSB7XG4gIC8vIEVuYWJsZSBmZWF0dXJlIG9ubHkgZm9yIE1vbmdvREJcbiAgaWYgKFxuICAgICEoXG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyIHx8XG4gICAgICByZXEuY29uZmlnLmRhdGFiYXNlLmFkYXB0ZXIgaW5zdGFuY2VvZiBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gR2V0IHBhcmFtZXRlcnNcbiAgY29uc3QgY29uZmlnID0gcmVxLmNvbmZpZztcbiAgY29uc3QgcmVxdWVzdElkID0gKChyZXEgfHwge30pLmhlYWRlcnMgfHwge30pWyd4LXBhcnNlLXJlcXVlc3QtaWQnXTtcbiAgY29uc3QgeyBwYXRocywgdHRsIH0gPSBjb25maWcuaWRlbXBvdGVuY3lPcHRpb25zO1xuICBpZiAoIXJlcXVlc3RJZCB8fCAhY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSZXF1ZXN0IHBhdGggbWF5IGNvbnRhaW4gdHJhaWxpbmcgc2xhc2hlcywgZGVwZW5kaW5nIG9uIHRoZSBvcmlnaW5hbCByZXF1ZXN0LCBzbyByZW1vdmVcbiAgLy8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyB0byBtYWtlIGl0IGVhc2llciB0byBzcGVjaWZ5IHBhdGhzIGluIHRoZSBjb25maWd1cmF0aW9uXG4gIGNvbnN0IHJlcVBhdGggPSByZXEucGF0aC5yZXBsYWNlKC9eXFwvfFxcLyQvLCAnJyk7XG4gIC8vIERldGVybWluZSB3aGV0aGVyIGlkZW1wb3RlbmN5IGlzIGVuYWJsZWQgZm9yIGN1cnJlbnQgcmVxdWVzdCBwYXRoXG4gIGxldCBtYXRjaCA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHBhdGggb2YgcGF0aHMpIHtcbiAgICAvLyBBc3N1bWUgb25lIHdhbnRzIGEgcGF0aCB0byBhbHdheXMgbWF0Y2ggZnJvbSB0aGUgYmVnaW5uaW5nIHRvIHByZXZlbnQgYW55IG1pc3Rha2VzXG4gICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdGguY2hhckF0KDApID09PSAnXicgPyBwYXRoIDogJ14nICsgcGF0aCk7XG4gICAgaWYgKHJlcVBhdGgubWF0Y2gocmVnZXgpKSB7XG4gICAgICBtYXRjaCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBUcnkgdG8gc3RvcmUgcmVxdWVzdFxuICBjb25zdCBleHBpcnlEYXRlID0gbmV3IERhdGUobmV3IERhdGUoKS5zZXRTZWNvbmRzKG5ldyBEYXRlKCkuZ2V0U2Vjb25kcygpICsgdHRsKSk7XG4gIHJldHVybiByZXN0XG4gICAgLmNyZWF0ZShjb25maWcsIGF1dGgubWFzdGVyKGNvbmZpZyksICdfSWRlbXBvdGVuY3knLCB7XG4gICAgICByZXFJZDogcmVxdWVzdElkLFxuICAgICAgZXhwaXJlOiBQYXJzZS5fZW5jb2RlKGV4cGlyeURhdGUpLFxuICAgIH0pXG4gICAgLmNhdGNoKGUgPT4ge1xuICAgICAgaWYgKGUuY29kZSA9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9SRVFVRVNULCAnRHVwbGljYXRlIHJlcXVlc3QnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAzKTtcbiAgcmVzLmVuZCgne1wiZXJyb3JcIjpcInVuYXV0aG9yaXplZFwifScpO1xufVxuXG5mdW5jdGlvbiBtYWxmb3JtZWRDb250ZXh0KHJlcSwgcmVzKSB7XG4gIHJlcy5zdGF0dXMoNDAwKTtcbiAgcmVzLmpzb24oeyBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGVycm9yOiAnSW52YWxpZCBvYmplY3QgZm9yIGNvbnRleHQuJyB9KTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxLQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxLQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxVQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFB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