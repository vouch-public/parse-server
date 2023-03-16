"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LoggerAdapter = void 0;
/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
/**
 * @interface LoggerAdapter
 * Logger Adapter
 * Allows you to change the logger mechanism
 * Default is WinstonLoggerAdapter.js
 */
class LoggerAdapter {
  constructor(options) {}
  /**
   * log
   * @param {String} level
   * @param {String} message
   * @param {Object} metadata
   */
  log(level, message /* meta */) {}
}
exports.LoggerAdapter = LoggerAdapter;
var _default = LoggerAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMb2dnZXJBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibG9nIiwibGV2ZWwiLCJtZXNzYWdlIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwiZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvTG9nZ2VyQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIExvZ2dlckFkYXB0ZXJcbiAqIExvZ2dlciBBZGFwdGVyXG4gKiBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgbG9nZ2VyIG1lY2hhbmlzbVxuICogRGVmYXVsdCBpcyBXaW5zdG9uTG9nZ2VyQWRhcHRlci5qc1xuICovXG5leHBvcnQgY2xhc3MgTG9nZ2VyQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHt9XG4gIC8qKlxuICAgKiBsb2dcbiAgICogQHBhcmFtIHtTdHJpbmd9IGxldmVsXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtZXRhZGF0YVxuICAgKi9cbiAgbG9nKGxldmVsLCBtZXNzYWdlIC8qIG1ldGEgKi8pIHt9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExvZ2dlckFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsYUFBYSxDQUFDO0VBQ3pCQyxXQUFXQSxDQUFDQyxPQUFPLEVBQUUsQ0FBQztFQUN0QjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsR0FBR0EsQ0FBQ0MsS0FBSyxFQUFFQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2xDO0FBQUNDLE9BQUEsQ0FBQU4sYUFBQSxHQUFBQSxhQUFBO0FBQUEsSUFBQU8sUUFBQSxHQUVjUCxhQUFhO0FBQUFNLE9BQUEsQ0FBQUUsT0FBQSxHQUFBRCxRQUFBIn0=