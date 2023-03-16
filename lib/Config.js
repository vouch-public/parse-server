"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _lodash = require("lodash");
var _net = _interopRequireDefault(require("net"));
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _LoggerController = require("./Controllers/LoggerController");
var _Definitions = require("./Options/Definitions");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }
  return str;
}
class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }
  static put(serverConfiguration) {
    Config.validate(serverConfiguration);
    _cache.default.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }
  static validate({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    defaultLimit,
    maxLimit,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    maintenanceKey,
    maintenanceKeyIps,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken,
    logLevels,
    rateLimit
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }
    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
    }
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }
    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);
    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }
    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }
    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateIps('masterKeyIps', masterKeyIps);
    this.validateIps('maintenanceKeyIps', maintenanceKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
    this.validateRateLimit(rateLimit);
    this.validateLogLevels(logLevels);
  }
  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }
  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
    }
  }
  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }
    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }
    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }
  static validateSchemaOptions(schema) {
    if (!schema) return;
    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }
    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }
    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }
    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }
    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }
    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }
    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }
    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }
  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }
    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }
    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }
    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }
    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }
    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }
    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }
    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }
    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }
    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }
    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }
  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }
    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }
    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }
  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }
      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }
      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }
  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }
      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }
      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }
      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }
      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }
      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }
      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }
      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
    }
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }
  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }
    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }
    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }
    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }
    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }
    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }
  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }
      throw e;
    }
    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }
    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }
    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
  }
  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!_net.default.isIP(ip)) {
        throw `The Parse Server option "${field}" contains an invalid IP address "${ip}".`;
      }
    }
  }
  get mount() {
    var mount = this._mount;
    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }
    return mount;
  }
  set mount(newValue) {
    this._mount = newValue;
  }
  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }
  static validateDefaultLimit(defaultLimit) {
    if (defaultLimit == null) {
      defaultLimit = _Definitions.ParseServerOptions.defaultLimit.default;
    }
    if (typeof defaultLimit !== 'number') {
      throw 'Default limit must be a number.';
    }
    if (defaultLimit <= 0) {
      throw 'Default limit must be a value greater than 0.';
    }
  }
  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }
  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }
  static validateLogLevels(logLevels) {
    for (const key of Object.keys(_Definitions.LogLevels)) {
      if (logLevels[key]) {
        if (_LoggerController.logLevels.indexOf(logLevels[key]) === -1) {
          throw `'${key}' must be one of ${JSON.stringify(_LoggerController.logLevels)}`;
        }
      } else {
        logLevels[key] = _Definitions.LogLevels[key].default;
      }
    }
  }
  static validateRateLimit(rateLimit) {
    if (!rateLimit) {
      return;
    }
    if (Object.prototype.toString.call(rateLimit) !== '[object Object]' && !Array.isArray(rateLimit)) {
      throw `rateLimit must be an array or object`;
    }
    const options = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const option of options) {
      if (Object.prototype.toString.call(option) !== '[object Object]') {
        throw `rateLimit must be an array of objects`;
      }
      if (option.requestPath == null) {
        throw `rateLimit.requestPath must be defined`;
      }
      if (typeof option.requestPath !== 'string') {
        throw `rateLimit.requestPath must be a string`;
      }
      if (option.requestTimeWindow == null) {
        throw `rateLimit.requestTimeWindow must be defined`;
      }
      if (typeof option.requestTimeWindow !== 'number') {
        throw `rateLimit.requestTimeWindow must be a number`;
      }
      if (option.includeInternalRequests && typeof option.includeInternalRequests !== 'boolean') {
        throw `rateLimit.includeInternalRequests must be a boolean`;
      }
      if (option.requestCount == null) {
        throw `rateLimit.requestCount must be defined`;
      }
      if (typeof option.requestCount !== 'number') {
        throw `rateLimit.requestCount must be a number`;
      }
      if (option.errorResponseMessage && typeof option.errorResponseMessage !== 'string') {
        throw `rateLimit.errorResponseMessage must be a string`;
      }
    }
  }
  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }
  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }
    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }
  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }
  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }
  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }
  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }
  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }
  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }
  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }
  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX0RlZmluaXRpb25zIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHIiLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZSIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsImRlZmF1bHRMaW1pdCIsIm1heExpbWl0IiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsIm1haW50ZW5hbmNlS2V5IiwibWFpbnRlbmFuY2VLZXlJcHMiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJzY2hlbWEiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwiYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsImxvZ0xldmVscyIsInJhdGVMaW1pdCIsIkVycm9yIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlSXBzIiwidmFsaWRhdGVEZWZhdWx0TGltaXQiLCJ2YWxpZGF0ZU1heExpbWl0IiwidmFsaWRhdGVBbGxvd0hlYWRlcnMiLCJ2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyIsInZhbGlkYXRlUGFnZXNPcHRpb25zIiwidmFsaWRhdGVTZWN1cml0eU9wdGlvbnMiLCJ2YWxpZGF0ZVNjaGVtYU9wdGlvbnMiLCJ2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMiLCJ2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJ2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJ2YWxpZGF0ZVJhdGVMaW1pdCIsInZhbGlkYXRlTG9nTGV2ZWxzIiwidW5kZWZpbmVkIiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJpc0Jvb2xlYW4iLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImlzU3RyaW5nIiwibG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUiLCJwbGFjZWhvbGRlcnMiLCJmb3JjZVJlZGlyZWN0IiwicGFnZXNQYXRoIiwicGFnZXNFbmRwb2ludCIsImN1c3RvbVVybHMiLCJjdXN0b21Sb3V0ZXMiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJlIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImZpZWxkIiwiaXAiLCJpbmNsdWRlcyIsInNwbGl0IiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJvcHRpb25zIiwib3B0aW9uIiwicmVxdWVzdFBhdGgiLCJyZXF1ZXN0VGltZVdpbmRvdyIsImluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzIiwicmVxdWVzdENvdW50IiwiZXJyb3JSZXNwb25zZU1lc3NhZ2UiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiaW52YWxpZExpbmtVUkwiLCJjdXN0b21QYWdlcyIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJleHBvcnRzIiwiX2RlZmF1bHQiLCJtb2R1bGUiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGxvZ0xldmVscyBhcyB2YWxpZExvZ0xldmVscyB9IGZyb20gJy4vQ29udHJvbGxlcnMvTG9nZ2VyQ29udHJvbGxlcic7XG5pbXBvcnQge1xuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIExvZ0xldmVscyxcbiAgUGFnZXNPcHRpb25zLFxuICBQYXJzZVNlcnZlck9wdGlvbnMsXG4gIFNjaGVtYU9wdGlvbnMsXG4gIFNlY3VyaXR5T3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcblxuZnVuY3Rpb24gcmVtb3ZlVHJhaWxpbmdTbGFzaChzdHIpIHtcbiAgaWYgKCFzdHIpIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG4gIGlmIChzdHIuZW5kc1dpdGgoJy8nKSkge1xuICAgIHN0ciA9IHN0ci5zdWJzdHIoMCwgc3RyLmxlbmd0aCAtIDEpO1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWcge1xuICBzdGF0aWMgZ2V0KGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgbW91bnQ6IHN0cmluZykge1xuICAgIGNvbnN0IGNhY2hlSW5mbyA9IEFwcENhY2hlLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIWNhY2hlSW5mbykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnKCk7XG4gICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIE9iamVjdC5rZXlzKGNhY2hlSW5mbykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PSAnZGF0YWJhc2VDb250cm9sbGVyJykge1xuICAgICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGNhY2hlSW5mby5kYXRhYmFzZUNvbnRyb2xsZXIuYWRhcHRlciwgY29uZmlnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbmZpZ1trZXldID0gY2FjaGVJbmZvW2tleV07XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uZmlnLm1vdW50ID0gcmVtb3ZlVHJhaWxpbmdTbGFzaChtb3VudCk7XG4gICAgY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQuYmluZChjb25maWcpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0LmJpbmQoXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGUoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlKHtcbiAgICB2ZXJpZnlVc2VyRW1haWxzLFxuICAgIHVzZXJDb250cm9sbGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5SXBzLFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gICAgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbixcbiAgICBsb2dMZXZlbHMsXG4gICAgcmF0ZUxpbWl0LFxuICB9KSB7XG4gICAgaWYgKG1hc3RlcktleSA9PT0gcmVhZE9ubHlNYXN0ZXJLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCByZWFkT25seU1hc3RlcktleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgaWYgKG1hc3RlcktleSA9PT0gbWFpbnRlbmFuY2VLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCBtYWludGVuYW5jZUtleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYXN0ZXJLZXlJcHMnLCBtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21haW50ZW5hbmNlS2V5SXBzJywgbWFpbnRlbmFuY2VLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgICB0aGlzLnZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgaWYgKHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCA9IHJlcXVlc3RLZXl3b3JkRGVueWxpc3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiByZXF1ZXN0S2V5d29yZERlbnlsaXN0IG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICBpZiAodHlwZW9mIGVuZm9yY2VQcml2YXRlVXNlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5mb3JjZVByaXZhdGVVc2VycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSXBzKGZpZWxkLCBtYXN0ZXJLZXlJcHMpIHtcbiAgICBmb3IgKGxldCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmIChpcC5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGlwID0gaXAuc3BsaXQoJy8nKVswXTtcbiAgICAgIH1cbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBUaGUgUGFyc2UgU2VydmVyIG9wdGlvbiBcIiR7ZmllbGR9XCIgY29udGFpbnMgYW4gaW52YWxpZCBJUCBhZGRyZXNzIFwiJHtpcH1cIi5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURlZmF1bHRMaW1pdChkZWZhdWx0TGltaXQpIHtcbiAgICBpZiAoZGVmYXVsdExpbWl0ID09IG51bGwpIHtcbiAgICAgIGRlZmF1bHRMaW1pdCA9IFBhcnNlU2VydmVyT3B0aW9ucy5kZWZhdWx0TGltaXQuZGVmYXVsdDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkZWZhdWx0TGltaXQgIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgbnVtYmVyLic7XG4gICAgfVxuICAgIGlmIChkZWZhdWx0TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpIHtcbiAgICBpZiAobWF4TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ01heCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKSB7XG4gICAgaWYgKCFbbnVsbCwgdW5kZWZpbmVkXS5pbmNsdWRlcyhhbGxvd0hlYWRlcnMpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShhbGxvd0hlYWRlcnMpKSB7XG4gICAgICAgIGFsbG93SGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBoZWFkZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG9ubHkgY29udGFpbiBzdHJpbmdzJztcbiAgICAgICAgICB9IGVsc2UgaWYgKCFoZWFkZXIudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBub3QgY29udGFpbiBlbXB0eSBzdHJpbmdzJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBiZSBhbiBhcnJheSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTG9nTGV2ZWxzKGxvZ0xldmVscykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKExvZ0xldmVscykpIHtcbiAgICAgIGlmIChsb2dMZXZlbHNba2V5XSkge1xuICAgICAgICBpZiAodmFsaWRMb2dMZXZlbHMuaW5kZXhPZihsb2dMZXZlbHNba2V5XSkgPT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgYCcke2tleX0nIG11c3QgYmUgb25lIG9mICR7SlNPTi5zdHJpbmdpZnkodmFsaWRMb2dMZXZlbHMpfWA7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ0xldmVsc1trZXldID0gTG9nTGV2ZWxzW2tleV0uZGVmYXVsdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KSB7XG4gICAgaWYgKCFyYXRlTGltaXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJhdGVMaW1pdCkgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShyYXRlTGltaXQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb3Igb2JqZWN0YDtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob3B0aW9uKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9mIG9iamVjdHNgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0UGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAmJiB0eXBlb2Ygb3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RDb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0Q291bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAmJiB0eXBlb2Ygb3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmVycm9yUmVzcG9uc2VNZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQSxJQUFBQSxPQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxJQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxNQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBSSxtQkFBQSxHQUFBRixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUssaUJBQUEsR0FBQUwsT0FBQTtBQUNBLElBQUFNLFlBQUEsR0FBQU4sT0FBQTtBQVMrQixTQUFBRSx1QkFBQUssR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQWxCL0I7QUFDQTtBQUNBOztBQWtCQSxTQUFTRyxtQkFBbUJBLENBQUNDLEdBQUcsRUFBRTtFQUNoQyxJQUFJLENBQUNBLEdBQUcsRUFBRTtJQUNSLE9BQU9BLEdBQUc7RUFDWjtFQUNBLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQ3JCRCxHQUFHLEdBQUdBLEdBQUcsQ0FBQ0UsTUFBTSxDQUFDLENBQUMsRUFBRUYsR0FBRyxDQUFDRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0VBQ3JDO0VBQ0EsT0FBT0gsR0FBRztBQUNaO0FBRU8sTUFBTUksTUFBTSxDQUFDO0VBQ2xCLE9BQU9DLEdBQUdBLENBQUNDLGFBQXFCLEVBQUVDLEtBQWEsRUFBRTtJQUMvQyxNQUFNQyxTQUFTLEdBQUdDLGNBQVEsQ0FBQ0osR0FBRyxDQUFDQyxhQUFhLENBQUM7SUFDN0MsSUFBSSxDQUFDRSxTQUFTLEVBQUU7TUFDZDtJQUNGO0lBQ0EsTUFBTUUsTUFBTSxHQUFHLElBQUlOLE1BQU0sRUFBRTtJQUMzQk0sTUFBTSxDQUFDSixhQUFhLEdBQUdBLGFBQWE7SUFDcENLLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDSixTQUFTLENBQUMsQ0FBQ0ssT0FBTyxDQUFDQyxHQUFHLElBQUk7TUFDcEMsSUFBSUEsR0FBRyxJQUFJLG9CQUFvQixFQUFFO1FBQy9CSixNQUFNLENBQUNLLFFBQVEsR0FBRyxJQUFJQywyQkFBa0IsQ0FBQ1IsU0FBUyxDQUFDUyxrQkFBa0IsQ0FBQ0MsT0FBTyxFQUFFUixNQUFNLENBQUM7TUFDeEYsQ0FBQyxNQUFNO1FBQ0xBLE1BQU0sQ0FBQ0ksR0FBRyxDQUFDLEdBQUdOLFNBQVMsQ0FBQ00sR0FBRyxDQUFDO01BQzlCO0lBQ0YsQ0FBQyxDQUFDO0lBQ0ZKLE1BQU0sQ0FBQ0gsS0FBSyxHQUFHUixtQkFBbUIsQ0FBQ1EsS0FBSyxDQUFDO0lBQ3pDRyxNQUFNLENBQUNTLHdCQUF3QixHQUFHVCxNQUFNLENBQUNTLHdCQUF3QixDQUFDQyxJQUFJLENBQUNWLE1BQU0sQ0FBQztJQUM5RUEsTUFBTSxDQUFDVyxpQ0FBaUMsR0FBR1gsTUFBTSxDQUFDVyxpQ0FBaUMsQ0FBQ0QsSUFBSSxDQUN0RlYsTUFBTSxDQUNQO0lBQ0QsT0FBT0EsTUFBTTtFQUNmO0VBRUEsT0FBT1ksR0FBR0EsQ0FBQ0MsbUJBQW1CLEVBQUU7SUFDOUJuQixNQUFNLENBQUNvQixRQUFRLENBQUNELG1CQUFtQixDQUFDO0lBQ3BDZCxjQUFRLENBQUNhLEdBQUcsQ0FBQ0MsbUJBQW1CLENBQUNFLEtBQUssRUFBRUYsbUJBQW1CLENBQUM7SUFDNURuQixNQUFNLENBQUNzQixzQkFBc0IsQ0FBQ0gsbUJBQW1CLENBQUNJLGNBQWMsQ0FBQztJQUNqRSxPQUFPSixtQkFBbUI7RUFDNUI7RUFFQSxPQUFPQyxRQUFRQSxDQUFDO0lBQ2RJLGdCQUFnQjtJQUNoQkMsY0FBYztJQUNkQyxPQUFPO0lBQ1BDLGVBQWU7SUFDZkMsNEJBQTRCO0lBQzVCQyxzQkFBc0I7SUFDdEJDLGFBQWE7SUFDYkMsWUFBWTtJQUNaQyxRQUFRO0lBQ1JDLGdDQUFnQztJQUNoQ0MsY0FBYztJQUNkWCxjQUFjO0lBQ2RZLFlBQVk7SUFDWkMsU0FBUztJQUNUQyxjQUFjO0lBQ2RDLGlCQUFpQjtJQUNqQkMsaUJBQWlCO0lBQ2pCQyxZQUFZO0lBQ1pDLGtCQUFrQjtJQUNsQkMsNEJBQTRCO0lBQzVCQyxVQUFVO0lBQ1ZDLEtBQUs7SUFDTEMsUUFBUTtJQUNSQyxtQkFBbUI7SUFDbkJDLE1BQU07SUFDTkMsc0JBQXNCO0lBQ3RCQyx5QkFBeUI7SUFDekJDLFNBQVM7SUFDVEM7RUFDRixDQUFDLEVBQUU7SUFDRCxJQUFJZixTQUFTLEtBQUtHLGlCQUFpQixFQUFFO01BQ25DLE1BQU0sSUFBSWEsS0FBSyxDQUFDLHFEQUFxRCxDQUFDO0lBQ3hFO0lBRUEsSUFBSWhCLFNBQVMsS0FBS0MsY0FBYyxFQUFFO01BQ2hDLE1BQU0sSUFBSWUsS0FBSyxDQUFDLGtEQUFrRCxDQUFDO0lBQ3JFO0lBRUEsTUFBTUMsWUFBWSxHQUFHNUIsY0FBYyxDQUFDWCxPQUFPO0lBQzNDLElBQUlVLGdCQUFnQixFQUFFO01BQ3BCLElBQUksQ0FBQzhCLDBCQUEwQixDQUFDO1FBQzlCRCxZQUFZO1FBQ1ozQixPQUFPO1FBQ1BDLGVBQWU7UUFDZk0sZ0NBQWdDO1FBQ2hDUztNQUNGLENBQUMsQ0FBQztJQUNKO0lBRUEsSUFBSSxDQUFDYSw0QkFBNEIsQ0FBQ3JCLGNBQWMsQ0FBQztJQUNqRCxJQUFJLENBQUNzQixzQkFBc0IsQ0FBQ2pDLGNBQWMsQ0FBQztJQUMzQyxJQUFJLENBQUNrQyx5QkFBeUIsQ0FBQ2QsVUFBVSxDQUFDO0lBRTFDLElBQUksT0FBT2YsNEJBQTRCLEtBQUssU0FBUyxFQUFFO01BQ3JELE1BQU0sc0RBQXNEO0lBQzlEO0lBRUEsSUFBSUQsZUFBZSxFQUFFO01BQ25CLElBQUksQ0FBQ0EsZUFBZSxDQUFDK0IsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMvQixlQUFlLENBQUMrQixVQUFVLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDckYsTUFBTSxvRUFBb0U7TUFDNUU7SUFDRjtJQUNBLElBQUksQ0FBQ0MsNEJBQTRCLENBQUM3QixhQUFhLEVBQUVELHNCQUFzQixDQUFDO0lBQ3hFLElBQUksQ0FBQytCLFdBQVcsQ0FBQyxjQUFjLEVBQUV6QixZQUFZLENBQUM7SUFDOUMsSUFBSSxDQUFDeUIsV0FBVyxDQUFDLG1CQUFtQixFQUFFdEIsaUJBQWlCLENBQUM7SUFDeEQsSUFBSSxDQUFDdUIsb0JBQW9CLENBQUM5QixZQUFZLENBQUM7SUFDdkMsSUFBSSxDQUFDK0IsZ0JBQWdCLENBQUM5QixRQUFRLENBQUM7SUFDL0IsSUFBSSxDQUFDK0Isb0JBQW9CLENBQUN2QixZQUFZLENBQUM7SUFDdkMsSUFBSSxDQUFDd0IsMEJBQTBCLENBQUN2QixrQkFBa0IsQ0FBQztJQUNuRCxJQUFJLENBQUN3QixvQkFBb0IsQ0FBQ3JCLEtBQUssQ0FBQztJQUNoQyxJQUFJLENBQUNzQix1QkFBdUIsQ0FBQ3JCLFFBQVEsQ0FBQztJQUN0QyxJQUFJLENBQUNzQixxQkFBcUIsQ0FBQ3BCLE1BQU0sQ0FBQztJQUNsQyxJQUFJLENBQUNxQiwyQkFBMkIsQ0FBQ3RCLG1CQUFtQixDQUFDO0lBQ3JELElBQUksQ0FBQ3VCLGlDQUFpQyxDQUFDcEIseUJBQXlCLENBQUM7SUFDakUsSUFBSSxDQUFDcUIsOEJBQThCLENBQUN0QixzQkFBc0IsQ0FBQztJQUMzRCxJQUFJLENBQUN1QixpQkFBaUIsQ0FBQ3BCLFNBQVMsQ0FBQztJQUNqQyxJQUFJLENBQUNxQixpQkFBaUIsQ0FBQ3RCLFNBQVMsQ0FBQztFQUNuQztFQUVBLE9BQU9vQiw4QkFBOEJBLENBQUN0QixzQkFBc0IsRUFBRTtJQUM1RCxJQUFJQSxzQkFBc0IsS0FBS3lCLFNBQVMsRUFBRTtNQUN4Q3pCLHNCQUFzQixHQUFHQSxzQkFBc0IsQ0FBQ3RELE9BQU87SUFDekQsQ0FBQyxNQUFNLElBQUksQ0FBQ2dGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDM0Isc0JBQXNCLENBQUMsRUFBRTtNQUNqRCxNQUFNLDhEQUE4RDtJQUN0RTtFQUNGO0VBRUEsT0FBT29CLDJCQUEyQkEsQ0FBQ3RCLG1CQUFtQixFQUFFO0lBQ3RELElBQUksT0FBT0EsbUJBQW1CLEtBQUssU0FBUyxFQUFFO01BQzVDLE1BQU0sNERBQTREO0lBQ3BFO0VBQ0Y7RUFFQSxPQUFPdUIsaUNBQWlDQSxDQUFDcEIseUJBQXlCLEVBQUU7SUFDbEUsSUFBSSxPQUFPQSx5QkFBeUIsS0FBSyxTQUFTLEVBQUU7TUFDbEQsTUFBTSxrRUFBa0U7SUFDMUU7RUFDRjtFQUVBLE9BQU9pQix1QkFBdUJBLENBQUNyQixRQUFRLEVBQUU7SUFDdkMsSUFBSXRDLE1BQU0sQ0FBQ3FFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUNqQyxRQUFRLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtNQUNsRSxNQUFNLGlEQUFpRDtJQUN6RDtJQUNBLElBQUlBLFFBQVEsQ0FBQ2tDLFdBQVcsS0FBS04sU0FBUyxFQUFFO01BQ3RDNUIsUUFBUSxDQUFDa0MsV0FBVyxHQUFHQyw0QkFBZSxDQUFDRCxXQUFXLENBQUNyRixPQUFPO0lBQzVELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXVGLGlCQUFTLEVBQUNwQyxRQUFRLENBQUNrQyxXQUFXLENBQUMsRUFBRTtNQUMzQyxNQUFNLDZEQUE2RDtJQUNyRTtJQUNBLElBQUlsQyxRQUFRLENBQUNxQyxjQUFjLEtBQUtULFNBQVMsRUFBRTtNQUN6QzVCLFFBQVEsQ0FBQ3FDLGNBQWMsR0FBR0YsNEJBQWUsQ0FBQ0UsY0FBYyxDQUFDeEYsT0FBTztJQUNsRSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUF1RixpQkFBUyxFQUFDcEMsUUFBUSxDQUFDcUMsY0FBYyxDQUFDLEVBQUU7TUFDOUMsTUFBTSxnRUFBZ0U7SUFDeEU7RUFDRjtFQUVBLE9BQU9mLHFCQUFxQkEsQ0FBQ3BCLE1BQXFCLEVBQUU7SUFDbEQsSUFBSSxDQUFDQSxNQUFNLEVBQUU7SUFDYixJQUFJeEMsTUFBTSxDQUFDcUUsU0FBUyxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQy9CLE1BQU0sQ0FBQyxLQUFLLGlCQUFpQixFQUFFO01BQ2hFLE1BQU0sK0NBQStDO0lBQ3ZEO0lBQ0EsSUFBSUEsTUFBTSxDQUFDb0MsV0FBVyxLQUFLVixTQUFTLEVBQUU7TUFDcEMxQixNQUFNLENBQUNvQyxXQUFXLEdBQUdDLDBCQUFhLENBQUNELFdBQVcsQ0FBQ3pGLE9BQU87SUFDeEQsQ0FBQyxNQUFNLElBQUksQ0FBQ2dGLEtBQUssQ0FBQ0MsT0FBTyxDQUFDNUIsTUFBTSxDQUFDb0MsV0FBVyxDQUFDLEVBQUU7TUFDN0MsTUFBTSwwREFBMEQ7SUFDbEU7SUFDQSxJQUFJcEMsTUFBTSxDQUFDc0MsTUFBTSxLQUFLWixTQUFTLEVBQUU7TUFDL0IxQixNQUFNLENBQUNzQyxNQUFNLEdBQUdELDBCQUFhLENBQUNDLE1BQU0sQ0FBQzNGLE9BQU87SUFDOUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBdUYsaUJBQVMsRUFBQ2xDLE1BQU0sQ0FBQ3NDLE1BQU0sQ0FBQyxFQUFFO01BQ3BDLE1BQU0sc0RBQXNEO0lBQzlEO0lBQ0EsSUFBSXRDLE1BQU0sQ0FBQ3VDLGlCQUFpQixLQUFLYixTQUFTLEVBQUU7TUFDMUMxQixNQUFNLENBQUN1QyxpQkFBaUIsR0FBR0YsMEJBQWEsQ0FBQ0UsaUJBQWlCLENBQUM1RixPQUFPO0lBQ3BFLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXVGLGlCQUFTLEVBQUNsQyxNQUFNLENBQUN1QyxpQkFBaUIsQ0FBQyxFQUFFO01BQy9DLE1BQU0saUVBQWlFO0lBQ3pFO0lBQ0EsSUFBSXZDLE1BQU0sQ0FBQ3dDLHNCQUFzQixLQUFLZCxTQUFTLEVBQUU7TUFDL0MxQixNQUFNLENBQUN3QyxzQkFBc0IsR0FBR0gsMEJBQWEsQ0FBQ0csc0JBQXNCLENBQUM3RixPQUFPO0lBQzlFLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXVGLGlCQUFTLEVBQUNsQyxNQUFNLENBQUN3QyxzQkFBc0IsQ0FBQyxFQUFFO01BQ3BELE1BQU0sc0VBQXNFO0lBQzlFO0lBQ0EsSUFBSXhDLE1BQU0sQ0FBQ3lDLFdBQVcsS0FBS2YsU0FBUyxFQUFFO01BQ3BDMUIsTUFBTSxDQUFDeUMsV0FBVyxHQUFHSiwwQkFBYSxDQUFDSSxXQUFXLENBQUM5RixPQUFPO0lBQ3hELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXVGLGlCQUFTLEVBQUNsQyxNQUFNLENBQUN5QyxXQUFXLENBQUMsRUFBRTtNQUN6QyxNQUFNLDJEQUEyRDtJQUNuRTtJQUNBLElBQUl6QyxNQUFNLENBQUMwQyxlQUFlLEtBQUtoQixTQUFTLEVBQUU7TUFDeEMxQixNQUFNLENBQUMwQyxlQUFlLEdBQUcsSUFBSTtJQUMvQixDQUFDLE1BQU0sSUFBSTFDLE1BQU0sQ0FBQzBDLGVBQWUsS0FBSyxJQUFJLElBQUksT0FBTzFDLE1BQU0sQ0FBQzBDLGVBQWUsS0FBSyxVQUFVLEVBQUU7TUFDMUYsTUFBTSxnRUFBZ0U7SUFDeEU7SUFDQSxJQUFJMUMsTUFBTSxDQUFDMkMsY0FBYyxLQUFLakIsU0FBUyxFQUFFO01BQ3ZDMUIsTUFBTSxDQUFDMkMsY0FBYyxHQUFHLElBQUk7SUFDOUIsQ0FBQyxNQUFNLElBQUkzQyxNQUFNLENBQUMyQyxjQUFjLEtBQUssSUFBSSxJQUFJLE9BQU8zQyxNQUFNLENBQUMyQyxjQUFjLEtBQUssVUFBVSxFQUFFO01BQ3hGLE1BQU0sK0RBQStEO0lBQ3ZFO0VBQ0Y7RUFFQSxPQUFPekIsb0JBQW9CQSxDQUFDckIsS0FBSyxFQUFFO0lBQ2pDLElBQUlyQyxNQUFNLENBQUNxRSxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDbEMsS0FBSyxDQUFDLEtBQUssaUJBQWlCLEVBQUU7TUFDL0QsTUFBTSw4Q0FBOEM7SUFDdEQ7SUFDQSxJQUFJQSxLQUFLLENBQUMrQyxZQUFZLEtBQUtsQixTQUFTLEVBQUU7TUFDcEM3QixLQUFLLENBQUMrQyxZQUFZLEdBQUdDLHlCQUFZLENBQUNELFlBQVksQ0FBQ2pHLE9BQU87SUFDeEQsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBdUYsaUJBQVMsRUFBQ3JDLEtBQUssQ0FBQytDLFlBQVksQ0FBQyxFQUFFO01BQ3pDLE1BQU0sMkRBQTJEO0lBQ25FO0lBQ0EsSUFBSS9DLEtBQUssQ0FBQ2lELGtCQUFrQixLQUFLcEIsU0FBUyxFQUFFO01BQzFDN0IsS0FBSyxDQUFDaUQsa0JBQWtCLEdBQUdELHlCQUFZLENBQUNDLGtCQUFrQixDQUFDbkcsT0FBTztJQUNwRSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUF1RixpQkFBUyxFQUFDckMsS0FBSyxDQUFDaUQsa0JBQWtCLENBQUMsRUFBRTtNQUMvQyxNQUFNLGlFQUFpRTtJQUN6RTtJQUNBLElBQUlqRCxLQUFLLENBQUNrRCxvQkFBb0IsS0FBS3JCLFNBQVMsRUFBRTtNQUM1QzdCLEtBQUssQ0FBQ2tELG9CQUFvQixHQUFHRix5QkFBWSxDQUFDRSxvQkFBb0IsQ0FBQ3BHLE9BQU87SUFDeEUsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBcUcsZ0JBQVEsRUFBQ25ELEtBQUssQ0FBQ2tELG9CQUFvQixDQUFDLEVBQUU7TUFDaEQsTUFBTSxrRUFBa0U7SUFDMUU7SUFDQSxJQUFJbEQsS0FBSyxDQUFDb0QsMEJBQTBCLEtBQUt2QixTQUFTLEVBQUU7TUFDbEQ3QixLQUFLLENBQUNvRCwwQkFBMEIsR0FBR0oseUJBQVksQ0FBQ0ksMEJBQTBCLENBQUN0RyxPQUFPO0lBQ3BGLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXFHLGdCQUFRLEVBQUNuRCxLQUFLLENBQUNvRCwwQkFBMEIsQ0FBQyxFQUFFO01BQ3RELE1BQU0sd0VBQXdFO0lBQ2hGO0lBQ0EsSUFBSXBELEtBQUssQ0FBQ3FELFlBQVksS0FBS3hCLFNBQVMsRUFBRTtNQUNwQzdCLEtBQUssQ0FBQ3FELFlBQVksR0FBR0wseUJBQVksQ0FBQ0ssWUFBWSxDQUFDdkcsT0FBTztJQUN4RCxDQUFDLE1BQU0sSUFDTGEsTUFBTSxDQUFDcUUsU0FBUyxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQ2xDLEtBQUssQ0FBQ3FELFlBQVksQ0FBQyxLQUFLLGlCQUFpQixJQUN4RSxPQUFPckQsS0FBSyxDQUFDcUQsWUFBWSxLQUFLLFVBQVUsRUFDeEM7TUFDQSxNQUFNLHlFQUF5RTtJQUNqRjtJQUNBLElBQUlyRCxLQUFLLENBQUNzRCxhQUFhLEtBQUt6QixTQUFTLEVBQUU7TUFDckM3QixLQUFLLENBQUNzRCxhQUFhLEdBQUdOLHlCQUFZLENBQUNNLGFBQWEsQ0FBQ3hHLE9BQU87SUFDMUQsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFBdUYsaUJBQVMsRUFBQ3JDLEtBQUssQ0FBQ3NELGFBQWEsQ0FBQyxFQUFFO01BQzFDLE1BQU0sNERBQTREO0lBQ3BFO0lBQ0EsSUFBSXRELEtBQUssQ0FBQ3VELFNBQVMsS0FBSzFCLFNBQVMsRUFBRTtNQUNqQzdCLEtBQUssQ0FBQ3VELFNBQVMsR0FBR1AseUJBQVksQ0FBQ08sU0FBUyxDQUFDekcsT0FBTztJQUNsRCxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUFxRyxnQkFBUSxFQUFDbkQsS0FBSyxDQUFDdUQsU0FBUyxDQUFDLEVBQUU7TUFDckMsTUFBTSx1REFBdUQ7SUFDL0Q7SUFDQSxJQUFJdkQsS0FBSyxDQUFDd0QsYUFBYSxLQUFLM0IsU0FBUyxFQUFFO01BQ3JDN0IsS0FBSyxDQUFDd0QsYUFBYSxHQUFHUix5QkFBWSxDQUFDUSxhQUFhLENBQUMxRyxPQUFPO0lBQzFELENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXFHLGdCQUFRLEVBQUNuRCxLQUFLLENBQUN3RCxhQUFhLENBQUMsRUFBRTtNQUN6QyxNQUFNLDJEQUEyRDtJQUNuRTtJQUNBLElBQUl4RCxLQUFLLENBQUN5RCxVQUFVLEtBQUs1QixTQUFTLEVBQUU7TUFDbEM3QixLQUFLLENBQUN5RCxVQUFVLEdBQUdULHlCQUFZLENBQUNTLFVBQVUsQ0FBQzNHLE9BQU87SUFDcEQsQ0FBQyxNQUFNLElBQUlhLE1BQU0sQ0FBQ3FFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUNsQyxLQUFLLENBQUN5RCxVQUFVLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtNQUNqRixNQUFNLHlEQUF5RDtJQUNqRTtJQUNBLElBQUl6RCxLQUFLLENBQUMwRCxZQUFZLEtBQUs3QixTQUFTLEVBQUU7TUFDcEM3QixLQUFLLENBQUMwRCxZQUFZLEdBQUdWLHlCQUFZLENBQUNVLFlBQVksQ0FBQzVHLE9BQU87SUFDeEQsQ0FBQyxNQUFNLElBQUksRUFBRWtELEtBQUssQ0FBQzBELFlBQVksWUFBWTVCLEtBQUssQ0FBQyxFQUFFO01BQ2pELE1BQU0sMERBQTBEO0lBQ2xFO0VBQ0Y7RUFFQSxPQUFPViwwQkFBMEJBLENBQUN2QixrQkFBa0IsRUFBRTtJQUNwRCxJQUFJLENBQUNBLGtCQUFrQixFQUFFO01BQ3ZCO0lBQ0Y7SUFDQSxJQUFJQSxrQkFBa0IsQ0FBQzhELEdBQUcsS0FBSzlCLFNBQVMsRUFBRTtNQUN4Q2hDLGtCQUFrQixDQUFDOEQsR0FBRyxHQUFHQywrQkFBa0IsQ0FBQ0QsR0FBRyxDQUFDN0csT0FBTztJQUN6RCxDQUFDLE1BQU0sSUFBSSxDQUFDK0csS0FBSyxDQUFDaEUsa0JBQWtCLENBQUM4RCxHQUFHLENBQUMsSUFBSTlELGtCQUFrQixDQUFDOEQsR0FBRyxJQUFJLENBQUMsRUFBRTtNQUN4RSxNQUFNLHNEQUFzRDtJQUM5RCxDQUFDLE1BQU0sSUFBSUUsS0FBSyxDQUFDaEUsa0JBQWtCLENBQUM4RCxHQUFHLENBQUMsRUFBRTtNQUN4QyxNQUFNLHdDQUF3QztJQUNoRDtJQUNBLElBQUksQ0FBQzlELGtCQUFrQixDQUFDaUUsS0FBSyxFQUFFO01BQzdCakUsa0JBQWtCLENBQUNpRSxLQUFLLEdBQUdGLCtCQUFrQixDQUFDRSxLQUFLLENBQUNoSCxPQUFPO0lBQzdELENBQUMsTUFBTSxJQUFJLEVBQUUrQyxrQkFBa0IsQ0FBQ2lFLEtBQUssWUFBWWhDLEtBQUssQ0FBQyxFQUFFO01BQ3ZELE1BQU0sa0RBQWtEO0lBQzFEO0VBQ0Y7RUFFQSxPQUFPbkIsNEJBQTRCQSxDQUFDckIsY0FBYyxFQUFFO0lBQ2xELElBQUlBLGNBQWMsRUFBRTtNQUNsQixJQUNFLE9BQU9BLGNBQWMsQ0FBQ3lFLFFBQVEsS0FBSyxRQUFRLElBQzNDekUsY0FBYyxDQUFDeUUsUUFBUSxJQUFJLENBQUMsSUFDNUJ6RSxjQUFjLENBQUN5RSxRQUFRLEdBQUcsS0FBSyxFQUMvQjtRQUNBLE1BQU0sd0VBQXdFO01BQ2hGO01BRUEsSUFDRSxDQUFDQyxNQUFNLENBQUNDLFNBQVMsQ0FBQzNFLGNBQWMsQ0FBQzRFLFNBQVMsQ0FBQyxJQUMzQzVFLGNBQWMsQ0FBQzRFLFNBQVMsR0FBRyxDQUFDLElBQzVCNUUsY0FBYyxDQUFDNEUsU0FBUyxHQUFHLEdBQUcsRUFDOUI7UUFDQSxNQUFNLGtGQUFrRjtNQUMxRjtNQUVBLElBQUk1RSxjQUFjLENBQUM2RSxxQkFBcUIsS0FBS3RDLFNBQVMsRUFBRTtRQUN0RHZDLGNBQWMsQ0FBQzZFLHFCQUFxQixHQUFHQyxrQ0FBcUIsQ0FBQ0QscUJBQXFCLENBQUNySCxPQUFPO01BQzVGLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBQXVGLGlCQUFTLEVBQUMvQyxjQUFjLENBQUM2RSxxQkFBcUIsQ0FBQyxFQUFFO1FBQzNELE1BQU0sNkVBQTZFO01BQ3JGO0lBQ0Y7RUFDRjtFQUVBLE9BQU92RCxzQkFBc0JBLENBQUNqQyxjQUFjLEVBQUU7SUFDNUMsSUFBSUEsY0FBYyxFQUFFO01BQ2xCLElBQ0VBLGNBQWMsQ0FBQzBGLGNBQWMsS0FBS3hDLFNBQVMsS0FDMUMsT0FBT2xELGNBQWMsQ0FBQzBGLGNBQWMsS0FBSyxRQUFRLElBQUkxRixjQUFjLENBQUMwRixjQUFjLEdBQUcsQ0FBQyxDQUFDLEVBQ3hGO1FBQ0EsTUFBTSx5REFBeUQ7TUFDakU7TUFFQSxJQUNFMUYsY0FBYyxDQUFDMkYsMEJBQTBCLEtBQUt6QyxTQUFTLEtBQ3RELE9BQU9sRCxjQUFjLENBQUMyRiwwQkFBMEIsS0FBSyxRQUFRLElBQzVEM0YsY0FBYyxDQUFDMkYsMEJBQTBCLElBQUksQ0FBQyxDQUFDLEVBQ2pEO1FBQ0EsTUFBTSxxRUFBcUU7TUFDN0U7TUFFQSxJQUFJM0YsY0FBYyxDQUFDNEYsZ0JBQWdCLEVBQUU7UUFDbkMsSUFBSSxPQUFPNUYsY0FBYyxDQUFDNEYsZ0JBQWdCLEtBQUssUUFBUSxFQUFFO1VBQ3ZENUYsY0FBYyxDQUFDNEYsZ0JBQWdCLEdBQUcsSUFBSUMsTUFBTSxDQUFDN0YsY0FBYyxDQUFDNEYsZ0JBQWdCLENBQUM7UUFDL0UsQ0FBQyxNQUFNLElBQUksRUFBRTVGLGNBQWMsQ0FBQzRGLGdCQUFnQixZQUFZQyxNQUFNLENBQUMsRUFBRTtVQUMvRCxNQUFNLDBFQUEwRTtRQUNsRjtNQUNGO01BRUEsSUFDRTdGLGNBQWMsQ0FBQzhGLGlCQUFpQixJQUNoQyxPQUFPOUYsY0FBYyxDQUFDOEYsaUJBQWlCLEtBQUssVUFBVSxFQUN0RDtRQUNBLE1BQU0sc0RBQXNEO01BQzlEO01BRUEsSUFDRTlGLGNBQWMsQ0FBQytGLGtCQUFrQixJQUNqQyxPQUFPL0YsY0FBYyxDQUFDK0Ysa0JBQWtCLEtBQUssU0FBUyxFQUN0RDtRQUNBLE1BQU0sNERBQTREO01BQ3BFO01BRUEsSUFDRS9GLGNBQWMsQ0FBQ2dHLGtCQUFrQixLQUNoQyxDQUFDWCxNQUFNLENBQUNDLFNBQVMsQ0FBQ3RGLGNBQWMsQ0FBQ2dHLGtCQUFrQixDQUFDLElBQ25EaEcsY0FBYyxDQUFDZ0csa0JBQWtCLElBQUksQ0FBQyxJQUN0Q2hHLGNBQWMsQ0FBQ2dHLGtCQUFrQixHQUFHLEVBQUUsQ0FBQyxFQUN6QztRQUNBLE1BQU0scUVBQXFFO01BQzdFO01BRUEsSUFDRWhHLGNBQWMsQ0FBQ2lHLHNCQUFzQixJQUNyQyxPQUFPakcsY0FBYyxDQUFDaUcsc0JBQXNCLEtBQUssU0FBUyxFQUMxRDtRQUNBLE1BQU0sZ0RBQWdEO01BQ3hEO01BQ0EsSUFBSWpHLGNBQWMsQ0FBQ2lHLHNCQUFzQixJQUFJLENBQUNqRyxjQUFjLENBQUMyRiwwQkFBMEIsRUFBRTtRQUN2RixNQUFNLDBFQUEwRTtNQUNsRjtJQUNGO0VBQ0Y7O0VBRUE7RUFDQSxPQUFPNUYsc0JBQXNCQSxDQUFDQyxjQUFjLEVBQUU7SUFDNUMsSUFBSUEsY0FBYyxJQUFJQSxjQUFjLENBQUM0RixnQkFBZ0IsRUFBRTtNQUNyRDVGLGNBQWMsQ0FBQ2tHLGdCQUFnQixHQUFHQyxLQUFLLElBQUk7UUFDekMsT0FBT25HLGNBQWMsQ0FBQzRGLGdCQUFnQixDQUFDUSxJQUFJLENBQUNELEtBQUssQ0FBQztNQUNwRCxDQUFDO0lBQ0g7RUFDRjtFQUVBLE9BQU9wRSwwQkFBMEJBLENBQUM7SUFDaENELFlBQVk7SUFDWjNCLE9BQU87SUFDUEMsZUFBZTtJQUNmTSxnQ0FBZ0M7SUFDaENTO0VBQ0YsQ0FBQyxFQUFFO0lBQ0QsSUFBSSxDQUFDVyxZQUFZLEVBQUU7TUFDakIsTUFBTSwwRUFBMEU7SUFDbEY7SUFDQSxJQUFJLE9BQU8zQixPQUFPLEtBQUssUUFBUSxFQUFFO01BQy9CLE1BQU0sc0VBQXNFO0lBQzlFO0lBQ0EsSUFBSSxPQUFPQyxlQUFlLEtBQUssUUFBUSxFQUFFO01BQ3ZDLE1BQU0sOEVBQThFO0lBQ3RGO0lBQ0EsSUFBSU0sZ0NBQWdDLEVBQUU7TUFDcEMsSUFBSXdFLEtBQUssQ0FBQ3hFLGdDQUFnQyxDQUFDLEVBQUU7UUFDM0MsTUFBTSw4REFBOEQ7TUFDdEUsQ0FBQyxNQUFNLElBQUlBLGdDQUFnQyxJQUFJLENBQUMsRUFBRTtRQUNoRCxNQUFNLHNFQUFzRTtNQUM5RTtJQUNGO0lBQ0EsSUFBSVMsNEJBQTRCLElBQUksT0FBT0EsNEJBQTRCLEtBQUssU0FBUyxFQUFFO01BQ3JGLE1BQU0sc0RBQXNEO0lBQzlEO0lBQ0EsSUFBSUEsNEJBQTRCLElBQUksQ0FBQ1QsZ0NBQWdDLEVBQUU7TUFDckUsTUFBTSxzRkFBc0Y7SUFDOUY7RUFDRjtFQUVBLE9BQU93Qix5QkFBeUJBLENBQUNkLFVBQVUsRUFBRTtJQUMzQyxJQUFJO01BQ0YsSUFBSUEsVUFBVSxJQUFJLElBQUksSUFBSSxPQUFPQSxVQUFVLEtBQUssUUFBUSxJQUFJQSxVQUFVLFlBQVkrQixLQUFLLEVBQUU7UUFDdkYsTUFBTSxxQ0FBcUM7TUFDN0M7SUFDRixDQUFDLENBQUMsT0FBT2tELENBQUMsRUFBRTtNQUNWLElBQUlBLENBQUMsWUFBWUMsY0FBYyxFQUFFO1FBQy9CO01BQ0Y7TUFDQSxNQUFNRCxDQUFDO0lBQ1Q7SUFDQSxJQUFJakYsVUFBVSxDQUFDbUYsc0JBQXNCLEtBQUtyRCxTQUFTLEVBQUU7TUFDbkQ5QixVQUFVLENBQUNtRixzQkFBc0IsR0FBR0MsOEJBQWlCLENBQUNELHNCQUFzQixDQUFDcEksT0FBTztJQUN0RixDQUFDLE1BQU0sSUFBSSxPQUFPaUQsVUFBVSxDQUFDbUYsc0JBQXNCLEtBQUssU0FBUyxFQUFFO01BQ2pFLE1BQU0sNERBQTREO0lBQ3BFO0lBQ0EsSUFBSW5GLFVBQVUsQ0FBQ3FGLGVBQWUsS0FBS3ZELFNBQVMsRUFBRTtNQUM1QzlCLFVBQVUsQ0FBQ3FGLGVBQWUsR0FBR0QsOEJBQWlCLENBQUNDLGVBQWUsQ0FBQ3RJLE9BQU87SUFDeEUsQ0FBQyxNQUFNLElBQUksT0FBT2lELFVBQVUsQ0FBQ3FGLGVBQWUsS0FBSyxTQUFTLEVBQUU7TUFDMUQsTUFBTSxxREFBcUQ7SUFDN0Q7SUFDQSxJQUFJckYsVUFBVSxDQUFDc0YsMEJBQTBCLEtBQUt4RCxTQUFTLEVBQUU7TUFDdkQ5QixVQUFVLENBQUNzRiwwQkFBMEIsR0FBR0YsOEJBQWlCLENBQUNFLDBCQUEwQixDQUFDdkksT0FBTztJQUM5RixDQUFDLE1BQU0sSUFBSSxPQUFPaUQsVUFBVSxDQUFDc0YsMEJBQTBCLEtBQUssU0FBUyxFQUFFO01BQ3JFLE1BQU0sZ0VBQWdFO0lBQ3hFO0VBQ0Y7RUFFQSxPQUFPckUsV0FBV0EsQ0FBQ3NFLEtBQUssRUFBRS9GLFlBQVksRUFBRTtJQUN0QyxLQUFLLElBQUlnRyxFQUFFLElBQUloRyxZQUFZLEVBQUU7TUFDM0IsSUFBSWdHLEVBQUUsQ0FBQ0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ3BCRCxFQUFFLEdBQUdBLEVBQUUsQ0FBQ0UsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUN2QjtNQUNBLElBQUksQ0FBQ0MsWUFBRyxDQUFDQyxJQUFJLENBQUNKLEVBQUUsQ0FBQyxFQUFFO1FBQ2pCLE1BQU8sNEJBQTJCRCxLQUFNLHFDQUFvQ0MsRUFBRyxJQUFHO01BQ3BGO0lBQ0Y7RUFDRjtFQUVBLElBQUloSSxLQUFLQSxDQUFBLEVBQUc7SUFDVixJQUFJQSxLQUFLLEdBQUcsSUFBSSxDQUFDcUksTUFBTTtJQUN2QixJQUFJLElBQUksQ0FBQzdHLGVBQWUsRUFBRTtNQUN4QnhCLEtBQUssR0FBRyxJQUFJLENBQUN3QixlQUFlO0lBQzlCO0lBQ0EsT0FBT3hCLEtBQUs7RUFDZDtFQUVBLElBQUlBLEtBQUtBLENBQUNzSSxRQUFRLEVBQUU7SUFDbEIsSUFBSSxDQUFDRCxNQUFNLEdBQUdDLFFBQVE7RUFDeEI7RUFFQSxPQUFPOUUsNEJBQTRCQSxDQUFDN0IsYUFBYSxFQUFFRCxzQkFBc0IsRUFBRTtJQUN6RSxJQUFJQSxzQkFBc0IsRUFBRTtNQUMxQixJQUFJNEUsS0FBSyxDQUFDM0UsYUFBYSxDQUFDLEVBQUU7UUFDeEIsTUFBTSx3Q0FBd0M7TUFDaEQsQ0FBQyxNQUFNLElBQUlBLGFBQWEsSUFBSSxDQUFDLEVBQUU7UUFDN0IsTUFBTSxnREFBZ0Q7TUFDeEQ7SUFDRjtFQUNGO0VBRUEsT0FBTytCLG9CQUFvQkEsQ0FBQzlCLFlBQVksRUFBRTtJQUN4QyxJQUFJQSxZQUFZLElBQUksSUFBSSxFQUFFO01BQ3hCQSxZQUFZLEdBQUcyRywrQkFBa0IsQ0FBQzNHLFlBQVksQ0FBQ3JDLE9BQU87SUFDeEQ7SUFDQSxJQUFJLE9BQU9xQyxZQUFZLEtBQUssUUFBUSxFQUFFO01BQ3BDLE1BQU0saUNBQWlDO0lBQ3pDO0lBQ0EsSUFBSUEsWUFBWSxJQUFJLENBQUMsRUFBRTtNQUNyQixNQUFNLCtDQUErQztJQUN2RDtFQUNGO0VBRUEsT0FBTytCLGdCQUFnQkEsQ0FBQzlCLFFBQVEsRUFBRTtJQUNoQyxJQUFJQSxRQUFRLElBQUksQ0FBQyxFQUFFO01BQ2pCLE1BQU0sMkNBQTJDO0lBQ25EO0VBQ0Y7RUFFQSxPQUFPK0Isb0JBQW9CQSxDQUFDdkIsWUFBWSxFQUFFO0lBQ3hDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRWlDLFNBQVMsQ0FBQyxDQUFDMkQsUUFBUSxDQUFDNUYsWUFBWSxDQUFDLEVBQUU7TUFDN0MsSUFBSWtDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDbkMsWUFBWSxDQUFDLEVBQUU7UUFDL0JBLFlBQVksQ0FBQy9CLE9BQU8sQ0FBQ2tJLE1BQU0sSUFBSTtVQUM3QixJQUFJLE9BQU9BLE1BQU0sS0FBSyxRQUFRLEVBQUU7WUFDOUIsTUFBTSx5Q0FBeUM7VUFDakQsQ0FBQyxNQUFNLElBQUksQ0FBQ0EsTUFBTSxDQUFDQyxJQUFJLEVBQUUsQ0FBQzdJLE1BQU0sRUFBRTtZQUNoQyxNQUFNLDhDQUE4QztVQUN0RDtRQUNGLENBQUMsQ0FBQztNQUNKLENBQUMsTUFBTTtRQUNMLE1BQU0sZ0NBQWdDO01BQ3hDO0lBQ0Y7RUFDRjtFQUVBLE9BQU95RSxpQkFBaUJBLENBQUN0QixTQUFTLEVBQUU7SUFDbEMsS0FBSyxNQUFNeEMsR0FBRyxJQUFJSCxNQUFNLENBQUNDLElBQUksQ0FBQ3FJLHNCQUFTLENBQUMsRUFBRTtNQUN4QyxJQUFJM0YsU0FBUyxDQUFDeEMsR0FBRyxDQUFDLEVBQUU7UUFDbEIsSUFBSW9JLDJCQUFjLENBQUNDLE9BQU8sQ0FBQzdGLFNBQVMsQ0FBQ3hDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7VUFDakQsTUFBTyxJQUFHQSxHQUFJLG9CQUFtQnNJLElBQUksQ0FBQ0MsU0FBUyxDQUFDSCwyQkFBYyxDQUFFLEVBQUM7UUFDbkU7TUFDRixDQUFDLE1BQU07UUFDTDVGLFNBQVMsQ0FBQ3hDLEdBQUcsQ0FBQyxHQUFHbUksc0JBQVMsQ0FBQ25JLEdBQUcsQ0FBQyxDQUFDaEIsT0FBTztNQUN6QztJQUNGO0VBQ0Y7RUFFQSxPQUFPNkUsaUJBQWlCQSxDQUFDcEIsU0FBUyxFQUFFO0lBQ2xDLElBQUksQ0FBQ0EsU0FBUyxFQUFFO01BQ2Q7SUFDRjtJQUNBLElBQ0U1QyxNQUFNLENBQUNxRSxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDM0IsU0FBUyxDQUFDLEtBQUssaUJBQWlCLElBQy9ELENBQUN1QixLQUFLLENBQUNDLE9BQU8sQ0FBQ3hCLFNBQVMsQ0FBQyxFQUN6QjtNQUNBLE1BQU8sc0NBQXFDO0lBQzlDO0lBQ0EsTUFBTStGLE9BQU8sR0FBR3hFLEtBQUssQ0FBQ0MsT0FBTyxDQUFDeEIsU0FBUyxDQUFDLEdBQUdBLFNBQVMsR0FBRyxDQUFDQSxTQUFTLENBQUM7SUFDbEUsS0FBSyxNQUFNZ0csTUFBTSxJQUFJRCxPQUFPLEVBQUU7TUFDNUIsSUFBSTNJLE1BQU0sQ0FBQ3FFLFNBQVMsQ0FBQ0MsUUFBUSxDQUFDQyxJQUFJLENBQUNxRSxNQUFNLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtRQUNoRSxNQUFPLHVDQUFzQztNQUMvQztNQUNBLElBQUlBLE1BQU0sQ0FBQ0MsV0FBVyxJQUFJLElBQUksRUFBRTtRQUM5QixNQUFPLHVDQUFzQztNQUMvQztNQUNBLElBQUksT0FBT0QsTUFBTSxDQUFDQyxXQUFXLEtBQUssUUFBUSxFQUFFO1FBQzFDLE1BQU8sd0NBQXVDO01BQ2hEO01BQ0EsSUFBSUQsTUFBTSxDQUFDRSxpQkFBaUIsSUFBSSxJQUFJLEVBQUU7UUFDcEMsTUFBTyw2Q0FBNEM7TUFDckQ7TUFDQSxJQUFJLE9BQU9GLE1BQU0sQ0FBQ0UsaUJBQWlCLEtBQUssUUFBUSxFQUFFO1FBQ2hELE1BQU8sOENBQTZDO01BQ3REO01BQ0EsSUFBSUYsTUFBTSxDQUFDRyx1QkFBdUIsSUFBSSxPQUFPSCxNQUFNLENBQUNHLHVCQUF1QixLQUFLLFNBQVMsRUFBRTtRQUN6RixNQUFPLHFEQUFvRDtNQUM3RDtNQUNBLElBQUlILE1BQU0sQ0FBQ0ksWUFBWSxJQUFJLElBQUksRUFBRTtRQUMvQixNQUFPLHdDQUF1QztNQUNoRDtNQUNBLElBQUksT0FBT0osTUFBTSxDQUFDSSxZQUFZLEtBQUssUUFBUSxFQUFFO1FBQzNDLE1BQU8seUNBQXdDO01BQ2pEO01BQ0EsSUFBSUosTUFBTSxDQUFDSyxvQkFBb0IsSUFBSSxPQUFPTCxNQUFNLENBQUNLLG9CQUFvQixLQUFLLFFBQVEsRUFBRTtRQUNsRixNQUFPLGlEQUFnRDtNQUN6RDtJQUNGO0VBQ0Y7RUFFQXZJLGlDQUFpQ0EsQ0FBQSxFQUFHO0lBQ2xDLElBQUksQ0FBQyxJQUFJLENBQUNPLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDUyxnQ0FBZ0MsRUFBRTtNQUNwRSxPQUFPd0MsU0FBUztJQUNsQjtJQUNBLElBQUlnRixHQUFHLEdBQUcsSUFBSUMsSUFBSSxFQUFFO0lBQ3BCLE9BQU8sSUFBSUEsSUFBSSxDQUFDRCxHQUFHLENBQUNFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQzFILGdDQUFnQyxHQUFHLElBQUksQ0FBQztFQUMvRTtFQUVBMkgsbUNBQW1DQSxDQUFBLEVBQUc7SUFDcEMsSUFBSSxDQUFDLElBQUksQ0FBQ3JJLGNBQWMsSUFBSSxDQUFDLElBQUksQ0FBQ0EsY0FBYyxDQUFDMkYsMEJBQTBCLEVBQUU7TUFDM0UsT0FBT3pDLFNBQVM7SUFDbEI7SUFDQSxNQUFNZ0YsR0FBRyxHQUFHLElBQUlDLElBQUksRUFBRTtJQUN0QixPQUFPLElBQUlBLElBQUksQ0FBQ0QsR0FBRyxDQUFDRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUNwSSxjQUFjLENBQUMyRiwwQkFBMEIsR0FBRyxJQUFJLENBQUM7RUFDeEY7RUFFQW5HLHdCQUF3QkEsQ0FBQSxFQUFHO0lBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUNjLHNCQUFzQixFQUFFO01BQ2hDLE9BQU80QyxTQUFTO0lBQ2xCO0lBQ0EsSUFBSWdGLEdBQUcsR0FBRyxJQUFJQyxJQUFJLEVBQUU7SUFDcEIsT0FBTyxJQUFJQSxJQUFJLENBQUNELEdBQUcsQ0FBQ0UsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDN0gsYUFBYSxHQUFHLElBQUksQ0FBQztFQUM1RDtFQUVBLElBQUkrSCxjQUFjQSxDQUFBLEVBQUc7SUFDbkIsT0FBTyxJQUFJLENBQUNDLFdBQVcsQ0FBQ0MsV0FBVyxJQUFLLEdBQUUsSUFBSSxDQUFDcEksZUFBZ0IseUJBQXdCO0VBQ3pGO0VBRUEsSUFBSXFJLDBCQUEwQkEsQ0FBQSxFQUFHO0lBQy9CLE9BQ0UsSUFBSSxDQUFDRixXQUFXLENBQUNHLHVCQUF1QixJQUN2QyxHQUFFLElBQUksQ0FBQ3RJLGVBQWdCLHNDQUFxQztFQUVqRTtFQUVBLElBQUl1SSxrQkFBa0JBLENBQUEsRUFBRztJQUN2QixPQUNFLElBQUksQ0FBQ0osV0FBVyxDQUFDSyxlQUFlLElBQUssR0FBRSxJQUFJLENBQUN4SSxlQUFnQiw4QkFBNkI7RUFFN0Y7RUFFQSxJQUFJeUksZUFBZUEsQ0FBQSxFQUFHO0lBQ3BCLE9BQU8sSUFBSSxDQUFDTixXQUFXLENBQUNPLFlBQVksSUFBSyxHQUFFLElBQUksQ0FBQzFJLGVBQWdCLDJCQUEwQjtFQUM1RjtFQUVBLElBQUkySSxxQkFBcUJBLENBQUEsRUFBRztJQUMxQixPQUNFLElBQUksQ0FBQ1IsV0FBVyxDQUFDUyxrQkFBa0IsSUFDbEMsR0FBRSxJQUFJLENBQUM1SSxlQUFnQixpQ0FBZ0M7RUFFNUQ7RUFFQSxJQUFJNkksaUJBQWlCQSxDQUFBLEVBQUc7SUFDdEIsT0FBTyxJQUFJLENBQUNWLFdBQVcsQ0FBQ1csY0FBYyxJQUFLLEdBQUUsSUFBSSxDQUFDOUksZUFBZ0IsdUJBQXNCO0VBQzFGO0VBRUEsSUFBSStJLHVCQUF1QkEsQ0FBQSxFQUFHO0lBQzVCLE9BQVEsR0FBRSxJQUFJLENBQUMvSSxlQUFnQixJQUFHLElBQUksQ0FBQ3lFLGFBQWMsSUFBRyxJQUFJLENBQUNsRyxhQUFjLHlCQUF3QjtFQUNyRztFQUVBLElBQUl5Syx1QkFBdUJBLENBQUEsRUFBRztJQUM1QixPQUNFLElBQUksQ0FBQ2IsV0FBVyxDQUFDYyxvQkFBb0IsSUFDcEMsR0FBRSxJQUFJLENBQUNqSixlQUFnQixtQ0FBa0M7RUFFOUQ7RUFFQSxJQUFJa0osYUFBYUEsQ0FBQSxFQUFHO0lBQ2xCLE9BQU8sSUFBSSxDQUFDZixXQUFXLENBQUNlLGFBQWE7RUFDdkM7RUFFQSxJQUFJQyxjQUFjQSxDQUFBLEVBQUc7SUFDbkIsT0FBUSxHQUFFLElBQUksQ0FBQ25KLGVBQWdCLElBQUcsSUFBSSxDQUFDeUUsYUFBYyxJQUFHLElBQUksQ0FBQ2xHLGFBQWMsZUFBYztFQUMzRjs7RUFFQTtFQUNBO0VBQ0EsSUFBSWtHLGFBQWFBLENBQUEsRUFBRztJQUNsQixPQUFPLElBQUksQ0FBQ3hELEtBQUssSUFBSSxJQUFJLENBQUNBLEtBQUssQ0FBQytDLFlBQVksSUFBSSxJQUFJLENBQUMvQyxLQUFLLENBQUN3RCxhQUFhLEdBQ3BFLElBQUksQ0FBQ3hELEtBQUssQ0FBQ3dELGFBQWEsR0FDeEIsTUFBTTtFQUNaO0FBQ0Y7QUFBQzJFLE9BQUEsQ0FBQS9LLE1BQUEsR0FBQUEsTUFBQTtBQUFBLElBQUFnTCxRQUFBLEdBRWNoTCxNQUFNO0FBQUErSyxPQUFBLENBQUFyTCxPQUFBLEdBQUFzTCxRQUFBO0FBQ3JCQyxNQUFNLENBQUNGLE9BQU8sR0FBRy9LLE1BQU0ifQ==