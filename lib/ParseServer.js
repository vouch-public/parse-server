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
addParseCloud(); // ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html

class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options); // Set option defaults


    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      security,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete
    } = options; // Initialize the node client SDK automatically

    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController); // Note: Tests will start to fail if any validation happens after this is called.

    databaseController.performInitialization().then(() => hooksController.load()).then(() => {
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
    } = options; // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

    var api = express(); //api.use("/apps", express.static(__dirname + "/public"));

    api.use(middlewares.allowCrossDomain(appId)); // File handling needs to be before default middlewares are applied

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
    api.use(middlewares.handleParseErrors); // run the following when not testing

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
      }); // verify the server url after a 'mount' event is received

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
          console.log('>>', response);
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
  } // Reserved Characters


  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;

    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  } // Backwards compatibility


  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])])); // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.

    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  } // Merge protectedFields options with defaults.


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
} // Those can't be tested as it requires a subprocess

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwic2VjdXJpdHkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwic2VydmVyU3RhcnRDb21wbGV0ZSIsImluaXRpYWxpemUiLCJhbGxDb250cm9sbGVycyIsImNvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJsb2dnZXJDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicHV0IiwiT2JqZWN0IiwiYXNzaWduIiwibG9nZ2luZyIsInNldExvZ2dlciIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsInRoZW4iLCJsb2FkIiwiY2F0Y2giLCJlcnJvciIsImNvbnNvbGUiLCJwcm9jZXNzIiwiZXhpdCIsInJlc29sdmUiLCJjd2QiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJwcm9taXNlcyIsImFkYXB0ZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJwdXNoIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJjYWNoZUNvbnRyb2xsZXIiLCJsZW5ndGgiLCJQcm9taXNlIiwiYWxsIiwic2VydmVyQ2xvc2VDb21wbGV0ZSIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJwYWdlcyIsImFwaSIsInVzZSIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJyZXMiLCJqc29uIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJ0eXBlIiwibGltaXQiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiZW52IiwiVEVTVElORyIsIm9uIiwiZXJyIiwiY29kZSIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsInZlcmlmeVNlcnZlclVybCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwicm91dGVycyIsIkNsYXNzZXNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsIlNlc3Npb25zUm91dGVyIiwiUm9sZXNSb3V0ZXIiLCJBbmFseXRpY3NSb3V0ZXIiLCJJbnN0YWxsYXRpb25zUm91dGVyIiwiRnVuY3Rpb25zUm91dGVyIiwiU2NoZW1hc1JvdXRlciIsIlB1c2hSb3V0ZXIiLCJMb2dzUm91dGVyIiwiSUFQVmFsaWRhdGlvblJvdXRlciIsIkZlYXR1cmVzUm91dGVyIiwiR2xvYmFsQ29uZmlnUm91dGVyIiwiR3JhcGhRTFJvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJTZWN1cml0eVJvdXRlciIsInJvdXRlcyIsInJlZHVjZSIsIm1lbW8iLCJyb3V0ZXIiLCJjb25jYXQiLCJQcm9taXNlUm91dGVyIiwibW91bnRPbnRvIiwic3RhcnQiLCJjYWxsYmFjayIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsInNlcnZlciIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJyZXF1ZXN0IiwidXJsIiwicmVwbGFjZSIsInJlc3BvbnNlIiwiZGF0YSIsImxvZyIsIndhcm4iLCJQYXJzZUNsb3VkIiwiQ2xvdWQiLCJnbG9iYWwiLCJrZXlzIiwiZGVmYXVsdHMiLCJmb3JFYWNoIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwicmVnZXgiLCJtYXRjaCIsInVzZXJTZW5zaXRpdmVGaWVsZHMiLCJBcnJheSIsImZyb20iLCJTZXQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJfVXNlciIsImMiLCJjdXIiLCJyIiwidW5xIiwibWFzdGVyS2V5SXBzIiwic29ja2V0cyIsInNvY2tldCIsInNvY2tldElkIiwicmVtb3RlQWRkcmVzcyIsInJlbW90ZVBvcnQiLCJkZXN0cm95QWxpdmVDb25uZWN0aW9ucyIsImRlc3Ryb3kiLCJlIiwic3Rkb3V0IiwiY2xvc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFXQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7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LEdBQXZCLEdBQTZCRixNQUFNLENBQUNHLFVBQXJEO0FBQ0FKLElBQUFBLE9BQU8sQ0FBQ0UsUUFBRCxDQUFQLEdBQW9CRCxNQUFwQjtBQUNBQSxJQUFBQSxNQUFNLENBQUNsRyxFQUFQLENBQVUsT0FBVixFQUFtQixNQUFNO0FBQ3ZCLGFBQU9pRyxPQUFPLENBQUNFLFFBQUQsQ0FBZDtBQUNELEtBRkQ7QUFHRCxHQU5EOztBQVFBLFFBQU1HLHVCQUF1QixHQUFHLFlBQVk7QUFDMUMsU0FBSyxNQUFNSCxRQUFYLElBQXVCRixPQUF2QixFQUFnQztBQUM5QixVQUFJO0FBQ0ZBLFFBQUFBLE9BQU8sQ0FBQ0UsUUFBRCxDQUFQLENBQWtCSSxPQUFsQjtBQUNELE9BRkQsQ0FFRSxPQUFPQyxDQUFQLEVBQVU7QUFDVjtBQUNEO0FBQ0Y7QUFDRixHQVJEOztBQVVBLFFBQU0vSSxjQUFjLEdBQUcsWUFBWTtBQUNqQ1YsSUFBQUEsT0FBTyxDQUFDMEosTUFBUixDQUFlckcsS0FBZixDQUFxQiw2Q0FBckI7QUFDQWtHLElBQUFBLHVCQUF1QjtBQUN2QmhELElBQUFBLE1BQU0sQ0FBQ29ELEtBQVA7QUFDQTNDLElBQUFBLFdBQVcsQ0FBQ3RHLGNBQVo7QUFDRCxHQUxEOztBQU1BVixFQUFBQSxPQUFPLENBQUNpRCxFQUFSLENBQVcsU0FBWCxFQUFzQnZDLGNBQXRCO0FBQ0FWLEVBQUFBLE9BQU8sQ0FBQ2lELEVBQVIsQ0FBVyxRQUFYLEVBQXFCdkMsY0FBckI7QUFDRDs7ZUFFYzNDLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHsgcGFyc2UgfSA9IHJlcXVpcmUoJ2dyYXBocWwnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgR3JhcGhRTFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9HcmFwaFFMUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUGFnZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUGFnZXNSb3V0ZXInO1xuaW1wb3J0IHsgUHVibGljQVBJUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1YmxpY0FQSVJvdXRlcic7XG5pbXBvcnQgeyBQdXNoUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1c2hSb3V0ZXInO1xuaW1wb3J0IHsgQ2xvdWRDb2RlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0Nsb3VkQ29kZVJvdXRlcic7XG5pbXBvcnQgeyBSb2xlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Sb2xlc1JvdXRlcic7XG5pbXBvcnQgeyBTY2hlbWFzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfSBmcm9tICcuL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXInO1xuaW1wb3J0ICogYXMgY29udHJvbGxlcnMgZnJvbSAnLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcbmltcG9ydCB7IFNlY3VyaXR5Um91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1NlY3VyaXR5Um91dGVyJztcbmltcG9ydCBDaGVja1J1bm5lciBmcm9tICcuL1NlY3VyaXR5L0NoZWNrUnVubmVyJztcbmltcG9ydCBEZXByZWNhdG9yIGZyb20gJy4vRGVwcmVjYXRvci9EZXByZWNhdG9yJztcblxuLy8gTXV0YXRlIHRoZSBQYXJzZSBvYmplY3QgdG8gYWRkIHRoZSBDbG91ZCBDb2RlIGhhbmRsZXJzXG5hZGRQYXJzZUNsb3VkKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0aGUgcGFyc2Ugc2VydmVyIGluaXRpYWxpemF0aW9uIG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIC8vIFNjYW4gZm9yIGRlcHJlY2F0ZWQgUGFyc2UgU2VydmVyIG9wdGlvbnNcbiAgICBEZXByZWNhdG9yLnNjYW5QYXJzZVNlcnZlck9wdGlvbnMob3B0aW9ucyk7XG4gICAgLy8gU2V0IG9wdGlvbiBkZWZhdWx0c1xuICAgIGluamVjdERlZmF1bHRzKG9wdGlvbnMpO1xuICAgIGNvbnN0IHtcbiAgICAgIGFwcElkID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYW4gYXBwSWQhJyksXG4gICAgICBtYXN0ZXJLZXkgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIG1hc3RlcktleSEnKSxcbiAgICAgIGNsb3VkLFxuICAgICAgc2VjdXJpdHksXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgeyBsb2dnZXJDb250cm9sbGVyLCBkYXRhYmFzZUNvbnRyb2xsZXIsIGhvb2tzQ29udHJvbGxlciB9ID0gYWxsQ29udHJvbGxlcnM7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG5cbiAgICBsb2dnaW5nLnNldExvZ2dlcihsb2dnZXJDb250cm9sbGVyKTtcblxuICAgIC8vIE5vdGU6IFRlc3RzIHdpbGwgc3RhcnQgdG8gZmFpbCBpZiBhbnkgdmFsaWRhdGlvbiBoYXBwZW5zIGFmdGVyIHRoaXMgaXMgY2FsbGVkLlxuICAgIGRhdGFiYXNlQ29udHJvbGxlclxuICAgICAgLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpXG4gICAgICAudGhlbigoKSA9PiBob29rc0NvbnRyb2xsZXIubG9hZCgpKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmIChjbG91ZCkge1xuICAgICAgYWRkUGFyc2VDbG91ZCgpO1xuICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjbG91ZChQYXJzZSk7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IFwiYXJndW1lbnQgJ2Nsb3VkJyBtdXN0IGVpdGhlciBiZSBhIHN0cmluZyBvciBhIGZ1bmN0aW9uXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlY3VyaXR5ICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICBuZXcgQ2hlY2tSdW5uZXIob3B0aW9ucy5zZWN1cml0eSkucnVuKCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0IGFwcCgpIHtcbiAgICBpZiAoIXRoaXMuX2FwcCkge1xuICAgICAgdGhpcy5fYXBwID0gUGFyc2VTZXJ2ZXIuYXBwKHRoaXMuY29uZmlnKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2FwcDtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgY29uc3QgeyBhZGFwdGVyOiBkYXRhYmFzZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoZGF0YWJhc2VBZGFwdGVyICYmIHR5cGVvZiBkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGZpbGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXI7XG4gICAgaWYgKGZpbGVBZGFwdGVyICYmIHR5cGVvZiBmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChmaWxlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBjYWNoZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlcjtcbiAgICBpZiAoY2FjaGVBZGFwdGVyICYmIHR5cGVvZiBjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICByZXR1cm4gKHByb21pc2VzLmxlbmd0aCA+IDAgPyBQcm9taXNlLmFsbChwcm9taXNlcykgOiBQcm9taXNlLnJlc29sdmUoKSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgICB0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKG9wdGlvbnMpIHtcbiAgICBjb25zdCB7IG1heFVwbG9hZFNpemUgPSAnMjBtYicsIGFwcElkLCBkaXJlY3RBY2Nlc3MsIHBhZ2VzIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlclxuICAgICAgICA/IG5ldyBQYWdlc1JvdXRlcihwYWdlcykuZXhwcmVzc1JvdXRlcigpXG4gICAgICAgIDogbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBhcGkub24oJ21vdW50JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8IGRpcmVjdEFjY2Vzcykge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKSk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZWN1cml0eVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGlmIChvcHRpb25zLm1pZGRsZXdhcmUpIHtcbiAgICAgIGxldCBtaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLm1pZGRsZXdhcmUgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdGlvbnMubWlkZGxld2FyZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IG9wdGlvbnMubWlkZGxld2FyZTsgLy8gdXNlIGFzLWlzIGxldCBleHByZXNzIGZhaWxcbiAgICAgIH1cbiAgICAgIGFwcC51c2UobWlkZGxld2FyZSk7XG4gICAgfVxuXG4gICAgYXBwLnVzZShvcHRpb25zLm1vdW50UGF0aCwgdGhpcy5hcHApO1xuXG4gICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMID09PSB0cnVlIHx8IG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kID09PSB0cnVlKSB7XG4gICAgICBsZXQgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gdW5kZWZpbmVkO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHBhcnNlKGZzLnJlYWRGaWxlU3luYyhvcHRpb25zLmdyYXBoUUxTY2hlbWEsICd1dGY4JykpO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ29iamVjdCcgfHxcbiAgICAgICAgdHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IG9wdGlvbnMuZ3JhcGhRTFNjaGVtYTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlHcmFwaFFMKGFwcCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLm1vdW50UGxheWdyb3VuZCkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTZXJ2ZXIuYXBwbHlQbGF5Z3JvdW5kKGFwcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc2VydmVyID0gYXBwLmxpc3RlbihvcHRpb25zLnBvcnQsIG9wdGlvbnMuaG9zdCwgY2FsbGJhY2spO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIHN0YXJ0KG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucywgY2FsbGJhY2s6ID8oKSA9PiB2b2lkKSB7XG4gICAgY29uc3QgcGFyc2VTZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gICAgcmV0dXJuIHBhcnNlU2VydmVyLnN0YXJ0KG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZUxpdmVRdWVyeVNlcnZlcn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gIH1cblxuICBzdGF0aWMgdmVyaWZ5U2VydmVyVXJsKGNhbGxiYWNrKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJy4vcmVxdWVzdCcpO1xuICAgICAgcmVxdWVzdCh7IHVybDogUGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJykgKyAnL2hlYWx0aCcgfSlcbiAgICAgICAgLmNhdGNoKHJlc3BvbnNlID0+IHJlc3BvbnNlKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwgIWpzb24gfHwgKGpzb24gJiYganNvbi5zdGF0dXMgIT09ICdvaycpKSB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnPj4nLCByZXNwb25zZSlcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuV0FSTklORywgYXBwSWQgdGhhdCBjb250YWlucyBzcGVjaWFsIGNoYXJhY3RlcnMgY2FuIGNhdXNlIGlzc3VlcyB3aGlsZSB1c2luZyB3aXRoIHVybHMuXFxuYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICBpZiAob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzKSB7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICFwcm9jZXNzLmVudi5URVNUSU5HICYmXG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5ERVBSRUNBVEVEOiB1c2VyU2Vuc2l0aXZlRmllbGRzIGhhcyBiZWVuIHJlcGxhY2VkIGJ5IHByb3RlY3RlZEZpZWxkcyBhbGxvd2luZyB0aGUgYWJpbGl0eSB0byBwcm90ZWN0IGZpZWxkcyBpbiBhbGwgY2xhc3NlcyB3aXRoIENMUC4gXFxuYFxuICAgICAgKTtcbiAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cblxuICAgIGNvbnN0IHVzZXJTZW5zaXRpdmVGaWVsZHMgPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLCAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKV0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oeyBfVXNlcjogW10gfSwgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLCAuLi51c2VyU2Vuc2l0aXZlRmllbGRzXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBvcHRpb25zLm1hc3RlcktleUlwcyA9IEFycmF5LmZyb20oXG4gICAgbmV3IFNldChvcHRpb25zLm1hc3RlcktleUlwcy5jb25jYXQoZGVmYXVsdHMubWFzdGVyS2V5SXBzLCBvcHRpb25zLm1hc3RlcktleUlwcykpXG4gICk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl19