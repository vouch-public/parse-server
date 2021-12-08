"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const getParseClassQueryConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.query || {};
};

const getQuery = async (parseClass, _source, args, context, queryInfo, parseClasses) => {
  let {
    id
  } = args;
  const {
    options
  } = args;
  const {
    readPreference,
    includeReadPreference
  } = options || {};
  const {
    config,
    auth,
    info
  } = context;
  const selectedFields = (0, _graphqlListFields.default)(queryInfo);
  const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);

  if (globalIdObject.type === parseClass.className) {
    id = globalIdObject.id;
  }

  const {
    keys,
    include
  } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
  return await objectsQueries.getObject(parseClass.className, id, keys, include, readPreference, includeReadPreference, config, auth, info, parseClasses);
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true,
    getAlias = '',
    findAlias = ''
  } = getParseClassQueryConfig(parseClassConfig);
  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isGetEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const getGraphQLQueryName = getAlias || lowerCaseClassName;
    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        options: defaultGraphQLTypes.READ_OPTIONS_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(parseClass, _source, args, context, queryInfo, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }

  if (isFindEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const findGraphQLQueryName = findAlias || (0, _pluralize.default)(lowerCaseClassName);
    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.OBJECT),

      async resolve(_source, args, context, queryInfo) {
        try {
          const {
            where,
            order,
            skip,
            first,
            after,
            last,
            before,
            options
          } = args;
          const {
            readPreference,
            includeReadPreference,
            subqueryReadPreference
          } = options || {};
          const {
            config,
            auth,
            info
          } = context;
          const selectedFields = (0, _graphqlListFields.default)(queryInfo);
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }

    });
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJwYXJzZUNsYXNzIiwiX3NvdXJjZSIsImFyZ3MiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwicGFyc2VDbGFzc2VzIiwiaWQiLCJvcHRpb25zIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsImluZGV4T2YiLCJwYXJzZU9yZGVyIiwiam9pbiIsImZpbmRPYmplY3RzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsd0JBQXdCLEdBQUcsVUFBVUMsZ0JBQVYsRUFBc0Q7QUFDckYsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxLQUF0QyxJQUFnRCxFQUF2RDtBQUNELENBRkQ7O0FBSUEsTUFBTUMsUUFBUSxHQUFHLE9BQU9DLFVBQVAsRUFBbUJDLE9BQW5CLEVBQTRCQyxJQUE1QixFQUFrQ0MsT0FBbEMsRUFBMkNDLFNBQTNDLEVBQXNEQyxZQUF0RCxLQUF1RTtBQUN0RixNQUFJO0FBQUVDLElBQUFBO0FBQUYsTUFBU0osSUFBYjtBQUNBLFFBQU07QUFBRUssSUFBQUE7QUFBRixNQUFjTCxJQUFwQjtBQUNBLFFBQU07QUFBRU0sSUFBQUEsY0FBRjtBQUFrQkMsSUFBQUE7QUFBbEIsTUFBNENGLE9BQU8sSUFBSSxFQUE3RDtBQUNBLFFBQU07QUFBRUcsSUFBQUEsTUFBRjtBQUFVQyxJQUFBQSxJQUFWO0FBQWdCQyxJQUFBQTtBQUFoQixNQUF5QlQsT0FBL0I7QUFDQSxRQUFNVSxjQUFjLEdBQUcsZ0NBQWNULFNBQWQsQ0FBdkI7QUFFQSxRQUFNVSxjQUFjLEdBQUcsZ0NBQWFSLEVBQWIsQ0FBdkI7O0FBRUEsTUFBSVEsY0FBYyxDQUFDQyxJQUFmLEtBQXdCZixVQUFVLENBQUNnQixTQUF2QyxFQUFrRDtBQUNoRFYsSUFBQUEsRUFBRSxHQUFHUSxjQUFjLENBQUNSLEVBQXBCO0FBQ0Q7O0FBRUQsUUFBTTtBQUFFVyxJQUFBQSxJQUFGO0FBQVFDLElBQUFBO0FBQVIsTUFBb0IsOENBQXNCTCxjQUF0QixDQUExQjtBQUVBLFNB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VUFIVyxFQUlYWixJQUpXLEVBS1hDLEtBTFcsRUFNWEMsS0FOVyxFQU9YQyxJQVBXLEVBUVhDLE1BUlcsRUFTWHZDLElBVFcsRUFVWEMsT0FWVyxFQVdYLEtBWFcsRUFZWFYsY0FaVyxFQWFYQyxxQkFiVyxFQWNYZ0Qsc0JBZFcsRUFlWC9DLE1BZlcsRUFnQlhDLElBaEJXLEVBaUJYQyxJQWpCVyxFQWtCWEMsY0FsQlcsRUFtQlhTLGtCQUFrQixDQUFDakIsWUFuQlIsQ0FBYjtBQXFCRCxTQW5DRCxDQW1DRSxPQUFPMEMsQ0FBUCxFQUFVO0FBQ1Z6QixVQUFBQSxrQkFBa0IsQ0FBQzBCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBM0NzRCxLQUF6RDtBQTZDRDtBQUNGLENBaEdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgcGx1cmFsaXplIGZyb20gJ3BsdXJhbGl6ZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy5xdWVyeSkgfHwge307XG59O1xuXG5jb25zdCBnZXRRdWVyeSA9IGFzeW5jIChwYXJzZUNsYXNzLCBfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8sIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBsZXQgeyBpZCB9ID0gYXJncztcbiAgY29uc3QgeyBvcHRpb25zIH0gPSBhcmdzO1xuICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UgfSA9IG9wdGlvbnMgfHwge307XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgfVxuXG4gIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcblxuICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgIHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgIGlkLFxuICAgIGtleXMsXG4gICAgaW5jbHVkZSxcbiAgICByZWFkUHJlZmVyZW5jZSxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgaW5mbyxcbiAgICBwYXJzZUNsYXNzZXNcbiAgKTtcbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbiAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGdldDogaXNHZXRFbmFibGVkID0gdHJ1ZSxcbiAgICBmaW5kOiBpc0ZpbmRFbmFibGVkID0gdHJ1ZSxcbiAgICBnZXRBbGlhczogZ2V0QWxpYXMgPSAnJyxcbiAgICBmaW5kQWxpYXM6IGZpbmRBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0dldEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICAgIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPSBnZXRBbGlhcyB8fCBsb3dlckNhc2VDbGFzc05hbWU7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KGdldEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZ2V0IGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBieSBpdHMgaWQuYCxcbiAgICAgIGFyZ3M6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIG9wdGlvbnM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9PUFRJT05TX0FUVCxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBhd2FpdCBnZXRRdWVyeShcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MsXG4gICAgICAgICAgICBfc291cmNlLFxuICAgICAgICAgICAgYXJncyxcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBxdWVyeUluZm8sXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgbG93ZXJDYXNlQ2xhc3NOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBmaW5kR3JhcGhRTFF1ZXJ5TmFtZSA9IGZpbmRBbGlhcyB8fCBwbHVyYWxpemUobG93ZXJDYXNlQ2xhc3NOYW1lKTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZmluZEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZmluZEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGZpbmQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczogY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5kZXhPZignZWRnZXMubm9kZScpIDwgMClcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=