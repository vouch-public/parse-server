"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "FileSystemAdapter", {
  enumerable: true,
  get: function () {
    return _fsFilesAdapter.default;
  }
});
exports.GCSAdapter = void 0;
Object.defineProperty(exports, "InMemoryCacheAdapter", {
  enumerable: true,
  get: function () {
    return _InMemoryCacheAdapter.default;
  }
});
Object.defineProperty(exports, "LRUCacheAdapter", {
  enumerable: true,
  get: function () {
    return _LRUCache.default;
  }
});
Object.defineProperty(exports, "NullCacheAdapter", {
  enumerable: true,
  get: function () {
    return _NullCacheAdapter.default;
  }
});
Object.defineProperty(exports, "ParseGraphQLServer", {
  enumerable: true,
  get: function () {
    return _ParseGraphQLServer.ParseGraphQLServer;
  }
});
exports.ParseServer = void 0;
Object.defineProperty(exports, "PushWorker", {
  enumerable: true,
  get: function () {
    return _PushWorker.PushWorker;
  }
});
Object.defineProperty(exports, "RedisCacheAdapter", {
  enumerable: true,
  get: function () {
    return _RedisCacheAdapter.default;
  }
});
exports.default = exports.TestUtils = exports.SchemaMigrations = exports.S3Adapter = void 0;
var _ParseServer2 = _interopRequireDefault(require("./ParseServer"));
var _fsFilesAdapter = _interopRequireDefault(require("@parse/fs-files-adapter"));
var _InMemoryCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/InMemoryCacheAdapter"));
var _NullCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/NullCacheAdapter"));
var _RedisCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/RedisCacheAdapter"));
var _LRUCache = _interopRequireDefault(require("./Adapters/Cache/LRUCache.js"));
var TestUtils = _interopRequireWildcard(require("./TestUtils"));
exports.TestUtils = TestUtils;
var SchemaMigrations = _interopRequireWildcard(require("./SchemaMigrations/Migrations"));
exports.SchemaMigrations = SchemaMigrations;
var _deprecated = require("./deprecated");
var _logger = require("./logger");
var _PushWorker = require("./Push/PushWorker");
var _Options = require("./Options");
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server;
};
// Mount the create liveQueryServer
exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.startApp = _ParseServer2.default.startApp;
const S3Adapter = (0, _deprecated.useExternal)('S3Adapter', '@parse/s3-files-adapter');
exports.S3Adapter = S3Adapter;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZnNGaWxlc0FkYXB0ZXIiLCJfSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJfTnVsbENhY2hlQWRhcHRlciIsIl9SZWRpc0NhY2hlQWRhcHRlciIsIl9MUlVDYWNoZSIsIlRlc3RVdGlscyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZXhwb3J0cyIsIlNjaGVtYU1pZ3JhdGlvbnMiLCJfZGVwcmVjYXRlZCIsIl9sb2dnZXIiLCJfUHVzaFdvcmtlciIsIl9PcHRpb25zIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydEFwcCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIm1vZHVsZSIsImdldExvZ2dlciIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuL1BhcnNlU2VydmVyJztcbmltcG9ydCBGaWxlU3lzdGVtQWRhcHRlciBmcm9tICdAcGFyc2UvZnMtZmlsZXMtYWRhcHRlcic7XG5pbXBvcnQgSW5NZW1vcnlDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlQWRhcHRlcic7XG5pbXBvcnQgTnVsbENhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL051bGxDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IFJlZGlzQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvUmVkaXNDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IExSVUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0xSVUNhY2hlLmpzJztcbmltcG9ydCAqIGFzIFRlc3RVdGlscyBmcm9tICcuL1Rlc3RVdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFNaWdyYXRpb25zIGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9NaWdyYXRpb25zJztcblxuaW1wb3J0IHsgdXNlRXh0ZXJuYWwgfSBmcm9tICcuL2RlcHJlY2F0ZWQnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgUHVzaFdvcmtlciB9IGZyb20gJy4vUHVzaC9QdXNoV29ya2VyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gRmFjdG9yeSBmdW5jdGlvblxuY29uc3QgX1BhcnNlU2VydmVyID0gZnVuY3Rpb24gKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gIHJldHVybiBzZXJ2ZXI7XG59O1xuLy8gTW91bnQgdGhlIGNyZWF0ZSBsaXZlUXVlcnlTZXJ2ZXJcbl9QYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXI7XG5fUGFyc2VTZXJ2ZXIuc3RhcnRBcHAgPSBQYXJzZVNlcnZlci5zdGFydEFwcDtcblxuY29uc3QgUzNBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ1MzQWRhcHRlcicsICdAcGFyc2UvczMtZmlsZXMtYWRhcHRlcicpO1xuY29uc3QgR0NTQWRhcHRlciA9IHVzZUV4dGVybmFsKCdHQ1NBZGFwdGVyJywgJ0BwYXJzZS9nY3MtZmlsZXMtYWRhcHRlcicpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkobW9kdWxlLmV4cG9ydHMsICdsb2dnZXInLCB7XG4gIGdldDogZ2V0TG9nZ2VyLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuZXhwb3J0IHtcbiAgUzNBZGFwdGVyLFxuICBHQ1NBZGFwdGVyLFxuICBGaWxlU3lzdGVtQWRhcHRlcixcbiAgSW5NZW1vcnlDYWNoZUFkYXB0ZXIsXG4gIE51bGxDYWNoZUFkYXB0ZXIsXG4gIFJlZGlzQ2FjaGVBZGFwdGVyLFxuICBMUlVDYWNoZUFkYXB0ZXIsXG4gIFRlc3RVdGlscyxcbiAgUHVzaFdvcmtlcixcbiAgUGFyc2VHcmFwaFFMU2VydmVyLFxuICBfUGFyc2VTZXJ2ZXIgYXMgUGFyc2VTZXJ2ZXIsXG4gIFNjaGVtYU1pZ3JhdGlvbnMsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLGFBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLGVBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLHFCQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxpQkFBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLFNBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLFNBQUEsR0FBQUMsdUJBQUEsQ0FBQVAsT0FBQTtBQUF5Q1EsT0FB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