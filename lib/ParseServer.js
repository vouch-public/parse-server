"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      security,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete,
      schema
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController);

    // Note: Tests will start to fail if any validation happens after this is called.
    databaseController.performInitialization().then(() => hooksController.load()).then(async () => {
      if (schema) {
        await new _DefinedSchemas.DefinedSchemas(schema, this.config).execute();
      }
      if (serverStartComplete) {
        serverStartComplete();
      }
    }).catch(error => {
      if (serverStartComplete) {
        serverStartComplete(error);
      } else {
        console.error(error);
        process.exit(1);
      }
    });
    if (cloud) {
      addParseCloud();
      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }
    if (security && security.enableCheck && security.enableCheckLog) {
      new _CheckRunner.default(options.security).run();
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }
  handleShutdown() {
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
  }

  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.json({
        status: 'ok'
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      api.on('mount', function () {
        ParseServer.verifyServerUrl();
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */
  start(options, callback) {
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }

      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = app.listen(options.port, options.host, callback);
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */
  static start(options, callback) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */
  static createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
  }
  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const request = require('./request');
      request({
        url: Parse.serverURL.replace(/\/$/, '') + '/health'
      }).catch(response => response).then(response => {
        const json = response.data || null;
        if (response.status !== 200 || !json || json && json.status !== 'ok') {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
          /* eslint-enable no-console */
          if (callback) {
            callback(false);
          }
        } else {
          if (callback) {
            callback(true);
          }
        }
      });
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  Object.defineProperty(Parse, 'Server', {
    get() {
      return _Config.default.get(Parse.applicationId);
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(_defaults.default.masterKeyIps, options.masterKeyIps)));
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsInJlcXVpcmVkUGFyYW1ldGVyIiwibWFzdGVyS2V5IiwiY2xvdWQiLCJzZWN1cml0eSIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJzZXJ2ZXJTdGFydENvbXBsZXRlIiwic2NoZW1hIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwidGhlbiIsImxvYWQiLCJEZWZpbmVkU2NoZW1hcyIsImV4ZWN1dGUiLCJjYXRjaCIsImVycm9yIiwiY29uc29sZSIsInByb2Nlc3MiLCJleGl0IiwicmVzb2x2ZSIsImN3ZCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInB1c2giLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImNhY2hlQ29udHJvbGxlciIsImxlbmd0aCIsIlByb21pc2UiLCJhbGwiLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwibWF4VXBsb2FkU2l6ZSIsImRpcmVjdEFjY2VzcyIsInBhZ2VzIiwiYXBpIiwidXNlIiwiYWxsb3dDcm9zc0RvbWFpbiIsIkZpbGVzUm91dGVyIiwiZXhwcmVzc1JvdXRlciIsInJlcSIsInJlcyIsImpzb24iLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsInR5cGUiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJhcHBSb3V0ZXIiLCJwcm9taXNlUm91dGVyIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbnYiLCJURVNUSU5HIiwib24iLCJlcnIiLCJjb2RlIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwidmVyaWZ5U2VydmVyVXJsIiwiUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyIsIkNvcmVNYW5hZ2VyIiwic2V0UkVTVENvbnRyb2xsZXIiLCJQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJTZWN1cml0eVJvdXRlciIsInJvdXRlcyIsInJlZHVjZSIsIm1lbW8iLCJyb3V0ZXIiLCJjb25jYXQiLCJQcm9taXNlUm91dGVyIiwibW91bnRPbnRvIiwic3RhcnQiLCJjYWxsYmFjayIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsInNlcnZlciIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJyZXF1ZXN0IiwidXJsIiwicmVwbGFjZSIsInJlc3BvbnNlIiwiZGF0YSIsIndhcm4iLCJQYXJzZUNsb3VkIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwic2V0IiwibmV3VmFsIiwiY29uZmlndXJhYmxlIiwiQ2xvdWQiLCJnbG9iYWwiLCJrZXlzIiwiZGVmYXVsdHMiLCJmb3JFYWNoIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicmVnZXgiLCJtYXRjaCIsInVzZXJTZW5zaXRpdmVGaWVsZHMiLCJBcnJheSIsImZyb20iLCJTZXQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfVXNlciIsImMiLCJjdXIiLCJyIiwidW5xIiwibWFzdGVyS2V5SXBzIiwic29ja2V0cyIsInNvY2tldCIsInNvY2tldElkIiwicmVtb3RlQWRkcmVzcyIsInJlbW90ZVBvcnQiLCJkZXN0cm95QWxpdmVDb25uZWN0aW9ucyIsImRlc3Ryb3kiLCJlIiwic3Rkb3V0IiwiY2xvc2UiXSwic291cmNlcyI6WyIuLi9zcmMvUGFyc2VTZXJ2ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICB7IHBhcnNlIH0gPSByZXF1aXJlKCdncmFwaHFsJyksXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyksXG4gIGZzID0gcmVxdWlyZSgnZnMnKTtcblxuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zLCBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJztcbmltcG9ydCAqIGFzIGxvZ2dpbmcgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0IHJlcXVpcmVkUGFyYW1ldGVyIGZyb20gJy4vcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IHsgQW5hbHl0aWNzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FuYWx5dGljc1JvdXRlcic7XG5pbXBvcnQgeyBDbGFzc2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmVhdHVyZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmVhdHVyZXNSb3V0ZXInO1xuaW1wb3J0IHsgRmlsZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRmlsZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Z1bmN0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBHbG9iYWxDb25maWdSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR2xvYmFsQ29uZmlnUm91dGVyJztcbmltcG9ydCB7IEdyYXBoUUxSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvR3JhcGhRTFJvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFBhZ2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1BhZ2VzUm91dGVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5pbXBvcnQgeyBTZWN1cml0eVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZWN1cml0eVJvdXRlcic7XG5pbXBvcnQgQ2hlY2tSdW5uZXIgZnJvbSAnLi9TZWN1cml0eS9DaGVja1J1bm5lcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBEZWZpbmVkU2NoZW1hcyB9IGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9EZWZpbmVkU2NoZW1hcyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBodHRwczovL3BhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9hcGkvbWFzdGVyL1BhcnNlU2VydmVyT3B0aW9ucy5odG1sXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuICAgIC8vIFNldCBvcHRpb24gZGVmYXVsdHNcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBjbG91ZCxcbiAgICAgIHNlY3VyaXR5LFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSxcbiAgICAgIHNjaGVtYSxcbiAgICB9ID0gb3B0aW9ucztcbiAgICAvLyBJbml0aWFsaXplIHRoZSBub2RlIGNsaWVudCBTREsgYXV0b21hdGljYWxseVxuICAgIFBhcnNlLmluaXRpYWxpemUoYXBwSWQsIGphdmFzY3JpcHRLZXkgfHwgJ3VudXNlZCcsIG1hc3RlcktleSk7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuXG4gICAgY29uc3QgYWxsQ29udHJvbGxlcnMgPSBjb250cm9sbGVycy5nZXRDb250cm9sbGVycyhvcHRpb25zKTtcblxuICAgIGNvbnN0IHsgbG9nZ2VyQ29udHJvbGxlciwgZGF0YWJhc2VDb250cm9sbGVyLCBob29rc0NvbnRyb2xsZXIgfSA9IGFsbENvbnRyb2xsZXJzO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuXG4gICAgbG9nZ2luZy5zZXRMb2dnZXIobG9nZ2VyQ29udHJvbGxlcik7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBkYXRhYmFzZUNvbnRyb2xsZXJcbiAgICAgIC5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKVxuICAgICAgLnRoZW4oKCkgPT4gaG9va3NDb250cm9sbGVyLmxvYWQoKSlcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIGF3YWl0IG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWEsIHRoaXMuY29uZmlnKS5leGVjdXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlcnZlclN0YXJ0Q29tcGxldGUpIHtcbiAgICAgICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAoY2xvdWQpIHtcbiAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2xvdWQoUGFyc2UpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgbmV3IENoZWNrUnVubmVyKG9wdGlvbnMuc2VjdXJpdHkpLnJ1bigpO1xuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IHsgYWRhcHRlcjogZGF0YWJhc2VBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGRhdGFiYXNlQWRhcHRlciAmJiB0eXBlb2YgZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBmaWxlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGlmIChmaWxlQWRhcHRlciAmJiB0eXBlb2YgZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogY2FjaGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgaWYgKGNhY2hlQWRhcHRlciAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwID8gUHJvbWlzZS5hbGwocHJvbWlzZXMpIDogUHJvbWlzZS5yZXNvbHZlKCkpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgICAgdGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdGF0aWNcbiAgICogQ3JlYXRlIGFuIGV4cHJlc3MgYXBwIGZvciB0aGUgcGFyc2Ugc2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGxldCB5b3Ugc3BlY2lmeSB0aGUgbWF4VXBsb2FkU2l6ZSB3aGVuIGNyZWF0aW5nIHRoZSBleHByZXNzIGFwcCAgKi9cbiAgc3RhdGljIGFwcChvcHRpb25zKSB7XG4gICAgY29uc3QgeyBtYXhVcGxvYWRTaXplID0gJzIwbWInLCBhcHBJZCwgZGlyZWN0QWNjZXNzLCBwYWdlcyB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdGF0dXM6ICdvaycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBib2R5UGFyc2VyLnVybGVuY29kZWQoeyBleHRlbmRlZDogZmFsc2UgfSksXG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXJcbiAgICAgICAgPyBuZXcgUGFnZXNSb3V0ZXIocGFnZXMpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICAgICA6IG5ldyBQdWJsaWNBUElSb3V0ZXIoKS5leHByZXNzUm91dGVyKClcbiAgICApO1xuXG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgbGV0IGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHVuZGVmaW5lZDtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnc3RyaW5nJykge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJzZShmcy5yZWFkRmlsZVN5bmMob3B0aW9ucy5ncmFwaFFMU2NoZW1hLCAndXRmOCcpKTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdvYmplY3QnIHx8XG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBvcHRpb25zLmdyYXBoUUxTY2hlbWE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHBhcnNlR3JhcGhRTFNlcnZlciA9IG5ldyBQYXJzZUdyYXBoUUxTZXJ2ZXIodGhpcywge1xuICAgICAgICBncmFwaFFMUGF0aDogb3B0aW9ucy5ncmFwaFFMUGF0aCxcbiAgICAgICAgcGxheWdyb3VuZFBhdGg6IG9wdGlvbnMucGxheWdyb3VuZFBhdGgsXG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5R3JhcGhRTChhcHApO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudFBsYXlncm91bmQpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5UGxheWdyb3VuZChhcHApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlciA9IGFwcC5saXN0ZW4ob3B0aW9ucy5wb3J0LCBvcHRpb25zLmhvc3QsIGNhbGxiYWNrKTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydChvcHRpb25zLCBjYWxsYmFjayk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VMaXZlUXVlcnlTZXJ2ZXJ9IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICB9XG5cbiAgc3RhdGljIHZlcmlmeVNlcnZlclVybChjYWxsYmFjaykge1xuICAgIC8vIHBlcmZvcm0gYSBoZWFsdGggY2hlY2sgb24gdGhlIHNlcnZlclVSTCB2YWx1ZVxuICAgIGlmIChQYXJzZS5zZXJ2ZXJVUkwpIHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIHJlcXVlc3QoeyB1cmw6IFBhcnNlLnNlcnZlclVSTC5yZXBsYWNlKC9cXC8kLywgJycpICsgJy9oZWFsdGgnIH0pXG4gICAgICAgIC5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8ICFqc29uIHx8IChqc29uICYmIGpzb24uc3RhdHVzICE9PSAnb2snKSkge1xuICAgICAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQYXJzZSwgJ1NlcnZlcicsIHtcbiAgICBnZXQoKSB7XG4gICAgICByZXR1cm4gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICB9LFxuICAgIHNldChuZXdWYWwpIHtcbiAgICAgIG5ld1ZhbC5hcHBJZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgICBDb25maWcucHV0KG5ld1ZhbCk7XG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBvcHRpb25zLm1hc3RlcktleUlwcyA9IEFycmF5LmZyb20oXG4gICAgbmV3IFNldChvcHRpb25zLm1hc3RlcktleUlwcy5jb25jYXQoZGVmYXVsdHMubWFzdGVyS2V5SXBzLCBvcHRpb25zLm1hc3RlcktleUlwcykpXG4gICk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBbUU7QUFBQTtBQUFBO0FBOUNuRTs7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxTQUFTLENBQUM7RUFDNUJDLFVBQVUsR0FBR0QsT0FBTyxDQUFDLGFBQWEsQ0FBQztFQUNuQ0UsT0FBTyxHQUFHRixPQUFPLENBQUMsU0FBUyxDQUFDO0VBQzVCRyxXQUFXLEdBQUdILE9BQU8sQ0FBQyxlQUFlLENBQUM7RUFDdENJLEtBQUssR0FBR0osT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDSSxLQUFLO0VBQ25DO0lBQUVDO0VBQU0sQ0FBQyxHQUFHTCxPQUFPLENBQUMsU0FBUyxDQUFDO0VBQzlCTSxJQUFJLEdBQUdOLE9BQU8sQ0FBQyxNQUFNLENBQUM7RUFDdEJPLEVBQUUsR0FBR1AsT0FBTyxDQUFDLElBQUksQ0FBQztBQXVDcEI7QUFDQVEsYUFBYSxFQUFFOztBQUVmO0FBQ0E7QUFDQSxNQUFNQyxXQUFXLENBQUM7RUFDaEI7QUFDRjtBQUNBO0FB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