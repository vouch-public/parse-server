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
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cloud,
        security,
        schema,
        cacheAdapter,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      await hooksController.load();
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheAdapter !== null && cacheAdapter !== void 0 && cacheAdapter.connect && typeof cacheAdapter.connect === 'function') {
        startupPromises.push(cacheAdapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
            await (specifier => new Promise(r => r(`${specifier}`)).then(s => _interopRequireWildcard(require(s))))(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      console.error(error);
      this.config.state = 'error';
      throw error;
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
      pages,
      rateLimit = []
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
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
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
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
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
      api.on('mount', async function () {
        await new Promise(resolve => setTimeout(resolve, 1000));
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
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
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
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
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
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      var _response$headers;
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJiYXRjaCIsImJvZHlQYXJzZXIiLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsIkNvbmZpZyIsInB1dCIsImFzc2lnbiIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzdGFydCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJjYWNoZUFkYXB0ZXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiZSIsImNvZGUiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsImxvYWQiLCJzdGFydHVwUHJvbWlzZXMiLCJwdXNoIiwiRGVmaW5lZFNjaGVtYXMiLCJleGVjdXRlIiwiY29ubmVjdCIsIlByb21pc2UiLCJhbGwiLCJyZXNvbHZlIiwiX2pzb24iLCJqc29uIiwicHJvY2VzcyIsImVudiIsIm5wbV9wYWNrYWdlX2pzb24iLCJucG1fcGFja2FnZV90eXBlIiwidHlwZSIsInNwZWNpZmllciIsInIiLCJ0aGVuIiwicyIsImN3ZCIsInNldFRpbWVvdXQiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJlcnJvciIsImNvbnNvbGUiLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJwcm9taXNlcyIsImFkYXB0ZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImxlbmd0aCIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyb3V0ZXMiLCJBcnJheSIsImlzQXJyYXkiLCJyb3V0ZSIsImFkZFJhdGVMaW1pdCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsImV4aXQiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydEFwcCIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsInNlcnZlciIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJ0cnVzdFByb3h5IiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwiX3Jlc3BvbnNlJGhlYWRlcnMiLCJpc1ZhbGlkSHR0cFVybCIsInN0cmluZyIsInVybCIsIlVSTCIsIl8iLCJwcm90b2NvbCIsInJlcGxhY2UiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiY2F0Y2giLCJkYXRhIiwicmV0cnkiLCJoZWFkZXJzIiwiUGFyc2VDbG91ZCIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJjb25maWd1cmFibGUiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsImZvckVhY2giLCJyZWdleCIsIm1hdGNoIiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsImZyb20iLCJTZXQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfVXNlciIsImMiLCJjdXIiLCJ1bnEiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsInN0ZG91dCIsImNsb3NlIiwiX2RlZmF1bHQiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuICAgIG9wdGlvbnMuc3RhdGUgPSAnaW5pdGlhbGl6ZWQnO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGFsbENvbnRyb2xsZXJzLmxvZ2dlckNvbnRyb2xsZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyBQYXJzZSBTZXJ2ZXIgYXMgYW4gZXhwcmVzcyBhcHA7IHRoaXMgcHJvbWlzZSByZXNvbHZlcyB3aGVuIFBhcnNlIFNlcnZlciBpcyByZWFkeSB0byBhY2NlcHQgcmVxdWVzdHMuXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0KCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc3RhdGUgPT09ICdvaycpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdzdGFydGluZyc7XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgICBob29rc0NvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjYWNoZUFkYXB0ZXIsXG4gICAgICAgIGxpdmVRdWVyeUNvbnRyb2xsZXIsXG4gICAgICB9ID0gdGhpcy5jb25maWc7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGF3YWl0IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG4gICAgICBjb25zdCBzdGFydHVwUHJvbWlzZXMgPSBbXTtcbiAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobmV3IERlZmluZWRTY2hlbWFzKHNjaGVtYSwgdGhpcy5jb25maWcpLmV4ZWN1dGUoKSk7XG4gICAgICB9XG4gICAgICBpZiAoY2FjaGVBZGFwdGVyPy5jb25uZWN0ICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuY29ubmVjdCgpKTtcbiAgICAgIH1cbiAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGxpdmVRdWVyeUNvbnRyb2xsZXIuY29ubmVjdCgpKTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHN0YXJ0dXBQcm9taXNlcyk7XG4gICAgICBpZiAoY2xvdWQpIHtcbiAgICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKGNsb3VkKFBhcnNlKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIGxldCBqc29uO1xuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKSB7XG4gICAgICAgICAgICBqc29uID0gcmVxdWlyZShwcm9jZXNzLmVudi5ucG1fcGFja2FnZV9qc29uKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX3R5cGUgPT09ICdtb2R1bGUnIHx8IGpzb24/LnR5cGUgPT09ICdtb2R1bGUnKSB7XG4gICAgICAgICAgICBhd2FpdCBpbXBvcnQocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG4gICAgICB9XG4gICAgICBpZiAoc2VjdXJpdHkgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgJiYgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgICAgbmV3IENoZWNrUnVubmVyKHNlY3VyaXR5KS5ydW4oKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ29rJztcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzLCByYXRlTGltaXQgPSBbXSB9ID0gb3B0aW9ucztcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4oYXBwSWQpKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uIChyZXEsIHJlcykge1xuICAgICAgcmVzLnN0YXR1cyhvcHRpb25zLnN0YXRlID09PSAnb2snID8gMjAwIDogNTAzKTtcbiAgICAgIGlmIChvcHRpb25zLnN0YXRlID09PSAnc3RhcnRpbmcnKSB7XG4gICAgICAgIHJlcy5zZXQoJ1JldHJ5LUFmdGVyJywgMSk7XG4gICAgICB9XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShyYXRlTGltaXQpID8gcmF0ZUxpbWl0IDogW3JhdGVMaW1pdF07XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFkZFJhdGVMaW1pdChyb3V0ZSwgb3B0aW9ucyk7XG4gICAgfVxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IFBhcnNlU2VydmVyLnByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KTtcbiAgICBhcGkudXNlKGFwcFJvdXRlci5leHByZXNzUm91dGVyKCkpO1xuXG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUVycm9ycyk7XG5cbiAgICAvLyBydW4gdGhlIGZvbGxvd2luZyB3aGVuIG5vdCB0ZXN0aW5nXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICAvL1RoaXMgY2F1c2VzIHRlc3RzIHRvIHNwZXcgc29tZSB1c2VsZXNzIHdhcm5pbmdzLCBzbyBkaXNhYmxlIGluIHRlc3RcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGFwaS5vbignbW91bnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzLmVudi5QQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTID09PSAnMScgfHwgZGlyZWN0QWNjZXNzKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBHcmFwaFFMUm91dGVyKCksXG4gICAgICBuZXcgUHVyZ2VSb3V0ZXIoKSxcbiAgICAgIG5ldyBIb29rc1JvdXRlcigpLFxuICAgICAgbmV3IENsb3VkQ29kZVJvdXRlcigpLFxuICAgICAgbmV3IEF1ZGllbmNlc1JvdXRlcigpLFxuICAgICAgbmV3IEFnZ3JlZ2F0ZVJvdXRlcigpLFxuICAgICAgbmV3IFNlY3VyaXR5Um91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG5cbiAgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuc3RhcnQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBvbiBQYXJzZVNlcnZlci5zdGFydEFwcDogJywgZSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gYXdhaXQgUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICAgICAgb3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMudHJ1c3RQcm94eSkge1xuICAgICAgYXBwLnNldCgndHJ1c3QgcHJveHknLCBvcHRpb25zLnRydXN0UHJveHkpO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgc3RhcnRBcHAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0QXBwKG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3IgdGhlIGxpdmVRdWVyeVNlcnZlclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyBvcHRpb25zIGZvciB0aGUgUGFyc2VTZXJ2ZXJcbiAgICogQHJldHVybnMge1Byb21pc2U8UGFyc2VMaXZlUXVlcnlTZXJ2ZXI+fSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgaHR0cFNlcnZlcixcbiAgICBjb25maWc6IExpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zXG4gICkge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoeyB1cmwgfSkuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpO1xuICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgIGNvbnN0IHJldHJ5ID0gcmVzcG9uc2UuaGVhZGVycz8uWydyZXRyeS1hZnRlciddO1xuICAgICAgaWYgKHJldHJ5KSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCByZXRyeSAqIDEwMDApKTtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwganNvbj8uc3RhdHVzICE9PSAnb2snKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgcmV0dXJuIENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgfSxcbiAgICBzZXQobmV3VmFsKSB7XG4gICAgICBuZXdWYWwuYXBwSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgICAgQ29uZmlnLnB1dChuZXdWYWwpO1xuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICB9KTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBSZXNlcnZlZCBDaGFyYWN0ZXJzXG4gIGlmIChvcHRpb25zLmFwcElkKSB7XG4gICAgY29uc3QgcmVnZXggPSAvWyEjJCUnKCkqKyYvOjs9P0BbXFxde31eLHw8Pl0vZztcbiAgICBpZiAob3B0aW9ucy5hcHBJZC5tYXRjaChyZWdleCkpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJ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