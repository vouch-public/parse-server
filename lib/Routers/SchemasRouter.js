"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SchemasRouter = void 0;

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// schemas.js
var Parse = require('parse/node').Parse,
    SchemaController = require('../Controllers/SchemaController');

function classNameMismatchResponse(bodyClass, pathClass) {
  throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class name mismatch between ${bodyClass} and ${pathClass}.`);
}

function getAllSchemas(req) {
  return req.config.database.loadSchema({
    clearCache: true
  }).then(schemaController => schemaController.getAllClasses(true)).then(schemas => ({
    response: {
      results: schemas
    }
  }));
}

function getOneSchema(req) {
  const className = req.params.className;
  return req.config.database.loadSchema({
    clearCache: true
  }).then(schemaController => schemaController.getOneSchema(className, true)).then(schema => ({
    response: schema
  })).catch(error => {
    if (error === undefined) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
    } else {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    }
  });
}

function createSchema(req) {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to create a schema.");
  }

  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return classNameMismatchResponse(req.body.className, req.params.className);
    }
  }

  const className = req.params.className || req.body.className;

  if (!className) {
    throw new Parse.Error(135, `POST ${req.path} needs a class name.`);
  }

  return req.config.database.loadSchema({
    clearCache: true
  }).then(schema => schema.addClassIfNotExists(className, req.body.fields, req.body.classLevelPermissions, req.body.indexes)).then(schema => ({
    response: schema
  }));
}

function modifySchema(req) {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update a schema.");
  }

  if (req.body.className && req.body.className != req.params.className) {
    return classNameMismatchResponse(req.body.className, req.params.className);
  }

  const submittedFields = req.body.fields || {};
  const className = req.params.className;
  return req.config.database.loadSchema({
    clearCache: true
  }).then(schema => schema.updateClass(className, submittedFields, req.body.classLevelPermissions, req.body.indexes, req.config.database)).then(result => ({
    response: result
  }));
}

const deleteSchema = req => {
  if (req.auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to delete a schema.");
  }

  if (!SchemaController.classNameIsValid(req.params.className)) {
    throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, SchemaController.invalidClassNameMessage(req.params.className));
  }

  return req.config.database.deleteSchema(req.params.className).then(() => ({
    response: {}
  }));
};

class SchemasRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('GET', '/schemas', middleware.promiseEnforceMasterKeyAccess, getAllSchemas);
    this.route('GET', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, getOneSchema);
    this.route('POST', '/schemas', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('POST', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, createSchema);
    this.route('PUT', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, modifySchema);
    this.route('DELETE', '/schemas/:className', middleware.promiseEnforceMasterKeyAccess, deleteSchema);
  }

}

exports.SchemasRouter = SchemasRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXIuanMiXSwibmFtZXMiOlsiUGFyc2UiLCJyZXF1aXJlIiwiU2NoZW1hQ29udHJvbGxlciIsImNsYXNzTmFtZU1pc21hdGNoUmVzcG9uc2UiLCJib2R5Q2xhc3MiLCJwYXRoQ2xhc3MiLCJFcnJvciIsIklOVkFMSURfQ0xBU1NfTkFNRSIsImdldEFsbFNjaGVtYXMiLCJyZXEiLCJjb25maWciLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJjbGVhckNhY2hlIiwidGhlbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hcyIsInJlc3BvbnNlIiwicmVzdWx0cyIsImdldE9uZVNjaGVtYSIsImNsYXNzTmFtZSIsInBhcmFtcyIsInNjaGVtYSIsImNhdGNoIiwiZXJyb3IiLCJ1bmRlZmluZWQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJjcmVhdGVTY2hlbWEiLCJhdXRoIiwiaXNSZWFkT25seSIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJib2R5IiwicGF0aCIsImFkZENsYXNzSWZOb3RFeGlzdHMiLCJmaWVsZHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9kaWZ5U2NoZW1hIiwic3VibWl0dGVkRmllbGRzIiwidXBkYXRlQ2xhc3MiLCJyZXN1bHQiLCJkZWxldGVTY2hlbWEiLCJjbGFzc05hbWVJc1ZhbGlkIiwiaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UiLCJTY2hlbWFzUm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFLQTs7QUFDQTs7Ozs7Ozs7QUFOQTtBQUVBLElBQUlBLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBUCxDQUFzQkQsS0FBbEM7QUFBQSxJQUNFRSxnQkFBZ0IsR0FBR0Qs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QXdFMUMsYUFBeEU7QUFDQSxTQUFLd0MsS0FBTCxDQUNFLEtBREYsRUFFRSxxQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUU5QixZQUpGO0FBTUEsU0FBSzRCLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLFVBQW5CLEVBQStCQyxVQUFVLENBQUNDLDZCQUExQyxFQUF5RXRCLFlBQXpFO0FBQ0EsU0FBS29CLEtBQUwsQ0FDRSxNQURGLEVBRUUscUJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFdEIsWUFKRjtBQU1BLFNBQUtvQixLQUFMLENBQ0UsS0FERixFQUVFLHFCQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRVosWUFKRjtBQU1BLFNBQUtVLEtBQUwsQ0FDRSxRQURGLEVBRUUscUJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFUixZQUpGO0FBTUQ7O0FBNUI4QyIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNjaGVtYXMuanNcblxudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xuXG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCAqIGFzIG1pZGRsZXdhcmUgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5mdW5jdGlvbiBjbGFzc05hbWVNaXNtYXRjaFJlc3BvbnNlKGJvZHlDbGFzcywgcGF0aENsYXNzKSB7XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgYENsYXNzIG5hbWUgbWlzbWF0Y2ggYmV0d2VlbiAke2JvZHlDbGFzc30gYW5kICR7cGF0aENsYXNzfS5gXG4gICk7XG59XG5cbmZ1bmN0aW9uIGdldEFsbFNjaGVtYXMocmVxKSB7XG4gIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXModHJ1ZSkpXG4gICAgLnRoZW4oc2NoZW1hcyA9PiAoeyByZXNwb25zZTogeyByZXN1bHRzOiBzY2hlbWFzIH0gfSkpO1xufVxuXG5mdW5jdGlvbiBnZXRPbmVTY2hlbWEocmVxKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHJlcS5wYXJhbXMuY2xhc3NOYW1lO1xuICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAudGhlbihzY2hlbWEgPT4gKHsgcmVzcG9uc2U6IHNjaGVtYSB9KSlcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yLicpO1xuICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTY2hlbWEocmVxKSB7XG4gIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGNyZWF0ZSBhIHNjaGVtYS5cIlxuICAgICk7XG4gIH1cbiAgaWYgKHJlcS5wYXJhbXMuY2xhc3NOYW1lICYmIHJlcS5ib2R5LmNsYXNzTmFtZSkge1xuICAgIGlmIChyZXEucGFyYW1zLmNsYXNzTmFtZSAhPSByZXEuYm9keS5jbGFzc05hbWUpIHtcbiAgICAgIHJldHVybiBjbGFzc05hbWVNaXNtYXRjaFJlc3BvbnNlKHJlcS5ib2R5LmNsYXNzTmFtZSwgcmVxLnBhcmFtcy5jbGFzc05hbWUpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNsYXNzTmFtZSA9IHJlcS5wYXJhbXMuY2xhc3NOYW1lIHx8IHJlcS5ib2R5LmNsYXNzTmFtZTtcbiAgaWYgKCFjbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgUE9TVCAke3JlcS5wYXRofSBuZWVkcyBhIGNsYXNzIG5hbWUuYCk7XG4gIH1cblxuICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgIC50aGVuKHNjaGVtYSA9PlxuICAgICAgc2NoZW1hLmFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVxLmJvZHkuZmllbGRzLFxuICAgICAgICByZXEuYm9keS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIHJlcS5ib2R5LmluZGV4ZXNcbiAgICAgIClcbiAgICApXG4gICAgLnRoZW4oc2NoZW1hID0+ICh7IHJlc3BvbnNlOiBzY2hlbWEgfSkpO1xufVxuXG5mdW5jdGlvbiBtb2RpZnlTY2hlbWEocmVxKSB7XG4gIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIHVwZGF0ZSBhIHNjaGVtYS5cIlxuICAgICk7XG4gIH1cbiAgaWYgKHJlcS5ib2R5LmNsYXNzTmFtZSAmJiByZXEuYm9keS5jbGFzc05hbWUgIT0gcmVxLnBhcmFtcy5jbGFzc05hbWUpIHtcbiAgICByZXR1cm4gY2xhc3NOYW1lTWlzbWF0Y2hSZXNwb25zZShyZXEuYm9keS5jbGFzc05hbWUsIHJlcS5wYXJhbXMuY2xhc3NOYW1lKTtcbiAgfVxuXG4gIGNvbnN0IHN1Ym1pdHRlZEZpZWxkcyA9IHJlcS5ib2R5LmZpZWxkcyB8fCB7fTtcbiAgY29uc3QgY2xhc3NOYW1lID0gcmVxLnBhcmFtcy5jbGFzc05hbWU7XG5cbiAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSh7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAudGhlbihzY2hlbWEgPT5cbiAgICAgIHNjaGVtYS51cGRhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBzdWJtaXR0ZWRGaWVsZHMsXG4gICAgICAgIHJlcS5ib2R5LmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVxLmJvZHkuaW5kZXhlcyxcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgKVxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4gKHsgcmVzcG9uc2U6IHJlc3VsdCB9KSk7XG59XG5cbmNvbnN0IGRlbGV0ZVNjaGVtYSA9IHJlcSA9PiB7XG4gIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIFwicmVhZC1vbmx5IG1hc3RlcktleSBpc24ndCBhbGxvd2VkIHRvIGRlbGV0ZSBhIHNjaGVtYS5cIlxuICAgICk7XG4gIH1cbiAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQocmVxLnBhcmFtcy5jbGFzc05hbWUpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgU2NoZW1hQ29udHJvbGxlci5pbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShyZXEucGFyYW1zLmNsYXNzTmFtZSlcbiAgICApO1xuICB9XG4gIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmRlbGV0ZVNjaGVtYShyZXEucGFyYW1zLmNsYXNzTmFtZSkudGhlbigoKSA9PiAoeyByZXNwb25zZToge30gfSkpO1xufTtcblxuZXhwb3J0IGNsYXNzIFNjaGVtYXNSb3V0ZXIgZXh0ZW5kcyBQcm9taXNlUm91dGVyIHtcbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9zY2hlbWFzJywgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgZ2V0QWxsU2NoZW1hcyk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9zY2hlbWFzLzpjbGFzc05hbWUnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIGdldE9uZVNjaGVtYVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvc2NoZW1hcycsIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsIGNyZWF0ZVNjaGVtYSk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQT1NUJyxcbiAgICAgICcvc2NoZW1hcy86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICBjcmVhdGVTY2hlbWFcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUFVUJyxcbiAgICAgICcvc2NoZW1hcy86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICBtb2RpZnlTY2hlbWFcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnREVMRVRFJyxcbiAgICAgICcvc2NoZW1hcy86Y2xhc3NOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICBkZWxldGVTY2hlbWFcbiAgICApO1xuICB9XG59XG4iXX0=