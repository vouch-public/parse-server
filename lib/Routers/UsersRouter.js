"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UsersRouter = void 0;
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));
var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));
var _rest = _interopRequireDefault(require("../rest"));
var _Auth = _interopRequireDefault(require("../Auth"));
var _password = _interopRequireDefault(require("../password"));
var _triggers = require("../triggers");
var _middlewares = require("../middlewares");
var _RestWrite = _interopRequireDefault(require("../RestWrite"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
class UsersRouter extends _ClassesRouter.default {
  className() {
    return '_User';
  }

  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */
  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }

  /**
   * After retrieving a user directly from the database, we need to remove the
   * password from the object (for security), and fix an issue some SDKs have
   * with null values
   */
  _sanitizeAuthData(user) {
    delete user.password;

    // Sometimes the authData still has null on that keys
    // https://github.com/parse-community/parse-server/issues/935
    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });
      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }

  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */
  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;
      if (!payload.username && req.query && req.query.username || !payload.email && req.query && req.query.email) {
        payload = req.query;
      }
      const {
        username,
        email,
        password
      } = payload;

      // TODO: use the right error codes / descriptions.
      if (!username && !email) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'username/email is required.');
      }
      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'password is required.');
      }
      if (typeof password !== 'string' || email && typeof email !== 'string' || username && typeof username !== 'string') {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }
      let user;
      let isValidPassword = false;
      let query;
      if (email && username) {
        query = {
          email,
          username
        };
      } else if (email) {
        query = {
          email
        };
      } else {
        query = {
          $or: [{
            username
          }, {
            email: username
          }]
        };
      }
      return req.config.database.find('_User', query).then(results => {
        if (!results.length) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }
        return _password.default.compare(password, user.password);
      }).then(correct => {
        isValidPassword = correct;
        const accountLockoutPolicy = new _AccountLockout.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(() => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK
        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }
        this._sanitizeAuthData(user);
        return resolve(user);
      }).catch(error => {
        return reject(error);
      });
    });
  }
  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }
    const sessionToken = req.info.sessionToken;
    return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {
      include: 'user'
    }, req.info.clientSDK, req.info.context).then(response => {
      if (!response.results || response.results.length == 0 || !response.results[0].user) {
        throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      } else {
        const user = response.results[0].user;
        // Send token back on the login, because SDKs expect that.
        user.sessionToken = sessionToken;

        // Remove hidden properties.
        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }
  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);

    // handle password expiry policy
    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;
      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update('_User', {
          username: user.username
        }, {
          _password_changed_at: _node.default._encode(changedAt)
        });
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        }
        // Calculate the expiry time.
        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date())
          // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config);
    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password'
      },
      installationId: req.info.installationId
    });
    user.sessionToken = sessionData.sessionToken;
    await createSession();
    const afterLoginUser = _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user));
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
    return {
      response: user
    };
  }

  /**
   * This allows master-key clients to create user sessions without access to
   * user credentials. This enables systems that can authenticate access another
   * way (API key, app administrators) to act on a user's behalf.
   *
   * We create a new session rather than looking for an existing session; we
   * want this to work in situations where the user is logged out on all
   * devices, since this can be used by automated systems acting on the user's
   * behalf.
   *
   * For the moment, we're omitting event hooks and lockout checks, since
   * immediate use cases suggest /loginAs could be used for semantically
   * different reasons from /login
   */
  async handleLogInAs(req) {
    if (!req.auth.isMaster) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required');
    }
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'userId must not be empty, null, or undefined');
    }
    const queryResults = await req.config.database.find('_User', {
      objectId: userId
    });
    const user = queryResults[0];
    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'user not found');
    }
    this._sanitizeAuthData(user);
    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId,
      createdWith: {
        action: 'login',
        authProvider: 'masterkey'
      },
      installationId: req.info.installationId
    });
    user.sessionToken = sessionData.sessionToken;
    await createSession();
    return {
      response: user
    };
  }
  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req).then(user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      return {
        response: user
      };
    }).catch(error => {
      throw error;
    });
  }
  handleLogOut(req) {
    const success = {
      response: {}
    };
    if (req.info && req.info.sessionToken) {
      return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context).then(() => {
            this._runAfterLogoutTrigger(req, records.results[0]);
            return Promise.resolve(success);
          });
        }
        return Promise.resolve(success);
      });
    }
    return Promise.resolve(success);
  }
  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
      className: '_Session'
    }, session)), null, req.config);
  }
  _throwOnBadEmailConfig(req) {
    try {
      _Config.default.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }
  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);
    const {
      email
    } = req.body;
    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(() => {
      return Promise.resolve({
        response: {}
      });
    }, err => {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        // Return success so that this endpoint can't
        // be used to enumerate valid emails
        return Promise.resolve({
          response: {}
        });
      } else {
        throw err;
      }
    });
  }
  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);
    const {
      email
    } = req.body;
    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    return req.config.database.find('_User', {
      email: email
    }).then(results => {
      if (!results.length || results.length < 1) {
        throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }
      const user = results[0];

      // remove password field, messes with saving on postgres
      delete user.password;
      if (user.emailVerified) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }
      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return {
          response: {}
        };
      });
    });
  }
  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/loginAs', req => {
      return this.handleLogInAs(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
  }
}
exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiUmVzdFdyaXRlIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Vc2Vyc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keS51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBcUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRTlCLE1BQU1BLFdBQVcsU0FBU0Msc0JBQWEsQ0FBQztFQUM3Q0MsU0FBUyxHQUFHO0lBQ1YsT0FBTyxPQUFPO0VBQ2hCOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0VBQ0UsT0FBT0Msc0JBQXNCLENBQUNDLEdBQUcsRUFBRTtJQUNqQyxLQUFLLElBQUlDLEdBQUcsSUFBSUQsR0FBRyxFQUFFO01BQ25CLElBQUlFLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDQyxjQUFjLENBQUNDLElBQUksQ0FBQ0wsR0FBRyxFQUFFQyxHQUFHLENBQUMsRUFBRTtRQUNsRDtRQUNBLElBQUlBLEdBQUcsS0FBSyxRQUFRLElBQUksQ0FBQyx5QkFBeUIsQ0FBQ0ssSUFBSSxDQUFDTCxHQUFHLENBQUMsRUFBRTtVQUM1RCxPQUFPRCxHQUFHLENBQUNDLEdBQUcsQ0FBQztRQUNqQjtNQUNGO0lBQ0Y7RUFDRjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0VBQ0VNLGlCQUFpQixDQUFDQyxJQUFJLEVBQUU7SUFDdEIsT0FBT0EsSUFBSSxDQUFDQyxRQUFROztJQUVwQjtJQUNBO0lBQ0EsSUFBSUQsSUFBSSxDQUFDRSxRQUFRLEVBQUU7TUFDakJSLE1BQU0sQ0FBQ1MsSUFBSSxDQUFDSCxJQUFJLENBQUNFLFFBQVEsQ0FBQyxDQUFDRSxPQUFPLENBQUNDLFFBQVEsSUFBSTtRQUM3QyxJQUFJTCxJQUFJLENBQUNF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