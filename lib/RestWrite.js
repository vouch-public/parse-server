"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _SchemaController = require("./Controllers/SchemaController");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');
const Auth = require('./Auth');
const Utils = require('./Utils');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
var ClientSDK = require('./ClientSDK');
const util = require('util');
// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};
  if (action) {
    this.runOptions.action = action;
  }
  if (!query) {
    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }
      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  }
  this.checkProhibitedKeywords(data);

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable
  this.validSchemaController = null;
  this.pendingOps = {};
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    return this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }
  this.runOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());
  this.pendingOps = _objectSpread({}, pending);
  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;
    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    }
    // In the case that there is no permission for the operation, it throws an error
    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      this.data = response.object;
      // We should delete the objectId for an update write
      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
    this.checkProhibitedKeywords(this.data);
  });
};
RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  }

  // Cloud code gets a bit of extra data for its objects
  const extraData = {
    className: this.className
  };

  // Expand file objects
  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData);

  // no need to return a response
  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};
RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);
      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];
            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      };

      // Add default fields
      this.data.updatedAt = this.updatedAt;
      if (!this.query) {
        this.data.createdAt = this.updatedAt;

        // Only assign new objectId if we are creating new object
        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }
        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }
  return Promise.resolve();
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }
  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }
  if (this.data.authData && !Object.keys(this.data.authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Handle saving authData to {} or if authData doesn't exist
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }
  var authData = this.data.authData;
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    const canHandleAuthData = providers.reduce((canHandle, provider) => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return canHandle && (hasToken || providerAuthData == null);
    }, true);
    if (canHandleAuthData) {
      return this.handleAuthData(authData);
    }
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};
RestWrite.prototype.handleAuthDataValidation = function (authData) {
  const validations = Object.keys(authData).map(provider => {
    if (authData[provider] === null) {
      return Promise.resolve();
    }
    const validateAuthData = this.config.authDataManager.getValidatorForProvider(provider);
    const authProvider = (this.config.auth || {})[provider] || {};
    if (authProvider.enabled == null) {
      _Deprecator.default.logRuntimeDeprecation({
        usage: `auth.${provider}`,
        solution: `auth.${provider}.enabled: true`
      });
    }
    if (!validateAuthData || authProvider.enabled === false) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }
    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
};
RestWrite.prototype.findUsersWithAuthData = function (authData) {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider]) {
      return memo;
    }
    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  let findPromise = Promise.resolve([]);
  if (query.length > 0) {
    findPromise = this.config.database.find(this.className, {
      $or: query
    }, {});
  }
  return findPromise;
};
RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster) {
    return objects;
  }
  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    }
    // Regular users that have been locked out.
    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};
RestWrite.prototype.handleAuthData = function (authData) {
  let results;
  return this.findUsersWithAuthData(authData).then(async r => {
    results = this.filteredObjectsByACL(r);
    if (results.length == 1) {
      this.storage['authProvider'] = Object.keys(authData).join(',');
      const userResult = results[0];
      const mutatedAuthData = {};
      Object.keys(authData).forEach(provider => {
        const providerData = authData[provider];
        const userAuthData = userResult.authData[provider];
        if (!_lodash.default.isEqual(providerData, userAuthData)) {
          mutatedAuthData[provider] = providerData;
        }
      });
      const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
      let userId;
      if (this.query && this.query.objectId) {
        userId = this.query.objectId;
      } else if (this.auth && this.auth.user && this.auth.user.id) {
        userId = this.auth.user.id;
      }
      if (!userId || userId === userResult.objectId) {
        // no user making the call
        // OR the user making the call is the right one
        // Login with auth data
        delete results[0].password;

        // need to set the objectId first otherwise location has trailing undefined
        this.data.objectId = userResult.objectId;
        if (!this.query || !this.query.objectId) {
          // this a login call, no userId passed
          this.response = {
            response: userResult,
            location: this.location()
          };
          // Run beforeLogin hook before storing any updates
          // to authData on the db; changes to userResult
          // will be ignored.
          await this.runBeforeLoginTrigger(deepcopy(userResult));
        }

        // If we didn't change the auth data, just keep going
        if (!hasMutatedAuthData) {
          return;
        }
        // We have authData that is updated on login
        // that can happen when token are refreshed,
        // We should update the token and let the user in
        // We should only check the mutated keys
        return this.handleAuthDataValidation(mutatedAuthData).then(async () => {
          // IF we have a response, we'll skip the database operation / beforeSave / afterSave etc...
          // we need to set it up there.
          // We are supposed to have a response only on LOGIN with authData, so we skip those
          // If we're not logging in, but just updating the current user, we can safely skip that part
          if (this.response) {
            // Assign the new authData in the response
            Object.keys(mutatedAuthData).forEach(provider => {
              this.response.response.authData[provider] = mutatedAuthData[provider];
            });

            // Run the DB update directly, as 'master'
            // Just update the authData part
            // Then we're good for the user, early exit of sorts
            return this.config.database.update(this.className, {
              objectId: this.data.objectId
            }, {
              authData: mutatedAuthData
            }, {});
          }
        });
      } else if (userId) {
        // Trying to update auth data but users
        // are different
        if (userResult.objectId !== userId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        }
        // No auth data was mutated, just keep going
        if (!hasMutatedAuthData) {
          return;
        }
      }
    }
    return this.handleAuthDataValidation(authData).then(() => {
      if (results.length > 1) {
        // More than 1 user with the passed id's
        throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
      }
    });
  });
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }
  if (!this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }

  // Do not cleanup session if objectId is not set
  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new _RestQuery.default(this.config, Auth.master(this.config), '_Session', {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    }).execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }
  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }
    if (this.query) {
      this.storage['clearSessions'] = true;
      // Generate a new session only if the user requested
      if (!this.auth.isMaster) {
        this.storage['generateNewSession'] = true;
      }
    }
    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};
RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }
    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */
  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }
    return;
  });
};

/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/
RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  }
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Case insensitive match, see note above function.
  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }
    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      this.storage['sendVerificationEmail'] = true;
      this.config.userController.setEmailVerifyToken(this.data);
    }
  });
};
RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};
RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        return Promise.resolve();
      });
    }
  }
  return Promise.resolve();
};
RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }).then(results => {
      if (results.length != 1) {
        throw undefined;
      }
      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }
  return Promise.resolve();
};
RestWrite.prototype.createSessionTokenIfNeeded = function () {
  if (this.className !== '_User') {
    return;
  }
  // Don't generate session for updating user (this.query is set) unless authData exists
  if (this.query && !this.data.authData) {
    return;
  }
  // Don't generate new sessionToken if linking via sessionToken
  if (this.auth.user && this.data.authData) {
    return;
  }
  if (!this.storage['authProvider'] &&
  // signup call, with
  this.config.preventLoginWithUnverifiedEmail &&
  // no login without verification
  this.config.verifyUserEmails) {
    // verification is on
    return; // do not create the session token in that case!
  }

  return this.createSessionToken();
};
RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }
  if (this.storage['authProvider'] == null && this.data.authData) {
    this.storage['authProvider'] = Object.keys(this.data.authData).join(',');
  }
  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage['authProvider'] ? 'login' : 'signup',
      authProvider: this.storage['authProvider'] || 'password'
    },
    installationId: this.auth.installationId
  });
  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
  }
  return createSession();
};
RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    expiresAt: Parse._encode(expiresAt)
  };
  if (installationId) {
    sessionData.installationId = installationId;
  }
  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
};

// Delete email reset tokens if user is changing password or email.
RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }
  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};
RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  }
  // Destroy the sessions in 'Background'
  const {
    user,
    installationId,
    sessionToken
  } = this.data;
  if (!user || !installationId) {
    return;
  }
  if (!user.objectId) {
    return;
  }
  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail'];
    // Fire and forget!
    this.config.userController.sendVerificationEmail(this.data);
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }
  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
    if (!this.auth.isMaster) {
      this.query = {
        $and: [this.query, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  if (!this.query && !this.auth.isMaster) {
    const additionalSessionData = {};
    for (var key in this.data) {
      if (key === 'objectId' || key === 'user') {
        continue;
      }
      additionalSessionData[key] = this.data[key];
    }
    const {
      sessionData,
      createSession
    } = RestWrite.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });
    return createSession().then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }
  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }
  let installationId = this.data.installationId;

  // If data.installationId is not set and we're not master, we can lookup in auth
  if (!installationId && !this.auth.isMaster) {
    installationId = this.auth.installationId;
  }
  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  // Updating _Installation but not updating anything critical
  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }
  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
  const orQueries = [];
  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }
  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }
  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }
  if (orQueries.length == 0) {
    return;
  }
  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }
      if (result.installationId == installationId) {
        installationIdMatch = result;
      }
      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    });

    // Sanity checks when running a query
    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }
      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }
      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }
      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }
    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }
    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    }
    // need to specify deviceType only if it's new
    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };
        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }
        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          }
          // rethrow the error
          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          }
          // rethrow the error
          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }
          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            }
            // rethrow the error
            throw err;
          });
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });

  return promise;
};

// If we short-circuited the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};
RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }
  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
    if (this.config.liveQueryController) {
      this.config.liveQueryController.clearCachedRoles(this.auth.user);
    }
  }
  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
  }
  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.
  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }
  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;
    let defer = Promise.resolve();
    // if password history is enabled then save the current password to history
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        const user = results[0];
        let oldPasswords = [];
        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        }
        //n-1 passwords go into history including last password
        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }
        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }
    return defer.then(() => {
      // Run an update
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
        response.updatedAt = this.updatedAt;
        this._updateResponseWithData(response, this.data);
        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }

      // Quick check, if we were able to infer the duplicated field name
      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }

      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.
      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;
      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }
      this._updateResponseWithData(response, this.data);
      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);
  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  });

  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;
    if (jsonReturned) {
      this.pendingOps = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

// Returns an updated copy of the object
RestWrite.prototype.buildParseObjects = function () {
  var _this$query;
  const extraData = {
    className: this.className,
    objectId: (_this$query = this.query) === null || _this$query === void 0 ? void 0 : _this$query.objectId
  };
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];
  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }
  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
        }
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);
        if (typeof parentVal !== 'object') {
          parentVal = {};
        }
        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  const sanitized = this.sanitizedData();
  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }
  updatedObject.set(sanitized);
  return {
    updatedObject,
    originalObject
  };
};
RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;
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
};
RestWrite.prototype._updateResponseWithData = function (response, data) {
  const {
    updatedObject
  } = this.buildParseObjects();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(updatedObject._getStateIdentifier());
  for (const key in this.pendingOps) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }
  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];
  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }
  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }
    const value = response[key];
    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(data[key], value) || util.isDeepStrictEqual((this.originalData || {})[key], value)) {
      delete response[key];
    }
  }
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];
    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    }

    // Strips operations from responses
    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];
      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};
RestWrite.prototype.checkProhibitedKeywords = function (data) {
  if (this.config.requestKeywordDenylist) {
    // Scan request data for denied keywords
    for (const keyword of this.config.requestKeywordDenylist) {
      const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);
      if (match) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
      }
    }
  }
};
var _default = RestWrite;
exports.default = _default;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJ1dGlsIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwicmVzcG9uc2UiLCJ1cGRhdGVkQXQiLCJfZW5jb2RlIiwiRGF0ZSIsImlzbyIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsInBlbmRpbmdPcHMiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQiLCJ2YWxpZGF0ZVNjaGVtYSIsInNjaGVtYUNvbnRyb2xsZXIiLCJzZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkIiwidHJhbnNmb3JtVXNlciIsImV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzIiwiZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyIsInJ1bkRhdGFiYXNlT3BlcmF0aW9uIiwiY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQiLCJoYW5kbGVGb2xsb3d1cCIsInJ1bkFmdGVyU2F2ZVRyaWdnZXIiLCJjbGVhblVzZXJBdXRoRGF0YSIsImlzTWFzdGVyIiwiYWNsIiwidXNlciIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwiY29uY2F0IiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImluZGV4T2YiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJoYXNDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwibWFueSIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsImNyZWF0ZSIsInJlc3VsdCIsImxlbmd0aCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJvYmplY3QiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsInZhbHVlIiwia2V5IiwiaXNFcXVhbCIsInB1c2giLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsImNhbkhhbmRsZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiaGFuZGxlQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0aW9ucyIsIm1hcCIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiYXV0aFByb3ZpZGVyIiwiZW5hYmxlZCIsIkRlcHJlY2F0b3IiLCJsb2dSdW50aW1lRGVwcmVjYXRpb24iLCJ1c2FnZSIsInNvbHV0aW9uIiwiYWxsIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwibWVtbyIsInF1ZXJ5S2V5IiwiZmlsdGVyIiwicSIsImZpbmRQcm9taXNlIiwiJG9yIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiQUNMIiwicmVzdWx0cyIsInIiLCJqb2luIiwidXNlclJlc3VsdCIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJtYXRjaCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwidXNlckNvbnRyb2xsZXIiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwicGFzc3dvcmRQb2xpY3kiLCJfdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyIsIl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSIsInBvbGljeUVycm9yIiwidmFsaWRhdGlvbkVycm9yIiwiY29udGFpbnNVc2VybmFtZUVycm9yIiwicGF0dGVyblZhbGlkYXRvciIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5Iiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsImNvbXBhcmUiLCJjYXRjaCIsImVyciIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJleHBpcmVzQXQiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJhc3NpZ24iLCJhZGRPcHMiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJkZXN0cm95IiwicmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCIsInNlc3Npb25RdWVyeSIsImJpbmQiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiY2xlYXJDYWNoZWRSb2xlcyIsImlzVW5hdXRoZW50aWNhdGVkIiwiU0VTU0lPTl9NSVNTSU5HIiwiZG93bmxvYWQiLCJkb3dubG9hZE5hbWUiLCJuYW1lIiwiSU5WQUxJRF9BQ0wiLCJyZWFkIiwid3JpdGUiLCJtYXhQYXNzd29yZEFnZSIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiZGVmZXIiLCJNYXRoIiwibWF4Iiwic2hpZnQiLCJfdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJoYXNBZnRlclNhdmVIb29rIiwiYWZ0ZXJTYXZlIiwiaGFzTGl2ZVF1ZXJ5IiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJqc29uUmV0dXJuZWQiLCJfdG9GdWxsSlNPTiIsInRvSlNPTiIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwiSlNPTiIsInN0cmluZ2lmeSIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvUmVzdFdyaXRlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgUmVzdFdyaXRlIGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGFuIG9wZXJhdGlvblxuLy8gdGhhdCB3cml0ZXMgdG8gdGhlIGRhdGFiYXNlLlxuLy8gVGhpcyBjb3VsZCBiZSBlaXRoZXIgYSBcImNyZWF0ZVwiIG9yIGFuIFwidXBkYXRlXCIuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgZGVlcGNvcHkgPSByZXF1aXJlKCdkZWVwY29weScpO1xuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbnZhciBDbGllbnRTREsgPSByZXF1aXJlKCcuL0NsaWVudFNESycpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgcmVxdWlyZWRDb2x1bW5zIH0gZnJvbSAnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcblxuLy8gcXVlcnkgYW5kIGRhdGEgYXJlIGJvdGggcHJvdmlkZWQgaW4gUkVTVCBBUEkgZm9ybWF0LiBTbyBkYXRhXG4vLyB0eXBlcyBhcmUgZW5jb2RlZCBieSBwbGFpbiBvbGQgb2JqZWN0cy5cbi8vIElmIHF1ZXJ5IGlzIG51bGwsIHRoaXMgaXMgYSBcImNyZWF0ZVwiIGFuZCB0aGUgZGF0YSBpbiBkYXRhIHNob3VsZCBiZVxuLy8gY3JlYXRlZC5cbi8vIE90aGVyd2lzZSB0aGlzIGlzIGFuIFwidXBkYXRlXCIgLSB0aGUgb2JqZWN0IG1hdGNoaW5nIHRoZSBxdWVyeVxuLy8gc2hvdWxkIGdldCB1cGRhdGVkIHdpdGggZGF0YS5cbi8vIFJlc3RXcml0ZSB3aWxsIGhhbmRsZSBvYmplY3RJZCwgY3JlYXRlZEF0LCBhbmQgdXBkYXRlZEF0IGZvclxuLy8gZXZlcnl0aGluZy4gSXQgYWxzbyBrbm93cyB0byB1c2UgdHJpZ2dlcnMgYW5kIHNwZWNpYWwgbW9kaWZpY2F0aW9uc1xuLy8gZm9yIHRoZSBfVXNlciBjbGFzcy5cbmZ1bmN0aW9uIFJlc3RXcml0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcXVlcnksIGRhdGEsIG9yaWdpbmFsRGF0YSwgY2xpZW50U0RLLCBjb250ZXh0LCBhY3Rpb24pIHtcbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAnQ2Fubm90IHBlcmZvcm0gYSB3cml0ZSBvcGVyYXRpb24gd2hlbiB1c2luZyByZWFkT25seU1hc3RlcktleSdcbiAgICApO1xuICB9XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmF1dGggPSBhdXRoO1xuICB0aGlzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgdGhpcy5jbGllbnRTREsgPSBjbGllbnRTREs7XG4gIHRoaXMuc3RvcmFnZSA9IHt9O1xuICB0aGlzLnJ1bk9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcblxuICBpZiAoYWN0aW9uKSB7XG4gICAgdGhpcy5ydW5PcHRpb25zLmFjdGlvbiA9IGFjdGlvbjtcbiAgfVxuXG4gIGlmICghcXVlcnkpIHtcbiAgICBpZiAodGhpcy5jb25maWcuYWxsb3dDdXN0b21PYmplY3RJZCkge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCAnb2JqZWN0SWQnKSAmJiAhZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuTUlTU0lOR19PQkpFQ1RfSUQsXG4gICAgICAgICAgJ29iamVjdElkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsIG9yIHVuZGVmaW5lZCdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdvYmplY3RJZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgICBpZiAoZGF0YS5pZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2lkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB0aGlzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGRhdGEpO1xuXG4gIC8vIFdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZSwgdGhpcy5yZXNwb25zZSBtYXkgaGF2ZSBzZXZlcmFsXG4gIC8vIGZpZWxkcy5cbiAgLy8gcmVzcG9uc2U6IHRoZSBhY3R1YWwgZGF0YSB0byBiZSByZXR1cm5lZFxuICAvLyBzdGF0dXM6IHRoZSBodHRwIHN0YXR1cyBjb2RlLiBpZiBub3QgcHJlc2VudCwgdHJlYXRlZCBsaWtlIGEgMjAwXG4gIC8vIGxvY2F0aW9uOiB0aGUgbG9jYXRpb24gaGVhZGVyLiBpZiBub3QgcHJlc2VudCwgbm8gbG9jYXRpb24gaGVhZGVyXG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuXG4gIC8vIFByb2Nlc3NpbmcgdGhpcyBvcGVyYXRpb24gbWF5IG11dGF0ZSBvdXIgZGF0YSwgc28gd2Ugb3BlcmF0ZSBvbiBhXG4gIC8vIGNvcHlcbiAgdGhpcy5xdWVyeSA9IGRlZXBjb3B5KHF1ZXJ5KTtcbiAgdGhpcy5kYXRhID0gZGVlcGNvcHkoZGF0YSk7XG4gIC8vIFdlIG5ldmVyIGNoYW5nZSBvcmlnaW5hbERhdGEsIHNvIHdlIGRvIG5vdCBuZWVkIGEgZGVlcCBjb3B5XG4gIHRoaXMub3JpZ2luYWxEYXRhID0gb3JpZ2luYWxEYXRhO1xuXG4gIC8vIFRoZSB0aW1lc3RhbXAgd2UnbGwgdXNlIGZvciB0aGlzIHdob2xlIG9wZXJhdGlvblxuICB0aGlzLnVwZGF0ZWRBdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkuaXNvO1xuXG4gIC8vIFNoYXJlZCBTY2hlbWFDb250cm9sbGVyIHRvIGJlIHJldXNlZCB0byByZWR1Y2UgdGhlIG51bWJlciBvZiBsb2FkU2NoZW1hKCkgY2FsbHMgcGVyIHJlcXVlc3RcbiAgLy8gT25jZSBzZXQgdGhlIHNjaGVtYURhdGEgc2hvdWxkIGJlIGltbXV0YWJsZVxuICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IG51bGw7XG4gIHRoaXMucGVuZGluZ09wcyA9IHt9O1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QgeyBvcmlnaW5hbE9iamVjdCwgdXBkYXRlZE9iamVjdCB9ID0gdGhpcy5idWlsZFBhcnNlT2JqZWN0cygpO1xuXG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIHRoaXMucGVuZGluZ09wcyA9IHsgLi4ucGVuZGluZyB9O1xuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKHRoaXMuZGF0YSk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgICh0aGlzLmRhdGEuYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIHt9IG9yIGlmIGF1dGhEYXRhIGRvZXNuJ3QgZXhpc3RcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnJlZHVjZSgoY2FuSGFuZGxlLCBwcm92aWRlcikgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gY2FuSGFuZGxlICYmIChoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09IG51bGwpO1xuICAgIH0sIHRydWUpO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgdmFsaWRhdGlvbnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+IHtcbiAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHZhbGlkYXRlQXV0aERhdGEgPSB0aGlzLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgIGNvbnN0IGF1dGhQcm92aWRlciA9ICh0aGlzLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgaWYgKGF1dGhQcm92aWRlci5lbmFibGVkID09IG51bGwpIHtcbiAgICAgIERlcHJlY2F0b3IubG9nUnVudGltZURlcHJlY2F0aW9uKHtcbiAgICAgICAgdXNhZ2U6IGBhdXRoLiR7cHJvdmlkZXJ9YCxcbiAgICAgICAgc29sdXRpb246IGBhdXRoLiR7cHJvdmlkZXJ9LmVuYWJsZWQ6IHRydWVgLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmICghdmFsaWRhdGVBdXRoRGF0YSB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB2YWxpZGF0ZUF1dGhEYXRhKGF1dGhEYXRhW3Byb3ZpZGVyXSk7XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5hbGwodmFsaWRhdGlvbnMpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maW5kVXNlcnNXaXRoQXV0aERhdGEgPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBjb25zdCBxdWVyeSA9IHByb3ZpZGVyc1xuICAgIC5yZWR1Y2UoKG1lbW8sIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoIWF1dGhEYXRhW3Byb3ZpZGVyXSkge1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH1cbiAgICAgIGNvbnN0IHF1ZXJ5S2V5ID0gYGF1dGhEYXRhLiR7cHJvdmlkZXJ9LmlkYDtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge307XG4gICAgICBxdWVyeVtxdWVyeUtleV0gPSBhdXRoRGF0YVtwcm92aWRlcl0uaWQ7XG4gICAgICBtZW1vLnB1c2gocXVlcnkpO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfSwgW10pXG4gICAgLmZpbHRlcihxID0+IHtcbiAgICAgIHJldHVybiB0eXBlb2YgcSAhPT0gJ3VuZGVmaW5lZCc7XG4gICAgfSk7XG5cbiAgbGV0IGZpbmRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCA+IDApIHtcbiAgICBmaW5kUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHsgJG9yOiBxdWVyeSB9LCB7fSk7XG4gIH1cblxuICByZXR1cm4gZmluZFByb21pc2U7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbHRlcmVkT2JqZWN0c0J5QUNMID0gZnVuY3Rpb24gKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YSA9IGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBsZXQgcmVzdWx0cztcbiAgcmV0dXJuIHRoaXMuZmluZFVzZXJzV2l0aEF1dGhEYXRhKGF1dGhEYXRhKS50aGVuKGFzeW5jIHIgPT4ge1xuICAgIHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuXG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoID09IDEpIHtcbiAgICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuam9pbignLCcpO1xuXG4gICAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAgIGNvbnN0IG11dGF0ZWRBdXRoRGF0YSA9IHt9O1xuICAgICAgT2JqZWN0LmtleXMoYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlckRhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGNvbnN0IHVzZXJBdXRoRGF0YSA9IHVzZXJSZXN1bHQuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBpZiAoIV8uaXNFcXVhbChwcm92aWRlckRhdGEsIHVzZXJBdXRoRGF0YSkpIHtcbiAgICAgICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICAgICAgbGV0IHVzZXJJZDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMuYXV0aC51c2VyLmlkO1xuICAgICAgfVxuICAgICAgaWYgKCF1c2VySWQgfHwgdXNlcklkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAgIC8vIE9SIHRoZSB1c2VyIG1ha2luZyB0aGUgY2FsbCBpcyB0aGUgcmlnaHQgb25lXG4gICAgICAgIC8vIExvZ2luIHdpdGggYXV0aCBkYXRhXG4gICAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBvYmplY3RJZCBmaXJzdCBvdGhlcndpc2UgbG9jYXRpb24gaGFzIHRyYWlsaW5nIHVuZGVmaW5lZFxuICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgPSB1c2VyUmVzdWx0Lm9iamVjdElkO1xuXG4gICAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIC8vIHRoaXMgYSBsb2dpbiBjYWxsLCBubyB1c2VySWQgcGFzc2VkXG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgICAgLy8gdG8gYXV0aERhdGEgb24gdGhlIGRiOyBjaGFuZ2VzIHRvIHVzZXJSZXN1bHRcbiAgICAgICAgICAvLyB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgZGlkbid0IGNoYW5nZSB0aGUgYXV0aCBkYXRhLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gV2UgaGF2ZSBhdXRoRGF0YSB0aGF0IGlzIHVwZGF0ZWQgb24gbG9naW5cbiAgICAgICAgLy8gdGhhdCBjYW4gaGFwcGVuIHdoZW4gdG9rZW4gYXJlIHJlZnJlc2hlZCxcbiAgICAgICAgLy8gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgdG9rZW4gYW5kIGxldCB0aGUgdXNlciBpblxuICAgICAgICAvLyBXZSBzaG91bGQgb25seSBjaGVjayB0aGUgbXV0YXRlZCBrZXlzXG4gICAgICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihtdXRhdGVkQXV0aERhdGEpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIC8vIElGIHdlIGhhdmUgYSByZXNwb25zZSwgd2UnbGwgc2tpcCB0aGUgZGF0YWJhc2Ugb3BlcmF0aW9uIC8gYmVmb3JlU2F2ZSAvIGFmdGVyU2F2ZSBldGMuLi5cbiAgICAgICAgICAvLyB3ZSBuZWVkIHRvIHNldCBpdCB1cCB0aGVyZS5cbiAgICAgICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBsb2dnaW5nIGluLCBidXQganVzdCB1cGRhdGluZyB0aGUgY3VycmVudCB1c2VyLCB3ZSBjYW4gc2FmZWx5IHNraXAgdGhhdCBwYXJ0XG4gICAgICAgICAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICAgICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICAgICAgT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVtwcm92aWRlcl0gPSBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJ1biB0aGUgREIgdXBkYXRlIGRpcmVjdGx5LCBhcyAnbWFzdGVyJ1xuICAgICAgICAgICAgLy8gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgICAgIC8vIFRoZW4gd2UncmUgZ29vZCBmb3IgdGhlIHVzZXIsIGVhcmx5IGV4aXQgb2Ygc29ydHNcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLmRhdGEub2JqZWN0SWQgfSxcbiAgICAgICAgICAgICAgeyBhdXRoRGF0YTogbXV0YXRlZEF1dGhEYXRhIH0sXG4gICAgICAgICAgICAgIHt9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKHVzZXJJZCkge1xuICAgICAgICAvLyBUcnlpbmcgdG8gdXBkYXRlIGF1dGggZGF0YSBidXQgdXNlcnNcbiAgICAgICAgLy8gYXJlIGRpZmZlcmVudFxuICAgICAgICBpZiAodXNlclJlc3VsdC5vYmplY3RJZCAhPT0gdXNlcklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm8gYXV0aCBkYXRhIHdhcyBtdXRhdGVkLCBqdXN0IGtlZXAgZ29pbmdcbiAgICAgICAgaWYgKCFoYXNNdXRhdGVkQXV0aERhdGEpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhKS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgLy8gTW9yZSB0aGFuIDEgdXNlciB3aXRoIHRoZSBwYXNzZWQgaWQnc1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBUaGUgbm9uLXRoaXJkLXBhcnR5IHBhcnRzIG9mIFVzZXIgdHJhbnNmb3JtYXRpb25cblJlc3RXcml0ZS5wcm90b3R5cGUudHJhbnNmb3JtVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyICYmICdlbWFpbFZlcmlmaWVkJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBlcnJvciA9IGBDbGllbnRzIGFyZW4ndCBhbGxvd2VkIHRvIG1hbnVhbGx5IHVwZGF0ZSBlbWFpbCB2ZXJpZmljYXRpb24uYDtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgZXJyb3IpO1xuICB9XG5cbiAgLy8gRG8gbm90IGNsZWFudXAgc2Vzc2lvbiBpZiBvYmplY3RJZCBpcyBub3Qgc2V0XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMub2JqZWN0SWQoKSkge1xuICAgIC8vIElmIHdlJ3JlIHVwZGF0aW5nIGEgX1VzZXIgb2JqZWN0LCB3ZSBuZWVkIHRvIGNsZWFyIG91dCB0aGUgY2FjaGUgZm9yIHRoYXQgdXNlci4gRmluZCBhbGwgdGhlaXJcbiAgICAvLyBzZXNzaW9uIHRva2VucywgYW5kIHJlbW92ZSB0aGVtIGZyb20gdGhlIGNhY2hlLlxuICAgIHByb21pc2UgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICAgIC5leGVjdXRlKClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChzZXNzaW9uID0+XG4gICAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gIH1cblxuICByZXR1cm4gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIFRyYW5zZm9ybSB0aGUgcGFzc3dvcmRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBpZ25vcmUgb25seSBpZiB1bmRlZmluZWQuIHNob3VsZCBwcm9jZWVkIGlmIGVtcHR5ICgnJylcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSA9IHRydWU7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgbmV3IHNlc3Npb24gb25seSBpZiB0aGUgdXNlciByZXF1ZXN0ZWRcbiAgICAgICAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2V0RW1haWxWZXJpZnlUb2tlbih0aGlzLmRhdGEpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpXG4gICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDFcbiAgICAgICAgICApO1xuICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgY29uc3QgbmV3UGFzc3dvcmQgPSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIC8vIGNvbXBhcmUgdGhlIG5ldyBwYXNzd29yZCBoYXNoIHdpdGggYWxsIG9sZCBwYXNzd29yZCBoYXNoZXNcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBvbGRQYXNzd29yZHMubWFwKGZ1bmN0aW9uIChoYXNoKSB7XG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUobmV3UGFzc3dvcmQsIGhhc2gpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpXG4gICAgICAgICAgICAgIC8vIHJlamVjdCBpZiB0aGVyZSBpcyBhIG1hdGNoXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCgnUkVQRUFUX1BBU1NXT1JEJyk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB3YWl0IGZvciBhbGwgY29tcGFyaXNvbnMgdG8gY29tcGxldGVcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyciA9PT0gJ1JFUEVBVF9QQVNTV09SRCcpXG4gICAgICAgICAgICAgIC8vIGEgbWF0Y2ggd2FzIGZvdW5kXG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgYE5ldyBwYXNzd29yZCBzaG91bGQgbm90IGJlIHRoZSBzYW1lIGFzIGxhc3QgJHt0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3Rvcnl9IHBhc3N3b3Jkcy5gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIHNlc3Npb24gZm9yIHVwZGF0aW5nIHVzZXIgKHRoaXMucXVlcnkgaXMgc2V0KSB1bmxlc3MgYXV0aERhdGEgZXhpc3RzXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgbmV3IHNlc3Npb25Ub2tlbiBpZiBsaW5raW5nIHZpYSBzZXNzaW9uVG9rZW5cbiAgaWYgKHRoaXMuYXV0aC51c2VyICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoXG4gICAgIXRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gJiYgLy8gc2lnbnVwIGNhbGwsIHdpdGhcbiAgICB0aGlzLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmIC8vIG5vIGxvZ2luIHdpdGhvdXQgdmVyaWZpY2F0aW9uXG4gICAgdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlsc1xuICApIHtcbiAgICAvLyB2ZXJpZmljYXRpb24gaXMgb25cbiAgICByZXR1cm47IC8vIGRvIG5vdCBjcmVhdGUgdGhlIHNlc3Npb24gdG9rZW4gaW4gdGhhdCBjYXNlIVxuICB9XG4gIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPT0gbnVsbCAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5qb2luKCcsJyk7XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIC8vIFRPRE86IFZlcmlmeSBwcm9wZXIgZXJyb3IgdG8gdGhyb3dcbiAgaWYgKHRoaXMuZGF0YS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ0Nhbm5vdCBzZXQgJyArICdBQ0wgb24gYSBTZXNzaW9uLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3RlciAmJiB0aGlzLmRhdGEudXNlci5vYmplY3RJZCAhPSB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfVxuICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aGlzLnF1ZXJ5ID0ge1xuICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5kYXRhKSB7XG4gICAgICBpZiAoa2V5ID09PSAnb2JqZWN0SWQnIHx8IGtleSA9PT0gJ3VzZXInKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhW2tleV0gPSB0aGlzLmRhdGFba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2NyZWF0ZScsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbFNlc3Npb25EYXRhLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLnJlc3BvbnNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdFcnJvciBjcmVhdGluZyBzZXNzaW9uLicpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvbkRhdGFbJ29iamVjdElkJ10gPSByZXN1bHRzLnJlc3BvbnNlWydvYmplY3RJZCddO1xuICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgIGxvY2F0aW9uOiByZXN1bHRzLmxvY2F0aW9uLFxuICAgICAgICByZXNwb25zZTogc2Vzc2lvbkRhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfSW5zdGFsbGF0aW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gaW5zdGFsbGF0aW9uIG9iamVjdC5cbi8vIElmIGFuIGluc3RhbGxhdGlvbiBpcyBmb3VuZCwgdGhpcyBjYW4gbXV0YXRlIHRoaXMucXVlcnkgYW5kIHR1cm4gYSBjcmVhdGVcbi8vIGludG8gYW4gdXBkYXRlLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVJbnN0YWxsYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX0luc3RhbGxhdGlvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoXG4gICAgIXRoaXMucXVlcnkgJiZcbiAgICAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICF0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWRcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgMTM1LFxuICAgICAgJ2F0IGxlYXN0IG9uZSBJRCBmaWVsZCAoZGV2aWNlVG9rZW4sIGluc3RhbGxhdGlvbklkKSAnICsgJ211c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJ1xuICAgICk7XG4gIH1cblxuICAvLyBJZiB0aGUgZGV2aWNlIHRva2VuIGlzIDY0IGNoYXJhY3RlcnMgbG9uZywgd2UgYXNzdW1lIGl0IGlzIGZvciBpT1NcbiAgLy8gYW5kIGxvd2VyY2FzZSBpdC5cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4ubGVuZ3RoID09IDY0KSB7XG4gICAgdGhpcy5kYXRhLmRldmljZVRva2VuID0gdGhpcy5kYXRhLmRldmljZVRva2VuLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBXZSBsb3dlcmNhc2UgdGhlIGluc3RhbGxhdGlvbklkIGlmIHByZXNlbnRcbiAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgbGV0IGluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkO1xuXG4gIC8vIElmIGRhdGEuaW5zdGFsbGF0aW9uSWQgaXMgbm90IHNldCBhbmQgd2UncmUgbm90IG1hc3Rlciwgd2UgY2FuIGxvb2t1cCBpbiBhdXRoXG4gIGlmICghaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5kYXRhLkFDTCAmJiB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWUpIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UgfHwgdGhpcy5ydW5PcHRpb25zLm1hbnkpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgcGVybXNcbiAgICApO1xuICB9KTtcblxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzID0ge307XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShcbiAgICAgICAgICAocmVzdWx0IHx8IHVwZGF0ZWRPYmplY3QpLnRvSlNPTigpLFxuICAgICAgICAgIHRoaXMuZGF0YVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFBhcnNlT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLCBvYmplY3RJZDogdGhpcy5xdWVyeT8ub2JqZWN0SWQgfTtcbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB7IHVwZGF0ZWRPYmplY3QsIG9yaWdpbmFsT2JqZWN0IH07XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNsZWFuVXNlckF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlICYmIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3QgdXNlciA9IHRoaXMucmVzcG9uc2UucmVzcG9uc2U7XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YSA9IGZ1bmN0aW9uIChyZXNwb25zZSwgZGF0YSkge1xuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKHVwZGF0ZWRPYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5wZW5kaW5nT3BzKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSldO1xuICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICBza2lwS2V5cy5wdXNoKCdvYmplY3RJZCcsICdjcmVhdGVkQXQnKTtcbiAgfSBlbHNlIHtcbiAgICBza2lwS2V5cy5wdXNoKCd1cGRhdGVkQXQnKTtcbiAgICBkZWxldGUgcmVzcG9uc2Uub2JqZWN0SWQ7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAoXG4gICAgICB2YWx1ZSA9PSBudWxsIHx8XG4gICAgICAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbChkYXRhW2tleV0sIHZhbHVlKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbCgodGhpcy5vcmlnaW5hbERhdGEgfHwge30pW2tleV0sIHZhbHVlKVxuICAgICkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgaWYgKHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShkYXRhLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQWlFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQW5CakU7QUFDQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxP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