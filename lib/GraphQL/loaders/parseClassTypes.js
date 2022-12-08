"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "extractKeysAndInclude", {
  enumerable: true,
  get: function () {
    return _parseGraphQLUtils.extractKeysAndInclude;
  }
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _inputType = require("../transformers/inputType");
var _outputType = require("../transformers/outputType");
var _constraintType = require("../transformers/constraintType");
var _parseGraphQLUtils = require("../parseGraphQLUtils");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};
const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields).concat('id');
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields
  } = getParseClassTypeConfig(parseClassConfig);
  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields;

  // All allowed customs fields
  const classCustomFields = classFields.filter(field => {
    return !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field) && field !== 'id';
  });
  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }
  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }
  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  }
  // Filters the "password" field from class _User
  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(outputField => outputField !== 'password');
  }
  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }
  if (allowedSortFields) {
    classSortFields = allowedSortFields;
    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'id',
        asc: true,
        desc: true
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return {
        field,
        asc: true,
        desc: true
      };
    });
  }
  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields
  };
};
const load = (parseGraphQLSchema, parseClass, parseClassConfig) => {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classCreateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: className === '_User' && (field === 'username' || field === 'password') || parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLCreateType = parseGraphQLSchema.addGraphQLType(classGraphQLCreateType);
  const classGraphQLUpdateTypeName = `Update${graphQLClassName}FieldsInput`;
  let classGraphQLUpdateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classUpdateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLUpdateType = parseGraphQLSchema.addGraphQLType(classGraphQLUpdateType);
  const classGraphQLPointerTypeName = `${graphQLClassName}PointerInput`;
  let classGraphQLPointerType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLPointerTypeName,
    description: `Allow to link OR add and link an object of the ${graphQLClassName} class.`,
    fields: () => {
      const fields = {
        link: {
          description: `Link an existing object from ${graphQLClassName} class. You can use either the global or the object id.`,
          type: _graphql.GraphQLID
        }
      };
      if (isCreateEnabled) {
        fields['createAndLink'] = {
          description: `Create and link an object from ${graphQLClassName} class.`,
          type: classGraphQLCreateType
        };
      }
      return fields;
    }
  });
  classGraphQLPointerType = parseGraphQLSchema.addGraphQLType(classGraphQLPointerType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationTypeName = `${graphQLClassName}RelationInput`;
  let classGraphQLRelationType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationTypeName,
    description: `Allow to add, remove, createAndAdd objects of the ${graphQLClassName} class into a relation field.`,
    fields: () => {
      const fields = {
        add: {
          description: `Add existing objects from the ${graphQLClassName} class into the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        },
        remove: {
          description: `Remove existing objects from the ${graphQLClassName} class out of the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        }
      };
      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add objects of the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLCreateType))
        };
      }
      return fields;
    }
  });
  classGraphQLRelationType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => _objectSpread(_objectSpread({}, classConstraintFields.reduce((fields, field) => {
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }
      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);
      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {})), {}, {
      OR: {
        description: 'This is the OR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      AND: {
        description: 'This is the AND operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      NOR: {
        description: 'This is the NOR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      }
    })
  });
  classGraphQLConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationConstraintsTypeName = `${graphQLClassName}RelationWhereInput`;
  let classGraphQLRelationConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationConstraintsTypeName,
    description: `The ${classGraphQLRelationConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      have: {
        description: 'Run a relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      haveNot: {
        description: 'Run an inverted relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      exists: {
        description: 'Check if the relation/pointer contains objects.',
        type: _graphql.GraphQLBoolean
      }
    })
  });
  classGraphQLRelationConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLOrderTypeName = `${graphQLClassName}Order`;
  let classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${graphQLClassName} class.`,
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const {
        field,
        asc,
        desc
      } = fieldConfig;
      const updatedSortFields = _objectSpread({}, sortFields);
      const value = field === 'id' ? 'objectId' : field;
      if (asc) {
        updatedSortFields[`${field}_ASC`] = {
          value
        };
      }
      if (desc) {
        updatedSortFields[`${field}_DESC`] = {
          value: `-${value}`
        };
      }
      return updatedSortFields;
    }, {})
  });
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(classGraphQLOrderType);
  const classGraphQLFindArgs = _objectSpread(_objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs), {}, {
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  });
  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [defaultGraphQLTypes.PARSE_OBJECT, parseGraphQLSchema.relayNodeInterface];
  const parseObjectFields = _objectSpread({
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId)
  }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS);
  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);
      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source, args, context, queryInfo) {
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
                return objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }
          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1]
                }));
              } else {
                return null;
              }
            }
          }
        });
      } else if (parseClass.fields[field].type === 'Array') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,
            async resolve(source) {
              if (!source[field]) return null;
              return source[field].map(async elem => {
                if (elem.className && elem.objectId && elem.__type === 'Object') {
                  return elem;
                } else {
                  return {
                    value: elem
                  };
                }
              });
            }
          }
        });
      } else if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, parseObjectFields);
  };
  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces,
    fields: outputFields
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(classGraphQLOutputType);
  const {
    connectionType,
    edgeType
  } = (0, _graphqlRelay.connectionDefinitions)({
    name: graphQLClassName,
    connectionFields: {
      count: defaultGraphQLTypes.COUNT_ATT
    },
    nodeType: classGraphQLOutputType || defaultGraphQLTypes.OBJECT
  });
  let classGraphQLFindResultType = undefined;
  if (parseGraphQLSchema.addGraphQLType(edgeType) && parseGraphQLSchema.addGraphQLType(connectionType, false, false, true)) {
    classGraphQLFindResultType = connectionType;
  }
  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintsType,
    classGraphQLRelationConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
    config: {
      parseClassConfig,
      isCreateEnabled,
      isUpdateEnabled
    }
  };
  if (className === '_User') {
    const viewerType = new _graphql.GraphQLObjectType({
      name: 'Viewer',
      description: `The Viewer object type is used in operations that involve outputting the current user data.`,
      fields: () => ({
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
        user: {
          description: 'This is the current user.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType)
        }
      })
    });
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    parseGraphQLSchema.viewerType = viewerType;
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyIsInBhcnNlQ2xhc3NDb25maWciLCJ0eXBlIiwiZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyIsInBhcnNlQ2xhc3MiLCJjbGFzc0ZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJmaWVsZHMiLCJjb25jYXQiLCJpbnB1dEZpZWxkcyIsImFsbG93ZWRJbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImFsbG93ZWRPdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwiYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiYWxsb3dlZFNvcnRGaWVsZHMiLCJjbGFzc091dHB1dEZpZWxkcyIsImNsYXNzQ3JlYXRlRmllbGRzIiwiY2xhc3NVcGRhdGVGaWVsZHMiLCJjbGFzc0NvbnN0cmFpbnRGaWVsZHMiLCJjbGFzc1NvcnRGaWVsZHMiLCJjbGFzc0N1c3RvbUZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwibGVuZ3RoIiwicHVzaCIsImFzYyIsImRlc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJyZWR1Y2UiLCJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsInJlcXVpcmVkIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsInRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwiZ2xvYmFsSWRGaWVsZCIsIm9iaiIsIm9iamVjdElkIiwidHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJ1bmRlZmluZWQiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImZpcnN0IiwiYWZ0ZXIiLCJsYXN0IiwiYmVmb3JlIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJzZWxlY3RlZEZpZWxkcyIsImdldEZpZWxkTmFtZXMiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJpbmRleE9mIiwicGFyc2VPcmRlciIsImpvaW4iLCJvYmplY3RzUXVlcmllcyIsImZpbmRPYmplY3RzIiwiJHJlbGF0ZWRUbyIsIm9iamVjdCIsIl9fdHlwZSIsImtleSIsInBhcnNlQ2xhc3NlcyIsImUiLCJoYW5kbGVFcnJvciIsImNvb3JkaW5hdGVzIiwiY29vcmRpbmF0ZSIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiZWxlbSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMT2JqZWN0VHlwZSIsImNvbm5lY3Rpb25UeXBlIiwiZWRnZVR5cGUiLCJjb25uZWN0aW9uRGVmaW5pdGlvbnMiLCJjb25uZWN0aW9uRmllbGRzIiwiY291bnQiLCJDT1VOVF9BVFQiLCJub2RlVHlwZSIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwidmlld2VyVHlwZSIsInNlc3Npb25Ub2tlbiIsIlNFU1NJT05fVE9LRU5fQVRUIiwidXNlciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBnbG9iYWxJZEZpZWxkLCBjb25uZWN0aW9uQXJncywgY29ubmVjdGlvbkRlZmluaXRpb25zIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmNvbmNhdCgnaWQnKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKSAmJiBmaWVsZCAhPT0gJ2lkJztcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKG91dHB1dEZpZWxkID0+IG91dHB1dEZpZWxkICE9PSAncGFzc3dvcmQnKTtcbiAgfVxuXG4gIGlmIChhbGxvd2VkQ29uc3RyYWludEZpZWxkcykge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiB7IGZpZWxkLCBhc2M6IHRydWUsIGRlc2M6IHRydWUgfTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH0gPSBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzKHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lID0gYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6XG4gICAgICAgICAgICAgICAgICAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmIChmaWVsZCA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZCA9PT0gJ3Bhc3N3b3JkJykpIHx8XG4gICAgICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UG9pbnRlcklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGxpbmsgT1IgYWRkIGFuZCBsaW5rIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBsaW5rOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBMaW5rIGFuIGV4aXN0aW5nIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuYCxcbiAgICAgICAgICB0eXBlOiBHcmFwaFFMSUQsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZExpbmsnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgbGluayBhbiBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzLFxuICAgICAgICAgIGZpZWxkXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uV2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgaGF2ZToge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgICAgICAgPyBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpXG4gICAgICAgIDogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgLi4uY29ubmVjdGlvbkFyZ3MsXG4gICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICB9O1xuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgY29uc3QgaW50ZXJmYWNlcyA9IFtkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVCwgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZV07XG4gIGNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0ge1xuICAgIGlkOiBnbG9iYWxJZEZpZWxkKGNsYXNzTmFtZSwgb2JqID0+IG9iai5vYmplY3RJZCksXG4gICAgLi4uZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTLFxuICB9O1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc107XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3MgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPVxuICAgICAgICAgICAgICAgICAgb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICRyZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RJZDogc291cmNlLm9iamVjdElkLFxuICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLi4uKHdoZXJlIHx8IHt9KSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZVtmaWVsZF0gJiYgc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzLm1hcChjb29yZGluYXRlID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLm1hcChhc3luYyBlbGVtID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbS5jbGFzc05hbWUgJiYgZWxlbS5vYmplY3RJZCAmJiBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IHsgY29ubmVjdGlvblR5cGUsIGVkZ2VUeXBlIH0gPSBjb25uZWN0aW9uRGVmaW5pdGlvbnMoe1xuICAgIG5hbWU6IGdyYXBoUUxDbGFzc05hbWUsXG4gICAgY29ubmVjdGlvbkZpZWxkczoge1xuICAgICAgY291bnQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ09VTlRfQVRULFxuICAgIH0sXG4gICAgbm9kZVR5cGU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gIH0pO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSB1bmRlZmluZWQ7XG4gIGlmIChcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZWRnZVR5cGUpICYmXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbm5lY3Rpb25UeXBlLCBmYWxzZSwgZmFsc2UsIHRydWUpXG4gICkge1xuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gY29ubmVjdGlvblR5cGU7XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3VycmVudCB1c2VyLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHZpZXdlclR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBO0FBVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBMEY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUUxRixNQUFNQSx1QkFBdUIsR0FBRyxVQUFVQyxnQkFBMEMsRUFBRTtFQUNwRixPQUFRQSxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLElBQUksSUFBSyxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUVELE1BQU1DLDRCQUE0QixHQUFHLFVBQ25DQyxVQUFVLEVBQ1ZILGdCQUEwQyxFQUMxQztFQUNBLE1BQU1JLFdBQVcsR0FBR0MsTUFBTSxDQUFDQyxJQUFJLENBQUNILFVBQVUsQ0FBQ0ksTUFBTSxDQUFDLENBQUNDLE1BQU0sQ0FBQyxJQUFJLENBQUM7RUFDL0QsTUFBTTtJQUNKQyxXQUFXLEVBQUVDLGtCQUFrQjtJQUMvQkMsWUFBWSxFQUFFQyxtQkFBbUI7SUFDakNDLGdCQUFnQixFQUFFQyx1QkFBdUI7SUFDekNDLFVBQVUsRUFBRUM7RUFDZCxDQUFDLEdBQUdqQix1QkFBdUIsQ0FBQ0MsZ0JBQWdCLENBQUM7RUFFN0MsSUFBSWlCLGlCQUFpQjtFQUNyQixJQUFJQyxpQkFBaUI7RUFDckIsSUFBSUMsaUJBQWlCO0VBQ3JCLElBQUlDLHFCQUFxQjtFQUN6QixJQUFJQyxlQUFlOztFQUVuQjtFQUNBLE1BQU1DLGlCQUFpQixHQUFHbEIsV0FBVyxDQUFDbUIsTUFBTSxDQUFDQyxLQUFLLElBQUk7SUFDcEQsT0FBTyxDQUFDbkIsTUFBTSxDQUFDQyxJQUFJLENBQUNtQixtQkFBbUIsQ0FBQ0MsbUJBQW1CLENBQUMsQ0FBQ0MsUUFBUSxDQUFDSCxLQUFLLENBQUMsSUFBSUEsS0FBSyxLQUFLLElBQUk7RUFDaEcsQ0FBQyxDQUFDO0VBRUYsSUFBSWQsa0JBQWtCLElBQUlBLGtCQUFrQixDQUFDa0IsTUFBTSxFQUFFO0lBQ25EVixpQkFBaUIsR0FBR0ksaUJBQWlCLENBQUNDLE1BQU0sQ0FBQ0MsS0FBSyxJQUFJO01BQ3BELE9BQU9kLGtCQUFrQixDQUFDa0IsTUFBTSxDQUFDRCxRQUFRLENBQUNILEtBQUssQ0FBQztJQUNsRCxDQUFDLENBQUM7RUFDSixDQUFDLE1BQU07SUFDTE4saUJBQWlCLEdBQUdJLGlCQUFpQjtFQUN2QztFQUNBLElBQUlaLGtCQUFrQixJQUFJQSxrQkFBa0IsQ0FBQ21CLE1BQU0sRUFBRTtJQUNuRFYsaUJBQWlCLEdBQUdHLGlCQUFpQixDQUFDQyxNQUFNLENBQUNDLEtBQUssSUFBSTtNQUNwRCxPQUFPZCxrQkFBa0IsQ0FBQ21CLE1BQU0sQ0FBQ0YsUUFBUSxDQUFDSCxLQUFLLENBQUM7SUFDbEQsQ0FBQyxDQUFDO0VBQ0osQ0FBQyxNQUFNO0lBQ0xMLGlCQUFpQixHQUFHRyxpQkFBaUI7RUFDdkM7RUFFQSxJQUFJVixtQkFBbUIsRUFBRTtJQUN2QkssaUJBQWlCLEdBQUdLLGlCQUFpQixDQUFDQyxNQUFNLENBQUNDLEtBQUssSUFBSTtNQUNwRCxPQUFPWixtQkFBbUIsQ0FBQ2UsUUFBUSxDQUFDSCxLQUFLLENBQUM7SUFDNUMsQ0FBQyxDQUFDO0VBQ0osQ0FBQyxNQUFNO0lBQ0xQLGlCQUFpQixHQUFHSyxpQkFBaUI7RUFDdkM7RUFDQTtFQUNBLElBQUluQixVQUFVLENBQUMyQixTQUFTLEtBQUssT0FBTyxFQUFFO0lBQ3BDYixpQkFBaUIsR0FBR0EsaUJBQWlCLENBQUNNLE1BQU0sQ0FBQ1EsV0FBVyxJQUFJQSxXQUFXLEtBQUssVUFBVSxDQUFDO0VBQ3pGO0VBRUEsSUFBSWpCLHVCQUF1QixFQUFFO0lBQzNCTSxxQkFBcUIsR0FBR0UsaUJBQWlCLENBQUNDLE1BQU0sQ0FBQ0MsS0FBSyxJQUFJO01BQ3hELE9BQU9WLHVCQUF1QixDQUFDYSxRQUFRLENBQUNILEtBQUssQ0FBQztJQUNoRCxDQUFDLENBQUM7RUFDSixDQUFDLE1BQU07SUFDTEoscUJBQXFCLEdBQUdoQixXQUFXO0VBQ3JDO0VBRUEsSUFBSVksaUJBQWlCLEVBQUU7SUFDckJLLGVBQWUsR0FBR0wsaUJBQWlCO0lBQ25DLElBQUksQ0FBQ0ssZUFBZSxDQUFDVyxNQUFNLEVBQUU7TUFDM0I7TUFDQTtNQUNBWCxlQUFlLENBQUNZLElBQUksQ0FBQztRQUNuQlQsS0FBSyxFQUFFLElBQUk7UUFDWFUsR0FBRyxFQUFFLElBQUk7UUFDVEMsSUFBSSxFQUFFO01BQ1IsQ0FBQyxDQUFDO0lBQ0o7RUFDRixDQUFDLE1BQU07SUFDTGQsZUFBZSxHQUFHakIsV0FBVyxDQUFDZ0MsR0FBRyxDQUFDWixLQUFLLElBQUk7TUFDekMsT0FBTztRQUFFQSxLQUFLO1FBQUVVLEdBQUcsRUFBRSxJQUFJO1FBQUVDLElBQUksRUFBRTtNQUFLLENBQUM7SUFDekMsQ0FBQyxDQUFDO0VBQ0o7RUFFQSxPQUFPO0lBQ0xqQixpQkFBaUI7SUFDakJDLGlCQUFpQjtJQUNqQkMscUJBQXFCO0lBQ3JCSCxpQkFBaUI7SUFDakJJO0VBQ0YsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNZ0IsSUFBSSxHQUFHLENBQUNDLGtCQUFrQixFQUFFbkMsVUFBVSxFQUFFSCxnQkFBMEMsS0FBSztFQUMzRixNQUFNOEIsU0FBUyxHQUFHM0IsVUFBVSxDQUFDMkIsU0FBUztFQUN0QyxNQUFNUyxnQkFBZ0IsR0FBRyxJQUFBQyxzQ0FBMkIsRUFBQ1YsU0FBUyxDQUFDO0VBQy9ELE1BQU07SUFDSlosaUJBQWlCO0lBQ2pCQyxpQkFBaUI7SUFDakJGLGlCQUFpQjtJQUNqQkcscUJBQXFCO0lBQ3JCQztFQUNGLENBQUMsR0FBR25CLDRCQUE0QixDQUFDQyxVQUFVLEVBQUVILGdCQUFnQixDQUFDO0VBRTlELE1BQU07SUFDSjRCLE1BQU0sRUFBRWEsZUFBZSxHQUFHLElBQUk7SUFDOUJaLE1BQU0sRUFBRWEsZUFBZSxHQUFHO0VBQzVCLENBQUMsR0FBRyxJQUFBQyw4Q0FBMkIsRUFBQzNDLGdCQUFnQixDQUFDO0VBRWpELE1BQU00QywwQkFBMEIsR0FBSSxTQUFRTCxnQkFBaUIsYUFBWTtFQUN6RSxJQUFJTSxzQkFBc0IsR0FBRyxJQUFJQywrQkFBc0IsQ0FBQztJQUN0REMsSUFBSSxFQUFFSCwwQkFBMEI7SUFDaENJLFdBQVcsRUFBRyxPQUFNSiwwQkFBMkIsNkVBQTRFTCxnQkFBaUIsU0FBUTtJQUNwSmhDLE1BQU0sRUFBRSxNQUNOVyxpQkFBaUIsQ0FBQytCLE1BQU0sQ0FDdEIsQ0FBQzFDLE1BQU0sRUFBRWlCLEtBQUssS0FBSztNQUNqQixNQUFNdkIsSUFBSSxHQUFHLElBQUFpRCxzQ0FBMkIsRUFDdEMvQyxVQUFVLENBQUNJLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdkIsSUFBSSxFQUM3QkUsVUFBVSxDQUFDSSxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzJCLFdBQVcsRUFDcENiLGtCQUFrQixDQUFDYyxlQUFlLENBQ25DO01BQ0QsSUFBSW5ELElBQUksRUFBRTtRQUNSLHVDQUNLTSxNQUFNO1VBQ1QsQ0FBQ2lCLEtBQUssR0FBRztZQUNQd0IsV0FBVyxFQUFHLHNCQUFxQnhCLEtBQU0sR0FBRTtZQUMzQ3ZCLElBQUksRUFDRDZCLFNBQVMsS0FBSyxPQUFPLEtBQUtOLEtBQUssS0FBSyxVQUFVLElBQUlBLEtBQUssS0FBSyxVQUFVLENBQUMsSUFDeEVyQixVQUFVLENBQUNJLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDNkIsUUFBUSxHQUM3QixJQUFJQyx1QkFBYyxDQUFDckQsSUFBSSxDQUFDLEdBQ3hCQTtVQUNSO1FBQUM7TUFFTCxDQUFDLE1BQU07UUFDTCxPQUFPTSxNQUFNO01BQ2Y7SUFDRixDQUFDLEVBQ0Q7TUFDRWdELEdBQUcsRUFBRTtRQUFFdEQsSUFBSSxFQUFFd0IsbUJBQW1CLENBQUMrQjtNQUFVO0lBQzdDLENBQUM7RUFFUCxDQUFDLENBQUM7RUFDRlgsc0JBQXNCLEdBQUdQLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDWixzQkFBc0IsQ0FBQztFQUVsRixNQUFNYSwwQkFBMEIsR0FBSSxTQUFRbkIsZ0JBQWlCLGFBQVk7RUFDekUsSUFBSW9CLHNCQUFzQixHQUFHLElBQUliLCtCQUFzQixDQUFDO0lBQ3REQyxJQUFJLEVBQUVXLDBCQUEwQjtJQUNoQ1YsV0FBVyxFQUFHLE9BQU1VLDBCQUEyQiw2RUFBNEVuQixnQkFBaUIsU0FBUTtJQUNwSmhDLE1BQU0sRUFBRSxNQUNOWSxpQkFBaUIsQ0FBQzhCLE1BQU0sQ0FDdEIsQ0FBQzFDLE1BQU0sRUFBRWlCLEtBQUssS0FBSztNQUNqQixNQUFNdkIsSUFBSSxHQUFHLElBQUFpRCxzQ0FBMkIsRUFDdEMvQyxVQUFVLENBQUNJLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdkIsSUFBSSxFQUM3QkUsVUFBVSxDQUFDSSxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzJCLFdBQVcsRUFDcENiLGtCQUFrQixDQUFDYyxlQUFlLENBQ25DO01BQ0QsSUFBSW5ELElBQUksRUFBRTtRQUNSLHVDQUNLTSxNQUFNO1VBQ1QsQ0FBQ2lCLEtBQUssR0FBRztZQUNQd0IsV0FBVyxFQUFHLHNCQUFxQnhCLEtBQU0sR0FBRTtZQUMzQ3ZCO1VBQ0Y7UUFBQztNQUVMLENBQUMsTUFBTTtRQUNMLE9BQU9NLE1BQU07TUFDZjtJQUNGLENBQUMsRUFDRDtNQUNFZ0QsR0FBRyxFQUFFO1FBQUV0RCxJQUFJLEVBQUV3QixtQkFBbUIsQ0FBQytCO01BQVU7SUFDN0MsQ0FBQztFQUVQLENBQUMsQ0FBQztFQUNGRyxzQkFBc0IsR0FBR3JCLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDRSxzQkFBc0IsQ0FBQztFQUVsRixNQUFNQywyQkFBMkIsR0FBSSxHQUFFckIsZ0JBQWlCLGNBQWE7RUFDckUsSUFBSXNCLHVCQUF1QixHQUFHLElBQUlmLCtCQUFzQixDQUFDO0lBQ3ZEQyxJQUFJLEVBQUVhLDJCQUEyQjtJQUNqQ1osV0FBVyxFQUFHLGtEQUFpRFQsZ0JBQWlCLFNBQVE7SUFDeEZoQyxNQUFNLEVBQUUsTUFBTTtNQUNaLE1BQU1BLE1BQU0sR0FBRztRQUNidUQsSUFBSSxFQUFFO1VBQ0pkLFdBQVcsRUFBRyxnQ0FBK0JULGdCQUFpQix5REFBd0Q7VUFDdEh0QyxJQUFJLEVBQUU4RDtRQUNSO01BQ0YsQ0FBQztNQUNELElBQUl0QixlQUFlLEVBQUU7UUFDbkJsQyxNQUFNLENBQUMsZUFBZSxDQUFDLEdBQUc7VUFDeEJ5QyxXQUFXLEVBQUcsa0NBQWlDVCxnQkFBaUIsU0FBUTtVQUN4RXRDLElBQUksRUFBRTRDO1FBQ1IsQ0FBQztNQUNIO01BQ0EsT0FBT3RDLE1BQU07SUFDZjtFQUNGLENBQUMsQ0FBQztFQUNGc0QsdUJBQXVCLEdBQ3JCdkIsa0JBQWtCLENBQUNtQixjQUFjLENBQUNJLHVCQUF1QixDQUFDLElBQUlwQyxtQkFBbUIsQ0FBQ3VDLE1BQU07RUFFMUYsTUFBTUMsNEJBQTRCLEdBQUksR0FBRTFCLGdCQUFpQixlQUFjO0VBQ3ZFLElBQUkyQix3QkFBd0IsR0FBRyxJQUFJcEIsK0JBQXNCLENBQUM7SUFDeERDLElBQUksRUFBRWtCLDRCQUE0QjtJQUNsQ2pCLFdBQVcsRUFBRyxxREFBb0RULGdCQUFpQiwrQkFBOEI7SUFDakhoQyxNQUFNLEVBQUUsTUFBTTtNQUNaLE1BQU1BLE1BQU0sR0FBRztRQUNiNEQsR0FBRyxFQUFFO1VBQ0huQixXQUFXLEVBQUcsaUNBQWdDVCxnQkFBaUIsNEVBQTJFO1VBQzFJdEMsSUFBSSxFQUFFLElBQUltRSxvQkFBVyxDQUFDM0MsbUJBQW1CLENBQUM0QyxTQUFTO1FBQ3JELENBQUM7UUFDREMsTUFBTSxFQUFFO1VBQ050QixXQUFXLEVBQUcsb0NBQW1DVCxnQkFBaUIsOEVBQTZFO1VBQy9JdEMsSUFBSSxFQUFFLElBQUltRSxvQkFBVyxDQUFDM0MsbUJBQW1CLENBQUM0QyxTQUFTO1FBQ3JEO01BQ0YsQ0FBQztNQUNELElBQUk1QixlQUFlLEVBQUU7UUFDbkJsQyxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUc7VUFDdkJ5QyxXQUFXLEVBQUcsaUNBQWdDVCxnQkFBaUIsMkJBQTBCO1VBQ3pGdEMsSUFBSSxFQUFFLElBQUltRSxvQkFBVyxDQUFDLElBQUlkLHVCQUFjLENBQUNULHNCQUFzQixDQUFDO1FBQ2xFLENBQUM7TUFDSDtNQUNBLE9BQU90QyxNQUFNO0lBQ2Y7RUFDRixDQUFDLENBQUM7RUFDRjJELHdCQUF3QixHQUN0QjVCLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDUyx3QkFBd0IsQ0FBQyxJQUFJekMsbUJBQW1CLENBQUN1QyxNQUFNO0VBRTNGLE1BQU1PLCtCQUErQixHQUFJLEdBQUVoQyxnQkFBaUIsWUFBVztFQUN2RSxJQUFJaUMsMkJBQTJCLEdBQUcsSUFBSTFCLCtCQUFzQixDQUFDO0lBQzNEQyxJQUFJLEVBQUV3QiwrQkFBK0I7SUFDckN2QixXQUFXLEVBQUcsT0FBTXVCLCtCQUFnQyx1RUFBc0VoQyxnQkFBaUIsU0FBUTtJQUNuSmhDLE1BQU0sRUFBRSxzQ0FDSGEscUJBQXFCLENBQUM2QixNQUFNLENBQUMsQ0FBQzFDLE1BQU0sRUFBRWlCLEtBQUssS0FBSztNQUNqRCxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQ0csUUFBUSxDQUFDSCxLQUFLLENBQUMsRUFBRTtRQUN4Q2Msa0JBQWtCLENBQUNtQyxHQUFHLENBQUNDLElBQUksQ0FDeEIsU0FBUWxELEtBQU0sMENBQXlDK0MsK0JBQWdDLDRDQUEyQyxDQUNwSTtRQUNELE9BQU9oRSxNQUFNO01BQ2Y7TUFDQSxNQUFNb0UsVUFBVSxHQUFHbkQsS0FBSyxLQUFLLElBQUksR0FBRyxVQUFVLEdBQUdBLEtBQUs7TUFDdEQsTUFBTXZCLElBQUksR0FBRyxJQUFBMkUsZ0RBQWdDLEVBQzNDekUsVUFBVSxDQUFDSSxNQUFNLENBQUNvRSxVQUFVLENBQUMsQ0FBQzFFLElBQUksRUFDbENFLFVBQVUsQ0FBQ0ksTUFBTSxDQUFDb0UsVUFBVSxDQUFDLENBQUN4QixXQUFXLEVBQ3pDYixrQkFBa0IsQ0FBQ2MsZUFBZSxFQUNsQzVCLEtBQUssQ0FDTjtNQUNELElBQUl2QixJQUFJLEVBQUU7UUFDUix1Q0FDS00sTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHdCLFdBQVcsRUFBRyxzQkFBcUJ4QixLQUFNLEdBQUU7WUFDM0N2QjtVQUNGO1FBQUM7TUFFTCxDQUFDLE1BQU07UUFDTCxPQUFPTSxNQUFNO01BQ2Y7SUFDRixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7TUFDTnNFLEVBQUUsRUFBRTtRQUNGN0IsV0FBVyxFQUFFLGtEQUFrRDtRQUMvRC9DLElBQUksRUFBRSxJQUFJbUUsb0JBQVcsQ0FBQyxJQUFJZCx1QkFBYyxDQUFDa0IsMkJBQTJCLENBQUM7TUFDdkUsQ0FBQztNQUNETSxHQUFHLEVBQUU7UUFDSDlCLFdBQVcsRUFBRSxtREFBbUQ7UUFDaEUvQyxJQUFJLEVBQUUsSUFBSW1FLG9CQUFXLENBQUMsSUFBSWQsdUJBQWMsQ0FBQ2tCLDJCQUEyQixDQUFDO01BQ3ZFLENBQUM7TUFDRE8sR0FBRyxFQUFFO1FBQ0gvQixXQUFXLEVBQUUsbURBQW1EO1FBQ2hFL0MsSUFBSSxFQUFFLElBQUltRSxvQkFBVyxDQUFDLElBQUlkLHVCQUFjLENBQUNrQiwyQkFBMkIsQ0FBQztNQUN2RTtJQUFDO0VBRUwsQ0FBQyxDQUFDO0VBQ0ZBLDJCQUEyQixHQUN6QmxDLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDZSwyQkFBMkIsQ0FBQyxJQUFJL0MsbUJBQW1CLENBQUN1QyxNQUFNO0VBRTlGLE1BQU1nQix1Q0FBdUMsR0FBSSxHQUFFekMsZ0JBQWlCLG9CQUFtQjtFQUN2RixJQUFJMEMsbUNBQW1DLEdBQUcsSUFBSW5DLCtCQUFzQixDQUFDO0lBQ25FQyxJQUFJLEVBQUVpQyx1Q0FBdUM7SUFDN0NoQyxXQUFXLEVBQUcsT0FBTWdDLHVDQUF3Qyx1RUFBc0V6QyxnQkFBaUIsU0FBUTtJQUMzSmhDLE1BQU0sRUFBRSxPQUFPO01BQ2IyRSxJQUFJLEVBQUU7UUFDSmxDLFdBQVcsRUFBRSwyRUFBMkU7UUFDeEYvQyxJQUFJLEVBQUV1RTtNQUNSLENBQUM7TUFDRFcsT0FBTyxFQUFFO1FBQ1BuQyxXQUFXLEVBQ1QscUZBQXFGO1FBQ3ZGL0MsSUFBSSxFQUFFdUU7TUFDUixDQUFDO01BQ0RZLE1BQU0sRUFBRTtRQUNOcEMsV0FBVyxFQUFFLGlEQUFpRDtRQUM5RC9DLElBQUksRUFBRW9GO01BQ1I7SUFDRixDQUFDO0VBQ0gsQ0FBQyxDQUFDO0VBQ0ZKLG1DQUFtQyxHQUNqQzNDLGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDd0IsbUNBQW1DLENBQUMsSUFDdEV4RCxtQkFBbUIsQ0FBQ3VDLE1BQU07RUFFNUIsTUFBTXNCLHlCQUF5QixHQUFJLEdBQUUvQyxnQkFBaUIsT0FBTTtFQUM1RCxJQUFJZ0QscUJBQXFCLEdBQUcsSUFBSUMsd0JBQWUsQ0FBQztJQUM5Q3pDLElBQUksRUFBRXVDLHlCQUF5QjtJQUMvQnRDLFdBQVcsRUFBRyxPQUFNc0MseUJBQTBCLG1EQUFrRC9DLGdCQUFpQixTQUFRO0lBQ3pIa0QsTUFBTSxFQUFFcEUsZUFBZSxDQUFDNEIsTUFBTSxDQUFDLENBQUNsQyxVQUFVLEVBQUUyRSxXQUFXLEtBQUs7TUFDMUQsTUFBTTtRQUFFbEUsS0FBSztRQUFFVSxHQUFHO1FBQUVDO01BQUssQ0FBQyxHQUFHdUQsV0FBVztNQUN4QyxNQUFNQyxpQkFBaUIscUJBQ2xCNUUsVUFBVSxDQUNkO01BQ0QsTUFBTTZFLEtBQUssR0FBR3BFLEtBQUssS0FBSyxJQUFJLEdBQUcsVUFBVSxHQUFHQSxLQUFLO01BQ2pELElBQUlVLEdBQUcsRUFBRTtRQUNQeUQsaUJBQWlCLENBQUUsR0FBRW5FLEtBQU0sTUFBSyxDQUFDLEdBQUc7VUFBRW9FO1FBQU0sQ0FBQztNQUMvQztNQUNBLElBQUl6RCxJQUFJLEVBQUU7UUFDUndELGlCQUFpQixDQUFFLEdBQUVuRSxLQUFNLE9BQU0sQ0FBQyxHQUFHO1VBQUVvRSxLQUFLLEVBQUcsSUFBR0EsS0FBTTtRQUFFLENBQUM7TUFDN0Q7TUFDQSxPQUFPRCxpQkFBaUI7SUFDMUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztFQUNQLENBQUMsQ0FBQztFQUNGSixxQkFBcUIsR0FBR2pELGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDOEIscUJBQXFCLENBQUM7RUFFaEYsTUFBTU0sb0JBQW9CO0lBQ3hCQyxLQUFLLEVBQUU7TUFDTDlDLFdBQVcsRUFBRSwrRUFBK0U7TUFDNUYvQyxJQUFJLEVBQUV1RTtJQUNSLENBQUM7SUFDRHVCLEtBQUssRUFBRTtNQUNML0MsV0FBVyxFQUFFLHNEQUFzRDtNQUNuRS9DLElBQUksRUFBRXNGLHFCQUFxQixHQUN2QixJQUFJbkIsb0JBQVcsQ0FBQyxJQUFJZCx1QkFBYyxDQUFDaUMscUJBQXFCLENBQUMsQ0FBQyxHQUMxRFM7SUFDTixDQUFDO0lBQ0RDLElBQUksRUFBRXhFLG1CQUFtQixDQUFDeUU7RUFBUSxHQUMvQkMsNEJBQWM7SUFDakJDLE9BQU8sRUFBRTNFLG1CQUFtQixDQUFDNEU7RUFBZ0IsRUFDOUM7RUFDRCxNQUFNQywwQkFBMEIsR0FBSSxHQUFFL0QsZ0JBQWlCLEVBQUM7RUFDeEQsTUFBTWdFLFVBQVUsR0FBRyxDQUFDOUUsbUJBQW1CLENBQUMrRSxZQUFZLEVBQUVsRSxrQkFBa0IsQ0FBQ21FLGtCQUFrQixDQUFDO0VBQzVGLE1BQU1DLGlCQUFpQjtJQUNyQkMsRUFBRSxFQUFFLElBQUFDLDJCQUFhLEVBQUM5RSxTQUFTLEVBQUUrRSxHQUFHLElBQUlBLEdBQUcsQ0FBQ0MsUUFBUTtFQUFDLEdBQzlDckYsbUJBQW1CLENBQUNDLG1CQUFtQixDQUMzQztFQUNELE1BQU1mLFlBQVksR0FBRyxNQUFNO0lBQ3pCLE9BQU9NLGlCQUFpQixDQUFDZ0MsTUFBTSxDQUFDLENBQUMxQyxNQUFNLEVBQUVpQixLQUFLLEtBQUs7TUFDakQsTUFBTXZCLElBQUksR0FBRyxJQUFBOEcsd0NBQTRCLEVBQ3ZDNUcsVUFBVSxDQUFDSSxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQ3ZCLElBQUksRUFDN0JFLFVBQVUsQ0FBQ0ksTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUMyQixXQUFXLEVBQ3BDYixrQkFBa0IsQ0FBQ2MsZUFBZSxDQUNuQztNQUNELElBQUlqRCxVQUFVLENBQUNJLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDdkIsSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUNoRCxNQUFNK0cscUJBQXFCLEdBQ3pCMUUsa0JBQWtCLENBQUNjLGVBQWUsQ0FBQ2pELFVBQVUsQ0FBQ0ksTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUMyQixXQUFXLENBQUM7UUFDMUUsTUFBTThELElBQUksR0FBR0QscUJBQXFCLEdBQUdBLHFCQUFxQixDQUFDbkIsb0JBQW9CLEdBQUdxQixTQUFTO1FBQzNGLHVDQUNLM0csTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHdCLFdBQVcsRUFBRyxzQkFBcUJ4QixLQUFNLEdBQUU7WUFDM0N5RixJQUFJO1lBQ0poSCxJQUFJLEVBQUVFLFVBQVUsQ0FBQ0ksTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUM2QixRQUFRLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ3JELElBQUksQ0FBQyxHQUFHQSxJQUFJO1lBQ3pFLE1BQU1rSCxPQUFPLENBQUNDLE1BQU0sRUFBRUgsSUFBSSxFQUFFSSxPQUFPLEVBQUVDLFNBQVMsRUFBRTtjQUM5QyxJQUFJO2dCQUNGLE1BQU07a0JBQUV4QixLQUFLO2tCQUFFQyxLQUFLO2tCQUFFRSxJQUFJO2tCQUFFc0IsS0FBSztrQkFBRUMsS0FBSztrQkFBRUMsSUFBSTtrQkFBRUMsTUFBTTtrQkFBRXRCO2dCQUFRLENBQUMsR0FBR2EsSUFBSTtnQkFDeEUsTUFBTTtrQkFBRVUsY0FBYztrQkFBRUMscUJBQXFCO2tCQUFFQztnQkFBdUIsQ0FBQyxHQUNyRXpCLE9BQU8sSUFBSSxDQUFDLENBQUM7Z0JBQ2YsTUFBTTtrQkFBRTBCLE1BQU07a0JBQUVDLElBQUk7a0JBQUVDO2dCQUFLLENBQUMsR0FBR1gsT0FBTztnQkFDdEMsTUFBTVksY0FBYyxHQUFHLElBQUFDLDBCQUFhLEVBQUNaLFNBQVMsQ0FBQztnQkFFL0MsTUFBTTtrQkFBRWhILElBQUk7a0JBQUU2SDtnQkFBUSxDQUFDLEdBQUcsSUFBQUMsd0NBQXFCLEVBQzdDSCxjQUFjLENBQ1gxRyxNQUFNLENBQUNDLEtBQUssSUFBSUEsS0FBSyxDQUFDNkcsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQ2hEakcsR0FBRyxDQUFDWixLQUFLLElBQUlBLEtBQUssQ0FBQzhHLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FDOUMvRyxNQUFNLENBQUNDLEtBQUssSUFBSUEsS0FBSyxDQUFDK0csT0FBTyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUNwRDtnQkFDRCxNQUFNQyxVQUFVLEdBQUd6QyxLQUFLLElBQUlBLEtBQUssQ0FBQzBDLElBQUksQ0FBQyxHQUFHLENBQUM7Z0JBRTNDLE9BQU9DLGNBQWMsQ0FBQ0MsV0FBVyxDQUMvQnZCLE1BQU0sQ0FBQzVGLEtBQUssQ0FBQyxDQUFDTSxTQUFTO2tCQUVyQjhHLFVBQVUsRUFBRTtvQkFDVkMsTUFBTSxFQUFFO3NCQUNOQyxNQUFNLEVBQUUsU0FBUztzQkFDakJoSCxTQUFTLEVBQUVBLFNBQVM7c0JBQ3BCZ0YsUUFBUSxFQUFFTSxNQUFNLENBQUNOO29CQUNuQixDQUFDO29CQUNEaUMsR0FBRyxFQUFFdkg7a0JBQ1A7Z0JBQUMsR0FDR3NFLEtBQUssSUFBSSxDQUFDLENBQUMsR0FFakIwQyxVQUFVLEVBQ1Z2QyxJQUFJLEVBQ0pzQixLQUFLLEVBQ0xDLEtBQUssRUFDTEMsSUFBSSxFQUNKQyxNQUFNLEVBQ05wSCxJQUFJLEVBQ0o2SCxPQUFPLEVBQ1AsS0FBSyxFQUNMUixjQUFjLEVBQ2RDLHFCQUFxQixFQUNyQkMsc0JBQXNCLEVBQ3RCQyxNQUFNLEVBQ05DLElBQUksRUFDSkMsSUFBSSxFQUNKQyxjQUFjLEVBQ2QzRixrQkFBa0IsQ0FBQzBHLFlBQVksQ0FDaEM7Y0FDSCxDQUFDLENBQUMsT0FBT0MsQ0FBQyxFQUFFO2dCQUNWM0csa0JBQWtCLENBQUM0RyxXQUFXLENBQUNELENBQUMsQ0FBQztjQUNuQztZQUNGO1VBQ0Y7UUFBQztNQUVMLENBQUMsTUFBTSxJQUFJOUksVUFBVSxDQUFDSSxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQ3ZCLElBQUksS0FBSyxTQUFTLEVBQUU7UUFDdEQsdUNBQ0tNLE1BQU07VUFDVCxDQUFDaUIsS0FBSyxHQUFHO1lBQ1B3QixXQUFXLEVBQUcsc0JBQXFCeEIsS0FBTSxHQUFFO1lBQzNDdkIsSUFBSSxFQUFFRSxVQUFVLENBQUNJLE1BQU0sQ0FBQ2lCLEtBQUssQ0FBQyxDQUFDNkIsUUFBUSxHQUFHLElBQUlDLHVCQUFjLENBQUNyRCxJQUFJLENBQUMsR0FBR0EsSUFBSTtZQUN6RSxNQUFNa0gsT0FBTyxDQUFDQyxNQUFNLEVBQUU7Y0FDcEIsSUFBSUEsTUFBTSxDQUFDNUYsS0FBSyxDQUFDLElBQUk0RixNQUFNLENBQUM1RixLQUFLLENBQUMsQ0FBQzJILFdBQVcsRUFBRTtnQkFDOUMsT0FBTy9CLE1BQU0sQ0FBQzVGLEtBQUssQ0FBQyxDQUFDMkgsV0FBVyxDQUFDL0csR0FBRyxDQUFDZ0gsVUFBVSxLQUFLO2tCQUNsREMsUUFBUSxFQUFFRCxVQUFVLENBQUMsQ0FBQyxDQUFDO2tCQUN2QkUsU0FBUyxFQUFFRixVQUFVLENBQUMsQ0FBQztnQkFDekIsQ0FBQyxDQUFDLENBQUM7Y0FDTCxDQUFDLE1BQU07Z0JBQ0wsT0FBTyxJQUFJO2NBQ2I7WUFDRjtVQUNGO1FBQUM7TUFFTCxDQUFDLE1BQU0sSUFBSWpKLFVBQVUsQ0FBQ0ksTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUN2QixJQUFJLEtBQUssT0FBTyxFQUFFO1FBQ3BELHVDQUNLTSxNQUFNO1VBQ1QsQ0FBQ2lCLEtBQUssR0FBRztZQUNQd0IsV0FBVyxFQUFHLGtHQUFpRztZQUMvRy9DLElBQUksRUFBRUUsVUFBVSxDQUFDSSxNQUFNLENBQUNpQixLQUFLLENBQUMsQ0FBQzZCLFFBQVEsR0FBRyxJQUFJQyx1QkFBYyxDQUFDckQsSUFBSSxDQUFDLEdBQUdBLElBQUk7WUFDekUsTUFBTWtILE9BQU8sQ0FBQ0MsTUFBTSxFQUFFO2NBQ3BCLElBQUksQ0FBQ0EsTUFBTSxDQUFDNUYsS0FBSyxDQUFDLEVBQUUsT0FBTyxJQUFJO2NBQy9CLE9BQU80RixNQUFNLENBQUM1RixLQUFLLENBQUMsQ0FBQ1ksR0FBRyxDQUFDLE1BQU1tSCxJQUFJLElBQUk7Z0JBQ3JDLElBQUlBLElBQUksQ0FBQ3pILFNBQVMsSUFBSXlILElBQUksQ0FBQ3pDLFFBQVEsSUFBSXlDLElBQUksQ0FBQ1QsTUFBTSxLQUFLLFFBQVEsRUFBRTtrQkFDL0QsT0FBT1MsSUFBSTtnQkFDYixDQUFDLE1BQU07a0JBQ0wsT0FBTztvQkFBRTNELEtBQUssRUFBRTJEO2tCQUFLLENBQUM7Z0JBQ3hCO2NBQ0YsQ0FBQyxDQUFDO1lBQ0o7VUFDRjtRQUFDO01BRUwsQ0FBQyxNQUFNLElBQUl0SixJQUFJLEVBQUU7UUFDZix1Q0FDS00sTUFBTTtVQUNULENBQUNpQixLQUFLLEdBQUc7WUFDUHdCLFdBQVcsRUFBRyxzQkFBcUJ4QixLQUFNLEdBQUU7WUFDM0N2QixJQUFJLEVBQUVFLFVBQVUsQ0FBQ0ksTUFBTSxDQUFDaUIsS0FBSyxDQUFDLENBQUM2QixRQUFRLEdBQUcsSUFBSUMsdUJBQWMsQ0FBQ3JELElBQUksQ0FBQyxHQUFHQTtVQUN2RTtRQUFDO01BRUwsQ0FBQyxNQUFNO1FBQ0wsT0FBT00sTUFBTTtNQUNmO0lBQ0YsQ0FBQyxFQUFFbUcsaUJBQWlCLENBQUM7RUFDdkIsQ0FBQztFQUNELElBQUk4QyxzQkFBc0IsR0FBRyxJQUFJQywwQkFBaUIsQ0FBQztJQUNqRDFHLElBQUksRUFBRXVELDBCQUEwQjtJQUNoQ3RELFdBQVcsRUFBRyxPQUFNc0QsMEJBQTJCLHlFQUF3RS9ELGdCQUFpQixTQUFRO0lBQ2hKZ0UsVUFBVTtJQUNWaEcsTUFBTSxFQUFFSTtFQUNWLENBQUMsQ0FBQztFQUNGNkksc0JBQXNCLEdBQUdsSCxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQytGLHNCQUFzQixDQUFDO0VBRWxGLE1BQU07SUFBRUUsY0FBYztJQUFFQztFQUFTLENBQUMsR0FBRyxJQUFBQyxtQ0FBcUIsRUFBQztJQUN6RDdHLElBQUksRUFBRVIsZ0JBQWdCO0lBQ3RCc0gsZ0JBQWdCLEVBQUU7TUFDaEJDLEtBQUssRUFBRXJJLG1CQUFtQixDQUFDc0k7SUFDN0IsQ0FBQztJQUNEQyxRQUFRLEVBQUVSLHNCQUFzQixJQUFJL0gsbUJBQW1CLENBQUN1QztFQUMxRCxDQUFDLENBQUM7RUFDRixJQUFJaUcsMEJBQTBCLEdBQUcvQyxTQUFTO0VBQzFDLElBQ0U1RSxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ2tHLFFBQVEsQ0FBQyxJQUMzQ3JILGtCQUFrQixDQUFDbUIsY0FBYyxDQUFDaUcsY0FBYyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQ3JFO0lBQ0FPLDBCQUEwQixHQUFHUCxjQUFjO0VBQzdDO0VBRUFwSCxrQkFBa0IsQ0FBQ2MsZUFBZSxDQUFDdEIsU0FBUyxDQUFDLEdBQUc7SUFDOUMrQix1QkFBdUI7SUFDdkJLLHdCQUF3QjtJQUN4QnJCLHNCQUFzQjtJQUN0QmMsc0JBQXNCO0lBQ3RCYSwyQkFBMkI7SUFDM0JTLG1DQUFtQztJQUNuQ1ksb0JBQW9CO0lBQ3BCMkQsc0JBQXNCO0lBQ3RCUywwQkFBMEI7SUFDMUJuQyxNQUFNLEVBQUU7TUFDTjlILGdCQUFnQjtNQUNoQnlDLGVBQWU7TUFDZkM7SUFDRjtFQUNGLENBQUM7RUFFRCxJQUFJWixTQUFTLEtBQUssT0FBTyxFQUFFO0lBQ3pCLE1BQU1vSSxVQUFVLEdBQUcsSUFBSVQsMEJBQWlCLENBQUM7TUFDdkMxRyxJQUFJLEVBQUUsUUFBUTtNQUNkQyxXQUFXLEVBQUcsNkZBQTRGO01BQzFHekMsTUFBTSxFQUFFLE9BQU87UUFDYjRKLFlBQVksRUFBRTFJLG1CQUFtQixDQUFDMkksaUJBQWlCO1FBQ25EQyxJQUFJLEVBQUU7VUFDSnJILFdBQVcsRUFBRSwyQkFBMkI7VUFDeEMvQyxJQUFJLEVBQUUsSUFBSXFELHVCQUFjLENBQUNrRyxzQkFBc0I7UUFDakQ7TUFDRixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBQ0ZsSCxrQkFBa0IsQ0FBQ21CLGNBQWMsQ0FBQ3lHLFVBQVUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0lBQ3pENUgsa0JBQWtCLENBQUM0SCxVQUFVLEdBQUdBLFVBQVU7RUFDNUM7QUFDRixDQUFDO0FBQUMifQ==