"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
      break;
    default:
      castType = undefined;
  }
  return castType;
};
const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});
const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = _objectSpread(_objectSpread({}, emptyCLPS), schema.classLevelPermissions);
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */
      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    return `'${cmpt}'`;
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substr(1);
};
const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }
      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }
    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };

      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }
    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }
    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    delete databaseOptions.enableSchemaHooks;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }

  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    await conn.tx('set-indexes-with-schema-format', async t => {
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }

      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        error = err;
      }
      throw error;
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });

    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = _objectSpread({}, update);

    // Set flag for dot notation fields
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }
    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = object[fieldName];
        coords = coords.substr(2, coords.length - 4).split('),(');
        coords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: coords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (const field in stage.$match) {
          const value = stage.$match[field];
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }
    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;
    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];
      if (pt[0] === item[0] && pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }
    return foundIndex === index;
  });
  if (unique.length < 3) {
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}
function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}
function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }
  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}
function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }
  return true;
}
function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars
    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substr(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVdGlscyIsInJlcXVpcmUiLCJQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IiLCJQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yIiwiUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IiLCJsb2dnZXIiLCJkZWJ1ZyIsImFyZ3MiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZyIsImdldExvZ2dlciIsImFwcGx5IiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwidmFsdWUiLCJfX3R5cGUiLCJpc28iLCJuYW1lIiwidG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUiLCJwb3N0Z3Jlc1ZhbHVlIiwiY2FzdFR5cGUiLCJ1bmRlZmluZWQiLCJ0cmFuc2Zvcm1WYWx1ZSIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiT2JqZWN0IiwiZnJlZXplIiwiZmluZCIsImdldCIsImNvdW50IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsInRvUGFyc2VTY2hlbWEiLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3dwZXJtIiwiX3JwZXJtIiwiY2xwcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJ0b1Bvc3RncmVzU2NoZW1hIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJoYW5kbGVEb3RGaWVsZHMiLCJvYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0ciIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiY2FzZUluc2Vuc2l0aXZlIiwicGF0dGVybnMiLCJ2YWx1ZXMiLCJzb3J0cyIsImlzQXJyYXlGaWVsZCIsImluaXRpYWxQYXR0ZXJuc0xlbmd0aCIsImZpZWxkVmFsdWUiLCIkZXhpc3RzIiwiYXV0aERhdGFNYXRjaCIsIm1hdGNoIiwiJGluIiwiJHJlZ2V4IiwiTUFYX0lOVF9QTFVTX09ORSIsImNsYXVzZXMiLCJjbGF1c2VWYWx1ZXMiLCJzdWJRdWVyeSIsImNsYXVzZSIsInBhdHRlcm4iLCJvck9yQW5kIiwibm90IiwiJG5lIiwiY29uc3RyYWludEZpZWxkTmFtZSIsIiRyZWxhdGl2ZVRpbWUiLCJJTlZBTElEX0pTT04iLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIl9jb2xsZWN0aW9uUHJlZml4IiwiZW5hYmxlU2NoZW1hSG9va3MiLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsIl91dWlkIiwidXVpZHY0IiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIndhdGNoIiwiY2FsbGJhY2siLCJjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5IiwiYW5hbHl6ZSIsImhhbmRsZVNodXRkb3duIiwiX3N0cmVhbSIsImRvbmUiLCIkcG9vbCIsImVuZCIsIl9saXN0ZW5Ub1NjaGVtYSIsImNvbm5lY3QiLCJkaXJlY3QiLCJvbiIsImRhdGEiLCJwYXlsb2FkIiwicGFyc2UiLCJzZW5kZXJJZCIsIm5vbmUiLCJfbm90aWZ5U2NoZW1hQ2hhbmdlIiwiY2F0Y2giLCJfZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cyIsImNvbm4iLCJjbGFzc0V4aXN0cyIsIm9uZSIsImEiLCJleGlzdHMiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwidGFzayIsInQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiY3JlYXRlVGFibGUiLCJlcnIiLCJjb2RlIiwiZGV0YWlsIiwiRFVQTElDQVRFX1ZBTFVFIiwidmFsdWVzQXJyYXkiLCJwYXR0ZXJuc0FycmF5IiwiYXNzaWduIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsInJlbGF0aW9ucyIsInBhcnNlVHlwZSIsInFzIiwiYmF0Y2giLCJqb2luVGFibGUiLCJzY2hlbWFVcGdyYWRlIiwiY29sdW1ucyIsImNvbHVtbl9uYW1lIiwibmV3Q29sdW1ucyIsImZpbHRlciIsIml0ZW0iLCJhZGRGaWVsZElmTm90RXhpc3RzIiwicG9zdGdyZXNUeXBlIiwiYW55IiwicGF0aCIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImRlbGV0ZUNsYXNzIiwib3BlcmF0aW9ucyIsInJlc3BvbnNlIiwiaGVscGVycyIsInRoZW4iLCJkZWxldGVBbGxDbGFzc2VzIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJwcm9taXNlIiwib3BzIiwidW5kZXJseWluZ0Vycm9yIiwiY29uc3RyYWludCIsIm1hdGNoZXMiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsIndoZXJlIiwiT0JKRUNUX05PVF9GT1VORCIsImZpbmRPbmVBbmRVcGRhdGUiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZVBhdHRlcm5zIiwib3JpZ2luYWxVcGRhdGUiLCJkb3ROb3RhdGlvbk9wdGlvbnMiLCJnZW5lcmF0ZSIsImpzb25iIiwibGFzdEtleSIsImZpZWxkTmFtZUluZGV4Iiwic3RyIiwiYW1vdW50Iiwib2JqZWN0cyIsImtleXNUb0luY3JlbWVudCIsImsiLCJpbmNyZW1lbnRQYXR0ZXJucyIsImMiLCJrZXlzVG9EZWxldGUiLCJkZWxldGVQYXR0ZXJucyIsInAiLCJ1cGRhdGVPYmplY3QiLCJleHBlY3RlZFR5cGUiLCJyZWplY3QiLCJ3aGVyZUNsYXVzZSIsInVwc2VydE9uZU9iamVjdCIsImNyZWF0ZVZhbHVlIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImV4cGxhaW4iLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsIm9yaWdpbmFsUXVlcnkiLCJwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QiLCJ0YXJnZXRDbGFzcyIsInkiLCJ4IiwiY29vcmRzIiwicGFyc2VGbG9hdCIsImNyZWF0ZWRBdCIsInRvSVNPU3RyaW5nIiwidXBkYXRlZEF0IiwiZXhwaXJlc0F0IiwiZW5zdXJlVW5pcXVlbmVzcyIsImNvbnN0cmFpbnROYW1lIiwiY29uc3RyYWludFBhdHRlcm5zIiwibWVzc2FnZSIsInJlYWRQcmVmZXJlbmNlIiwiZXN0aW1hdGUiLCJhcHByb3hpbWF0ZV9yb3dfY291bnQiLCJkaXN0aW5jdCIsImNvbHVtbiIsImlzTmVzdGVkIiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1lciIsImNoaWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJoaW50IiwiY291bnRGaWVsZCIsImdyb3VwVmFsdWVzIiwiZ3JvdXBQYXR0ZXJuIiwic3RhZ2UiLCIkZ3JvdXAiLCJncm91cEJ5RmllbGRzIiwiYWxpYXMiLCJzb3VyY2UiLCJvcGVyYXRpb24iLCIkc3VtIiwiJG1heCIsIiRtaW4iLCIkYXZnIiwiJHByb2plY3QiLCIkbWF0Y2giLCIkb3IiLCJjb2xsYXBzZSIsImVsZW1lbnQiLCJtYXRjaFBhdHRlcm5zIiwiJGxpbWl0IiwiJHNraXAiLCIkc29ydCIsIm9yZGVyIiwiZSIsInRyaW0iLCJCb29sZWFuIiwicGFyc2VJbnQiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicHJvbWlzZXMiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJhbGwiLCJzcWwiLCJtaXNjIiwianNvbk9iamVjdFNldEtleXMiLCJhcnJheSIsImFkZCIsImFkZFVuaXF1ZSIsInJlbW92ZSIsImNvbnRhaW5zQWxsIiwiY29udGFpbnNBbGxSZWdleCIsImNvbnRhaW5zIiwiY3R4IiwiZHVyYXRpb24iLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJnZXRJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJ1cGRhdGVFc3RpbWF0ZWRDb3VudCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiZW5zdXJlSW5kZXgiLCJpbmRleE5hbWUiLCJvcHRpb25zIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJzIiwic3RhcnRzV2l0aCIsImxpdGVyYWxpemVSZWdleFBhcnQiLCJpc1N0YXJ0c1dpdGhSZWdleCIsImZpcnN0VmFsdWVzSXNSZWdleCIsInNvbWUiLCJjcmVhdGVMaXRlcmFsUmVnZXgiLCJyZW1haW5pbmciLCJSZWdFeHAiLCJtYXRjaGVyMSIsInJlc3VsdDEiLCJwcmVmaXgiLCJtYXRjaGVyMiIsInJlc3VsdDIiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHIoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJHtjb25zdHJhaW50RmllbGROYW1lfSA8PiAkJHtpbmRleCArIDF9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBsZXQgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuXG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSA9PT0gJ29iamVjdCcgJiYgcG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICAgIHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUocGFyc2VyUmVzdWx0LnJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWV9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3BncDogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIF91dWlkOiBhbnk7XG5cbiAgY29uc3RydWN0b3IoeyB1cmksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgZGF0YWJhc2VPcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhZGF0YWJhc2VPcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIGRlbGV0ZSBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBkYXRhYmFzZU9wdGlvbnMpO1xuICAgIHRoaXMuX2NsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuICAgIHRoaXMuX3BncCA9IHBncDtcbiAgICB0aGlzLl91dWlkID0gdXVpZHY0KCk7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gZmFsc2U7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICAvL05vdGUgdGhhdCBhbmFseXplPXRydWUgd2lsbCBydW4gdGhlIHF1ZXJ5LCBleGVjdXRpbmcgSU5TRVJUUywgREVMRVRFUywgZXRjLlxuICBjcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIGFuYWx5emU6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgIGlmIChhbmFseXplKSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEFOQUxZWkUsIEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW0uZG9uZSgpO1xuICAgICAgZGVsZXRlIHRoaXMuX3N0cmVhbTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgYXN5bmMgX2xpc3RlblRvU2NoZW1hKCkge1xuICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgIHRoaXMuX3N0cmVhbSA9IGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KHsgZGlyZWN0OiB0cnVlIH0pO1xuICAgICAgdGhpcy5fc3RyZWFtLmNsaWVudC5vbignbm90aWZpY2F0aW9uJywgZGF0YSA9PiB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGRhdGEucGF5bG9hZCk7XG4gICAgICAgIGlmIChwYXlsb2FkLnNlbmRlcklkICE9PSB0aGlzLl91dWlkKSB7XG4gICAgICAgICAgdGhpcy5fb25jaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBhd2FpdCB0aGlzLl9zdHJlYW0ubm9uZSgnTElTVEVOICQxficsICdzY2hlbWEuY2hhbmdlJyk7XG4gICAgfVxuICB9XG5cbiAgX25vdGlmeVNjaGVtYUNoYW5nZSgpIHtcbiAgICBpZiAodGhpcy5fc3RyZWFtKSB7XG4gICAgICB0aGlzLl9zdHJlYW1cbiAgICAgICAgLm5vbmUoJ05PVElGWSAkMX4sICQyJywgWydzY2hlbWEuY2hhbmdlJywgeyBzZW5kZXJJZDogdGhpcy5fdXVpZCB9XSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gYXdhaXQgY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcywgdCk7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmIGVyci5kZXRhaWwuaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgYXN5bmMgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScpO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGF3YWl0IGNvbm4udGFzaygnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+IHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSk7XG5cbiAgICAgIGF3YWl0IHQuYmF0Y2gobmV3Q29sdW1ucyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnKTtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhjbGFzc05hbWUsIHsgZmllbGRzOiB7IFtmaWVsZE5hbWVdOiB0eXBlIH0gfSwgdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCd1cGRhdGUtc2NoZW1hLWZpZWxkLW9wdGlvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQob3BlcmF0aW9ucykpKVxuICAgICAgLnRoZW4oKCkgPT4gY2xhc3NOYW1lLmluZGV4T2YoJ19Kb2luOicpICE9IDApOyAvLyByZXNvbHZlcyB3aXRoIGZhbHNlIHdoZW4gX0pvaW4gdGFibGVcblxuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBhbGwgZGF0YSBrbm93biB0byB0aGlzIGFkYXB0ZXIuIFVzZWQgZm9yIHRlc3RpbmcuXG4gIGFzeW5jIGRlbGV0ZUFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgaGVscGVycyA9IHRoaXMuX3BncC5oZWxwZXJzO1xuICAgIGRlYnVnKCdkZWxldGVBbGxDbGFzc2VzJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMCA/IGBPUkRFUiBCWSAke3NvcnRpbmd9YCA6ICcnO1xuICAgIH1cbiAgICBpZiAod2hlcmUuc29ydHMgJiYgT2JqZWN0LmtleXMoKHdoZXJlLnNvcnRzOiBhbnkpKS5sZW5ndGggPiAwKSB7XG4gICAgICBzb3J0UGF0dGVybiA9IGBPUkRFUiBCWSAke3doZXJlLnNvcnRzLmpvaW4oKX1gO1xuICAgIH1cblxuICAgIGxldCBjb2x1bW5zID0gJyonO1xuICAgIGlmIChrZXlzKSB7XG4gICAgICAvLyBFeGNsdWRlIGVtcHR5IGtleXNcbiAgICAgIC8vIFJlcGxhY2UgQUNMIGJ5IGl0J3Mga2V5c1xuICAgICAga2V5cyA9IGtleXMucmVkdWNlKChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vLnB1c2goJ19ycGVybScpO1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3dwZXJtJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAga2V5Lmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgZmllbGQgbm90IHJlZmVyZW5jZWQgaW4gdGhlIHNjaGVtYVxuICAgICAgICAgIC8vIFJlbGF0aW9uIGlzIG5vdCBhIGNvbHVtbiBpbiBwb3N0Z3Jlc1xuICAgICAgICAgIC8vICRzY29yZSBpcyBhIFBhcnNlIHNwZWNpYWwgZmllbGQgYW5kIGlzIGFsc28gbm90IGEgY29sdW1uXG4gICAgICAgICAgKChzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgIT09ICdSZWxhdGlvbicpIHx8IGtleSA9PT0gJyRzY29yZScpXG4gICAgICAgICkge1xuICAgICAgICAgIG1lbW8ucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSwgW10pO1xuICAgICAgY29sdW1ucyA9IGtleXNcbiAgICAgICAgLm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09ICckc2NvcmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gYHRzX3JhbmtfY2QodG9fdHN2ZWN0b3IoJCR7Mn0sICQkezN9Om5hbWUpLCB0b190c3F1ZXJ5KCQkezR9LCAkJHs1fSksIDMyKSBhcyBzY29yZWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJCR7aW5kZXggKyB2YWx1ZXMubGVuZ3RoICsgMX06bmFtZWA7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICB2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KGtleXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueShxcywgdmFsdWVzKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLy8gUXVlcnkgb24gbm9uIGV4aXN0aW5nIHRhYmxlLCBkb24ndCBjcmFzaFxuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHIoMiwgY29vcmRzLmxlbmd0aCAtIDQpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLCBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiBjb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRtYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJG1hdGNoW2ZpZWxkXTtcbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcChjID0+IHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gUmVnRXhwKCdbMC05IF18XFxcXHB7TH0nLCAndScpOyAvLyBTdXBwb3J0IGFsbCB1bmljb2RlIGxldHRlciBjaGFyc1xuICAgICAgaWYgKGMubWF0Y2gocmVnZXgpICE9PSBudWxsKSB7XG4gICAgICAgIC8vIGRvbid0IGVzY2FwZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyc1xuICAgICAgICByZXR1cm4gYztcbiAgICAgIH1cbiAgICAgIC8vIGVzY2FwZSBldmVyeXRoaW5nIGVsc2UgKHNpbmdsZSBxdW90ZXMgd2l0aCBzaW5nbGUgcXVvdGVzLCBldmVyeXRoaW5nIGVsc2Ugd2l0aCBhIGJhY2tzbGFzaClcbiAgICAgIHJldHVybiBjID09PSBgJ2AgPyBgJydgIDogYFxcXFwke2N9YDtcbiAgICB9KVxuICAgIC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzOiBzdHJpbmcpIHtcbiAgY29uc3QgbWF0Y2hlcjEgPSAvXFxcXFEoKD8hXFxcXEUpLiopXFxcXEUkLztcbiAgY29uc3QgcmVzdWx0MTogYW55ID0gcy5tYXRjaChtYXRjaGVyMSk7XG4gIGlmIChyZXN1bHQxICYmIHJlc3VsdDEubGVuZ3RoID4gMSAmJiByZXN1bHQxLmluZGV4ID4gLTEpIHtcbiAgICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIGFuZCBhbiBlbmQgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0MS5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MVsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gIGNvbnN0IG1hdGNoZXIyID0gL1xcXFxRKCg/IVxcXFxFKS4qKSQvO1xuICBjb25zdCByZXN1bHQyOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIyKTtcbiAgaWYgKHJlc3VsdDIgJiYgcmVzdWx0Mi5sZW5ndGggPiAxICYmIHJlc3VsdDIuaW5kZXggPiAtMSkge1xuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyKDAsIHJlc3VsdDIuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDJbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyByZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRSBmcm9tIHRoZSByZW1haW5pbmcgdGV4dCAmIGVzY2FwZSBzaW5nbGUgcXVvdGVzXG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcRSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXFEpLywgJyQxJylcbiAgICAucmVwbGFjZSgvXlxcXFxFLywgJycpXG4gICAgLnJlcGxhY2UoL15cXFxcUS8sICcnKVxuICAgIC5yZXBsYWNlKC8oW14nXSknLywgYCQxJydgKVxuICAgIC5yZXBsYWNlKC9eJyhbXiddKS8sIGAnJyQxYCk7XG59XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50JztcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBO0FBRUE7QUFFQTtBQUVBO0FBQ0E7QUFDQTtBQUFtRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFbkQsTUFBTUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsZ0JBQWdCLENBQUM7QUFFdkMsTUFBTUMsaUNBQWlDLEdBQUcsT0FBTztBQUNqRCxNQUFNQyw4QkFBOEIsR0FBRyxPQUFPO0FBQzlDLE1BQU1DLDRCQUE0QixHQUFHLE9BQU87QUFDNUMsTUFBTUMsMEJBQTBCLEdBQUcsT0FBTztBQUMxQyxNQUFNQyxpQ0FBaUMsR0FBRyxPQUFPO0FBQ2pELE1BQU1DLE1BQU0sR0FBR04sT0FBTyxDQUFDLGlCQUFpQixDQUFDO0FBRXpDLE1BQU1PLEtBQUssR0FBRyxVQUFVLEdBQUdDLElBQVMsRUFBRTtFQUNwQ0EsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0MsTUFBTSxDQUFDRixJQUFJLENBQUNHLEtBQUssQ0FBQyxDQUFDLEVBQUVILElBQUksQ0FBQ0ksTUFBTSxDQUFDLENBQUM7RUFDakUsTUFBTUMsR0FBRyxHQUFHUCxNQUFNLENBQUNRLFNBQVMsRUFBRTtFQUM5QkQsR0FBRyxDQUFDTixLQUFLLENBQUNRLEtBQUssQ0FBQ0YsR0FBRyxFQUFFTCxJQUFJLENBQUM7QUFDNUIsQ0FBQztBQUVELE1BQU1RLHVCQUF1QixHQUFHQyxJQUFJLElBQUk7RUFDdEMsUUFBUUEsSUFBSSxDQUFDQSxJQUFJO0lBQ2YsS0FBSyxRQUFRO01BQ1gsT0FBTyxNQUFN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