"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _net = _interopRequireDefault(require("net"));
var _Definitions = require("./Options/Definitions");
var _lodash = require("lodash");
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
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
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
    this.validateMasterKeyIps(masterKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
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
  static validateMasterKeyIps(masterKeyIps) {
    for (const ip of masterKeyIps) {
      if (!_net.default.isIP(ip)) {
        throw `Invalid ip in masterKeyIps: ${ip}`;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHIiLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZSIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsImRlZmF1bHRMaW1pdCIsIm1heExpbWl0IiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImZpbGVVcGxvYWQiLCJwYWdlcyIsInNlY3VyaXR5IiwiZW5mb3JjZVByaXZhdGVVc2VycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJFcnJvciIsImVtYWlsQWRhcHRlciIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwidmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeSIsInZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJ2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zIiwic3RhcnRzV2l0aCIsInZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU1hc3RlcktleUlwcyIsInZhbGlkYXRlRGVmYXVsdExpbWl0IiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwidmFsaWRhdGVTY2hlbWFPcHRpb25zIiwidmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzIiwidmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwidW5kZWZpbmVkIiwiZGVmYXVsdCIsIkFycmF5IiwiaXNBcnJheSIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiaXNCb29sZWFuIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJpc1N0cmluZyIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiZSIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJpcCIsIm5ldCIsImlzSVAiLCJfbW91bnQiLCJuZXdWYWx1ZSIsIlBhcnNlU2VydmVyT3B0aW9ucyIsImluY2x1ZGVzIiwiaGVhZGVyIiwidHJpbSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBQYXJzZVNlcnZlck9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzU3RyaW5nIH0gZnJvbSAnbG9kYXNoJztcblxuZnVuY3Rpb24gcmVtb3ZlVHJhaWxpbmdTbGFzaChzdHIpIHtcbiAgaWYgKCFzdHIpIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG4gIGlmIChzdHIuZW5kc1dpdGgoJy8nKSkge1xuICAgIHN0ciA9IHN0ci5zdWJzdHIoMCwgc3RyLmxlbmd0aCAtIDEpO1xuICB9XG4gIHJldHVybiBzdHI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWcge1xuICBzdGF0aWMgZ2V0KGFwcGxpY2F0aW9uSWQ6IHN0cmluZywgbW91bnQ6IHN0cmluZykge1xuICAgIGNvbnN0IGNhY2hlSW5mbyA9IEFwcENhY2hlLmdldChhcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIWNhY2hlSW5mbykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnKCk7XG4gICAgY29uZmlnLmFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkO1xuICAgIE9iamVjdC5rZXlzKGNhY2hlSW5mbykuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PSAnZGF0YWJhc2VDb250cm9sbGVyJykge1xuICAgICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGNhY2hlSW5mby5kYXRhYmFzZUNvbnRyb2xsZXIuYWRhcHRlciwgY29uZmlnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbmZpZ1trZXldID0gY2FjaGVJbmZvW2tleV07XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uZmlnLm1vdW50ID0gcmVtb3ZlVHJhaWxpbmdTbGFzaChtb3VudCk7XG4gICAgY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQuYmluZChjb25maWcpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0LmJpbmQoXG4gICAgICBjb25maWdcbiAgICApO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICBzdGF0aWMgcHV0KHNlcnZlckNvbmZpZ3VyYXRpb24pIHtcbiAgICBDb25maWcudmFsaWRhdGUoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlKHtcbiAgICB2ZXJpZnlVc2VyRW1haWxzLFxuICAgIHVzZXJDb250cm9sbGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcykge1xuICAgIGZvciAoY29uc3QgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBpcCBpbiBtYXN0ZXJLZXlJcHM6ICR7aXB9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KSB7XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA9PSBudWxsKSB7XG4gICAgICBkZWZhdWx0TGltaXQgPSBQYXJzZVNlcnZlck9wdGlvbnMuZGVmYXVsdExpbWl0LmRlZmF1bHQ7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZGVmYXVsdExpbWl0ICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgJ0RlZmF1bHQgbGltaXQgbXVzdCBiZSBhIG51bWJlci4nO1xuICAgIH1cbiAgICBpZiAoZGVmYXVsdExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQVNBO0FBQTZDO0FBaEI3QztBQUNBO0FBQ0E7O0FBZ0JBLFNBQVNBLG1CQUFtQixDQUFDQyxHQUFHLEVBQUU7RUFDaEMsSUFBSSxDQUFDQSxHQUFHLEVBQUU7SUFDUixPQUFPQSxHQUFHO0VBQ1o7RUFDQSxJQUFJQSxHQUFHLENBQUNDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNyQkQsR0FBRyxHQUFHQSxHQUFHLENBQUNFLE1BQU0sQ0FBQyxDQUFDLEVBQUVGLEdBQUcsQ0FBQ0csTUFBTSxHQUFHLENBQUMsQ0FBQztFQUNyQztFQUNBLE9BQU9ILEdBQUc7QUFDWjtBQUVPLE1BQU1JLE1BQU0sQ0FBQztFQUNsQixPQUFPQyxHQUFHLENBQUNDLGFBQXFCLEVBQUVDLEtBQWEsRUFBRTtJQUMvQyxNQUFNQyxTQUFTLEdBQUdDLGNBQVEsQ0FBQ0osR0FBRyxDQUFDQyxhQUFhLENBQUM7SUFDN0MsSUFBSSxDQUFDRSxTQUFTLEVBQUU7TUFDZDtJ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