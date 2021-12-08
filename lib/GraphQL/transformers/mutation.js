"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphqlRelay = require("graphql-relay");

var _filesMutations = require("../loaders/filesMutations");

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const transformTypes = async (inputType, fields, {
  className,
  parseGraphQLSchema,
  req
}) => {
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    config: {
      isCreateEnabled,
      isUpdateEnabled
    }
  } = parseGraphQLSchema.parseClassTypes[className];
  const parseClass = parseGraphQLSchema.parseClasses.find(clazz => clazz.className === className);

  if (fields) {
    const classGraphQLCreateTypeFields = isCreateEnabled && classGraphQLCreateType ? classGraphQLCreateType.getFields() : null;
    const classGraphQLUpdateTypeFields = isUpdateEnabled && classGraphQLUpdateType ? classGraphQLUpdateType.getFields() : null;
    const promises = Object.keys(fields).map(async field => {
      let inputTypeField;

      if (inputType === 'create' && classGraphQLCreateTypeFields) {
        inputTypeField = classGraphQLCreateTypeFields[field];
      } else if (classGraphQLUpdateTypeFields) {
        inputTypeField = classGraphQLUpdateTypeFields[field];
      }

      if (inputTypeField) {
        switch (true) {
          case inputTypeField.type === defaultGraphQLTypes.GEO_POINT_INPUT:
            fields[field] = transformers.geoPoint(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            fields[field] = transformers.polygon(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.FILE_INPUT:
            fields[field] = await transformers.file(fields[field], req);
            break;

          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          case parseClass.fields[field].type === 'Pointer':
            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;
        }
      }
    });
    await Promise.all(promises);
    if (fields.ACL) fields.ACL = transformers.ACL(fields.ACL);
  }

  return fields;
};

exports.transformTypes = transformTypes;
const transformers = {
  file: async ({
    file,
    upload
  }, {
    config
  }) => {
    if (file === null && !upload) {
      return null;
    }

    if (upload) {
      const {
        fileInfo
      } = await (0, _filesMutations.handleUpload)(upload, config);
      return _objectSpread(_objectSpread({}, fileInfo), {}, {
        __type: 'File'
      });
    } else if (file && file.name) {
      return {
        name: file.name,
        __type: 'File',
        url: file.url
      };
    }

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  },
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread(_objectSpread({}, value), {}, {
    __type: 'GeoPoint'
  }),
  ACL: value => {
    const parseACL = {};

    if (value.public) {
      parseACL['*'] = {
        read: value.public.read,
        write: value.public.write
      };
    }

    if (value.users) {
      value.users.forEach(rule => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(rule.userId);

        if (globalIdObject.type === '_User') {
          rule.userId = globalIdObject.id;
        }

        parseACL[rule.userId] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    if (value.roles) {
      value.roles.forEach(rule => {
        parseACL[`role:${rule.roleName}`] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    return parseACL;
  },
  relation: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide at least one operation on the relation mutation of field ${field}`);
    const op = {
      __op: 'Batch',
      ops: []
    };
    let nestedObjectsToAdd = [];

    if (value.createAndAdd) {
      nestedObjectsToAdd = (await Promise.all(value.createAndAdd.map(async input => {
        const parseFields = await transformTypes('create', input, {
          className: targetClass,
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        return objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      }))).map(object => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: object.objectId
      }));
    }

    if (value.add || nestedObjectsToAdd.length > 0) {
      if (!value.add) value.add = [];
      value.add = value.add.map(input => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

        if (globalIdObject.type === targetClass) {
          input = globalIdObject.id;
        }

        return {
          __type: 'Pointer',
          className: targetClass,
          objectId: input
        };
      });
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd]
      });
    }

    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

          if (globalIdObject.type === targetClass) {
            input = globalIdObject.id;
          }

          return {
            __type: 'Pointer',
            className: targetClass,
            objectId: input
          };
        })
      });
    }

    return op;
  },
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length > 1 || Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
    let nestedObjectToAdd;

    if (value.createAndLink) {
      const parseFields = await transformTypes('create', value.createAndLink, {
        className: targetClass,
        parseGraphQLSchema,
        req: {
          config,
          auth,
          info
        }
      });
      nestedObjectToAdd = await objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: nestedObjectToAdd.objectId
      };
    }

    if (value.link) {
      let objectId = value.link;
      const globalIdObject = (0, _graphqlRelay.fromGlobalId)(objectId);

      if (globalIdObject.type === targetClass) {
        objectId = globalIdObject.id;
      }

      return {
        __type: 'Pointer',
        className: targetClass,
        objectId
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9tdXRhdGlvbi5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwidHJhbnNmb3JtZXJzIiwiZ2VvUG9pbnQiLCJQT0xZR09OX0lOUFVUIiwicG9seWdvbiIsIkZJTEVfSU5QVVQiLCJmaWxlIiwicmVsYXRpb24iLCJ0YXJnZXRDbGFzcyIsInBvaW50ZXIiLCJQcm9taXNlIiwiYWxsIiwiQUNMIiwidXBsb2FkIiwiZmlsZUluZm8iLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIl9fb3AiLCJvcHMiLCJuZXN0ZWRPYmplY3RzVG9BZGQiLCJjcmVhdGVBbmRBZGQiLCJpbnB1dCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsY0FBYyxHQUFHLE9BQ3JCQyxTQURxQixFQUVyQkMsTUFGcUIsRUFHckI7QUFBRUMsRUFBQUEsU0FBRjtBQUFhQyxFQUFBQSxrQkFBYjtBQUFpQ0MsRUFBQUE7QUFBakMsQ0FIcUIsS0FJbEI7QUFDSCxRQUFNO0FBQ0pDLElBQUFBLHNCQURJO0FBRUpDLElBQUFBLHNCQUZJO0FBR0pDLElBQUFBLE1BQU0sRUFBRTtBQUFFQyxNQUFBQSxlQUFGO0FBQW1CQyxNQUFBQTtBQUFuQjtBQUhKLE1BSUZOLGtCQUFrQixDQUFDTyxlQUFuQixDQUFtQ1IsU0FBbkMsQ0FKSjtBQUtBLFFBQU1TLFVBQVUsR0FBR1Isa0JBQWtCLENBQUNTLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0MsS0FBSyxJQUFJQSxLQUFLLENBQUNaLFNBQU4sS0FBb0JBLFNBQWxFLENBQW5COztBQUNBLE1BQUlELE1BQUosRUFBWTtBQUNWLFVBQU1jLDRCQUE0QixHQUNoQ1AsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVyxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtBQUVBLFVBQU1DLDRCQUE0QixHQUNoQ1IsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVSxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtBQUVBLFVBQU1FLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVluQixNQUFaLEVBQW9Cb0IsR0FBcEIs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QVEsRUFBRUssaUJBQWlCLENBQUNMO0FBSHZCLE9BQVA7QUFLRDs7QUFDRCxRQUFJOUIsS0FBSyxDQUFDcUMsSUFBVixFQUFnQjtBQUNkLFVBQUlQLFFBQVEsR0FBRzlCLEtBQUssQ0FBQ3FDLElBQXJCO0FBQ0EsWUFBTTFCLGNBQWMsR0FBRyxnQ0FBYW1CLFFBQWIsQ0FBdkI7O0FBQ0EsVUFBSW5CLGNBQWMsQ0FBQ2xDLElBQWYsS0FBd0JVLFdBQTVCLEVBQXlDO0FBQ3ZDMkMsUUFBQUEsUUFBUSxHQUFHbkIsY0FBYyxDQUFDRSxFQUExQjtBQUNEOztBQUNELGFBQU87QUFDTG5CLFFBQUFBLE1BQU0sRUFBRSxTQURIO0FBRUx2QyxRQUFBQSxTQUFTLEVBQUVnQyxXQUZOO0FBR0wyQyxRQUFBQTtBQUhLLE9BQVA7QUFLRDtBQUNGO0FBL0prQixDQUFyQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlcy5maW5kKGNsYXp6ID0+IGNsYXp6LmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgaWYgKGZpZWxkcykge1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNDcmVhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzID1cbiAgICAgIGlzVXBkYXRlRW5hYmxlZCAmJiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID8gY2xhc3NHcmFwaFFMVXBkYXRlVHlwZS5nZXRGaWVsZHMoKSA6IG51bGw7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLm1hcChhc3luYyBmaWVsZCA9PiB7XG4gICAgICBsZXQgaW5wdXRUeXBlRmllbGQ7XG4gICAgICBpZiAoaW5wdXRUeXBlID09PSAnY3JlYXRlJyAmJiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzKSB7XG4gICAgICAgIGlucHV0VHlwZUZpZWxkID0gY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkc1tmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH1cbiAgICAgIGlmIChpbnB1dFR5cGVGaWVsZCkge1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lOUFVUOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5nZW9Qb2ludChmaWVsZHNbZmllbGRdKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lOUFVUOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHRyYW5zZm9ybWVycy5wb2x5Z29uKGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLmZpbGUoZmllbGRzW2ZpZWxkXSwgcmVxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbic6XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gYXdhaXQgdHJhbnNmb3JtZXJzLnJlbGF0aW9uKFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIGZpZWxkLFxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICAgIHJlcVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJzpcbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSBhd2FpdCB0cmFuc2Zvcm1lcnMucG9pbnRlcihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBpZiAoZmllbGRzLkFDTCkgZmllbGRzLkFDTCA9IHRyYW5zZm9ybWVycy5BQ0woZmllbGRzLkFDTCk7XG4gIH1cbiAgcmV0dXJuIGZpZWxkcztcbn07XG5cbmNvbnN0IHRyYW5zZm9ybWVycyA9IHtcbiAgZmlsZTogYXN5bmMgKHsgZmlsZSwgdXBsb2FkIH0sIHsgY29uZmlnIH0pID0+IHtcbiAgICBpZiAoZmlsZSA9PT0gbnVsbCAmJiAhdXBsb2FkKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHVwbG9hZCkge1xuICAgICAgY29uc3QgeyBmaWxlSW5mbyB9ID0gYXdhaXQgaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIHJldHVybiB7IC4uLmZpbGVJbmZvLCBfX3R5cGU6ICdGaWxlJyB9O1xuICAgIH0gZWxzZSBpZiAoZmlsZSAmJiBmaWxlLm5hbWUpIHtcbiAgICAgIHJldHVybiB7IG5hbWU6IGZpbGUubmFtZSwgX190eXBlOiAnRmlsZScsIHVybDogZmlsZS51cmwgfTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJyk7XG4gIH0sXG4gIHBvbHlnb246IHZhbHVlID0+ICh7XG4gICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgY29vcmRpbmF0ZXM6IHZhbHVlLm1hcChnZW9Qb2ludCA9PiBbZ2VvUG9pbnQubGF0aXR1ZGUsIGdlb1BvaW50LmxvbmdpdHVkZV0pLFxuICB9KSxcbiAgZ2VvUG9pbnQ6IHZhbHVlID0+ICh7XG4gICAgLi4udmFsdWUsXG4gICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICB9KSxcbiAgQUNMOiB2YWx1ZSA9PiB7XG4gICAgY29uc3QgcGFyc2VBQ0wgPSB7fTtcbiAgICBpZiAodmFsdWUucHVibGljKSB7XG4gICAgICBwYXJzZUFDTFsnKiddID0ge1xuICAgICAgICByZWFkOiB2YWx1ZS5wdWJsaWMucmVhZCxcbiAgICAgICAgd3JpdGU6IHZhbHVlLnB1YmxpYy53cml0ZSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS51c2Vycykge1xuICAgICAgdmFsdWUudXNlcnMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQocnVsZS51c2VySWQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgIHJ1bGUudXNlcklkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcGFyc2VBQ0xbcnVsZS51c2VySWRdID0ge1xuICAgICAgICAgIHJlYWQ6IHJ1bGUucmVhZCxcbiAgICAgICAgICB3cml0ZTogcnVsZS53cml0ZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAodmFsdWUucm9sZXMpIHtcbiAgICAgIHZhbHVlLnJvbGVzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIHBhcnNlQUNMW2Byb2xlOiR7cnVsZS5yb2xlTmFtZX1gXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlQUNMO1xuICB9LFxuICByZWxhdGlvbjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGF0IGxlYXN0IG9uZSBvcGVyYXRpb24gb24gdGhlIHJlbGF0aW9uIG11dGF0aW9uIG9mIGZpZWxkICR7ZmllbGR9YFxuICAgICAgKTtcblxuICAgIGNvbnN0IG9wID0ge1xuICAgICAgX19vcDogJ0JhdGNoJyxcbiAgICAgIG9wczogW10sXG4gICAgfTtcbiAgICBsZXQgbmVzdGVkT2JqZWN0c1RvQWRkID0gW107XG5cbiAgICBpZiAodmFsdWUuY3JlYXRlQW5kQWRkKSB7XG4gICAgICBuZXN0ZWRPYmplY3RzVG9BZGQgPSAoXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICAgIHZhbHVlLmNyZWF0ZUFuZEFkZC5tYXAoYXN5bmMgaW5wdXQgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgaW5wdXQsIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdCh0YXJnZXRDbGFzcywgcGFyc2VGaWVsZHMsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICAgKS5tYXAob2JqZWN0ID0+ICh7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogb2JqZWN0Lm9iamVjdElkLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5hZGQgfHwgbmVzdGVkT2JqZWN0c1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghdmFsdWUuYWRkKSB2YWx1ZS5hZGQgPSBbXTtcbiAgICAgIHZhbHVlLmFkZCA9IHZhbHVlLmFkZC5tYXAoaW5wdXQgPT4ge1xuICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgIGlucHV0ID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnQWRkUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiBbLi4udmFsdWUuYWRkLCAuLi5uZXN0ZWRPYmplY3RzVG9BZGRdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnJlbW92ZSkge1xuICAgICAgb3Aub3BzLnB1c2goe1xuICAgICAgICBfX29wOiAnUmVtb3ZlUmVsYXRpb24nLFxuICAgICAgICBvYmplY3RzOiB2YWx1ZS5yZW1vdmUubWFwKGlucHV0ID0+IHtcbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpbnB1dCk7XG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IGlucHV0LFxuICAgICAgICAgIH07XG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBvcDtcbiAgfSxcbiAgcG9pbnRlcjogYXN5bmMgKHRhcmdldENsYXNzLCBmaWVsZCwgdmFsdWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgeyBjb25maWcsIGF1dGgsIGluZm8gfSkgPT4ge1xuICAgIGlmIChPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID4gMSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoID09PSAwKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1BPSU5URVIsXG4gICAgICAgIGBZb3UgbmVlZCB0byBwcm92aWRlIGxpbmsgT1IgY3JlYXRlTGluayBvbiB0aGUgcG9pbnRlciBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBsZXQgbmVzdGVkT2JqZWN0VG9BZGQ7XG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZExpbmspIHtcbiAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIHZhbHVlLmNyZWF0ZUFuZExpbmssIHtcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICB9KTtcbiAgICAgIG5lc3RlZE9iamVjdFRvQWRkID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBpbmZvXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkOiBuZXN0ZWRPYmplY3RUb0FkZC5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh2YWx1ZS5saW5rKSB7XG4gICAgICBsZXQgb2JqZWN0SWQgPSB2YWx1ZS5saW5rO1xuICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQob2JqZWN0SWQpO1xuICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHRhcmdldENsYXNzKSB7XG4gICAgICAgIG9iamVjdElkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgfSxcbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybVR5cGVzIH07XG4iXX0=