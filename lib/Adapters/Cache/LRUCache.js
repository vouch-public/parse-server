"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LRUCache = void 0;
var _lruCache = _interopRequireDefault(require("lru-cache"));
var _defaults = _interopRequireDefault(require("../../defaults"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class LRUCache {
  constructor({
    ttl = _defaults.default.cacheTTL,
    maxSize = _defaults.default.cacheMaxSize
  }) {
    this.cache = new _lruCache.default({
      max: maxSize,
      ttl
    });
  }
  get(key) {
    return this.cache.get(key) || null;
  }
  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }
  del(key) {
    this.cache.del(key);
  }
  clear() {
    this.cache.reset();
  }
}
exports.LRUCache = LRUCache;
var _default = LRUCache;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMUlVDYWNoZSIsImNvbnN0cnVjdG9yIiwidHRsIiwiZGVmYXVsdHMiLCJjYWNoZVRUTCIsIm1heFNpemUiLCJjYWNoZU1heFNpemUiLCJjYWNoZSIsIkxSVSIsIm1heCIsImdldCIsImtleSIsInB1dCIsInZhbHVlIiwic2V0IiwiZGVsIiwiY2xlYXIiLCJyZXNldCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5leHBvcnQgY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3Rvcih7IHR0bCA9IGRlZmF1bHRzLmNhY2hlVFRMLCBtYXhTaXplID0gZGVmYXVsdHMuY2FjaGVNYXhTaXplIH0pIHtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IG1heFNpemUsXG4gICAgICB0dGwsXG4gICAgfSk7XG4gIH1cblxuICBnZXQoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGUuZ2V0KGtleSkgfHwgbnVsbDtcbiAgfVxuXG4gIHB1dChrZXksIHZhbHVlLCB0dGwgPSB0aGlzLnR0bCkge1xuICAgIHRoaXMuY2FjaGUuc2V0KGtleSwgdmFsdWUsIHR0bCk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgdGhpcy5jYWNoZS5kZWwoa2V5KTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIHRoaXMuY2FjaGUucmVzZXQoKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMUlVDYWNoZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUFzQztBQUUvQixNQUFNQSxRQUFRLENBQUM7RUFDcEJDLFdBQVcsQ0FBQztJQUFFQyxHQUFHLEdBQUdDLGlCQUFRLENBQUNDLFFBQVE7SUFBRUMsT0FBTyxHQUFHRixpQkFBUSxDQUFDRztFQUFhLENBQUMsRUFBRTtJQUN4RSxJQUFJLENBQUNDLEtBQUssR0FBRyxJQUFJQyxpQkFBRyxDQUFDO01BQ25CQyxHQUFHLEVBQUVKLE9BQU87TUFDWkg7SUFDRixDQUFDLENBQUM7RUFDSjtFQUVBUSxHQUFHLENBQUNDLEdBQUcsRUFBRTtJQUNQLE9BQU8sSUFBSSxDQUFDSixLQUFLLENBQUNHLEdBQUcsQ0FBQ0MsR0FBRyxDQUFDLElBQUksSUFBSTtFQUNwQztFQUVBQyxHQUFHLENBQUNELEdBQUcsRUFBRUUsS0FBSyxFQUFFWCxHQUFHLEdBQUcsSUFBSSxDQUFDQSxHQUFHLEVBQUU7SUFDOUIsSUFBSSxDQUFDSyxLQUFLLENBQUNPLEdBQUcsQ0FBQ0gsR0FBRyxFQUFFRSxLQUFLLEVBQUVYLEdBQUcsQ0FBQztFQUNqQztFQUVBYSxHQUFHLENBQUNKLEdBQUcsRUFBRTtJQUNQLElBQUksQ0FBQ0osS0FBSyxDQUFDUSxHQUFHLENBQUNKLEdBQUcsQ0FBQztFQUNyQjtFQUVBSyxLQUFLLEdBQUc7SUFDTixJQUFJLENBQUNULEtBQUssQ0FBQ1UsS0FBSyxFQUFFO0VBQ3BCO0FBQ0Y7QUFBQztBQUFBLGVBRWNqQixRQUFRO0FBQUEifQ==