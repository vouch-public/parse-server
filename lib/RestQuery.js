"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

var SchemaController = require('./Controllers/SchemaController');
var Parse = require('parse/node').Parse;
const triggers = require('./triggers');
const {
  continueWhile
} = require('parse/lib/node/promiseUtils');
const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference
function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK, runAfterFind = true, context) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.runAfterFind = runAfterFind;
  this.response = null;
  this.findOptions = {};
  this.context = context || {};
  if (!this.auth.isMaster) {
    if (this.className == '_Session') {
      if (!this.auth.user) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }
      this.restWhere = {
        $and: [this.restWhere, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  this.doCount = false;
  this.includeAll = false;

  // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
  this.include = [];
  let keysForInclude = '';

  // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185
  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  }

  // If we have keys, we probably want to force some includes (n-1 level)
  // in order to exclude specific keys.
  if (Object.prototype.hasOwnProperty.call(restOptions, 'excludeKeys')) {
    keysForInclude += ',' + restOptions.excludeKeys;
  }
  if (keysForInclude.length > 0) {
    keysForInclude = keysForInclude.split(',').filter(key => {
      // At least 2 components
      return key.split('.').length > 1;
    }).map(key => {
      // Slice the last component (a.b.c -> a.b)
      // Otherwise we'll include one level too much.
      return key.slice(0, key.lastIndexOf('.'));
    }).join(',');

    // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.
    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }
  for (var option in restOptions) {
    switch (option) {
      case 'keys':
        {
          const keys = restOptions.keys.split(',').filter(key => key.length > 0).concat(AlwaysSelectedKeys);
          this.keys = Array.from(new Set(keys));
          break;
        }
      case 'excludeKeys':
        {
          const exclude = restOptions.excludeKeys.split(',').filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
          this.excludeKeys = Array.from(new Set(exclude));
          break;
        }
      case 'count':
        this.doCount = true;
        break;
      case 'includeAll':
        this.includeAll = true;
        break;
      case 'explain':
      case 'hint':
      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
        this.findOptions[option] = restOptions[option];
        break;
      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();
          if (field === '$score' || field === '-$score') {
            sortMap.score = {
              $meta: 'textScore'
            };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }
          return sortMap;
        }, {});
        break;
      case 'include':
        {
          const paths = restOptions.include.split(',');
          if (paths.includes('*')) {
            this.includeAll = true;
            break;
          }
          // Load the existing includes (from keys)
          const pathSet = paths.reduce((memo, path) => {
            // Split each paths on . (a.b.c -> [a,b,c])
            // reduce to create all paths
            // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
            return path.split('.').reduce((memo, path, index, parts) => {
              memo[parts.slice(0, index + 1).join('.')] = true;
              return memo;
            }, memo);
          }, {});
          this.include = Object.keys(pathSet).map(s => {
            return s.split('.');
          }).sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });

          break;
        }
      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;
      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;
      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
    }
  }
}

// A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions
RestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.denyProtectedFields();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.handleExcludeKeys();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.runAfterFindTrigger();
  }).then(() => {
    return this.response;
  });
};
RestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this;
  // if the limit is set, use it
  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK, this.runAfterFind, this.context);
    const {
      results
    } = await query.execute();
    results.forEach(callback);
    finished = results.length < restOptions.limit;
    if (!finished) {
      restWhere.objectId = Object.assign({}, restWhere.objectId, {
        $gt: results[results.length - 1].objectId
      });
    }
  });
};
RestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.replaceSelect();
  }).then(() => {
    return this.replaceDontSelect();
  }).then(() => {
    return this.replaceInQuery();
  }).then(() => {
    return this.replaceNotInQuery();
  }).then(() => {
    return this.replaceEquality();
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestQuery.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }
  this.findOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Changes the className if redirectClassNameForKey is set.
// Returns a promise.
RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  }

  // We need to change the class name based on the schema
  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
};

// Validates this operation against the allowClientClassCreation config.
RestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};
function transformInQuery(inQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete inQueryObject['$inQuery'];
  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
}

// Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
  if (!inQueryObject) {
    return;
  }

  // The inQuery value must have precisely two keys - where and className
  var inQueryValue = inQueryObject['$inQuery'];
  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $inQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  var subquery = new RestQuery(this.config, this.auth, inQueryValue.className, inQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceInQuery();
  });
};
function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];
  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }
  delete notInQueryObject['$notInQuery'];
  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
}

// Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.
RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
  if (!notInQueryObject) {
    return;
  }

  // The notInQuery value must have precisely two keys - where and className
  var notInQueryValue = notInQueryObject['$notInQuery'];
  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
  }
  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  var subquery = new RestQuery(this.config, this.auth, notInQueryValue.className, notInQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results);
    // Recurse to repeat
    return this.replaceNotInQuery();
  });
};

// Used to get the deepest object from json using dot notation.
const getDeepestObjectFromKey = (json, key, idx, src) => {
  if (key in json) {
    return json[key];
  }
  src.splice(1); // Exit Early
};

const transformSelect = (selectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete selectObject['$select'];
  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
};

// Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');
  if (!selectObject) {
    return;
  }

  // The select value must have precisely two keys - query and key
  var selectValue = selectObject['$select'];
  // iOS SDK don't send where if not set, let it pass
  if (!selectValue.query || !selectValue.key || typeof selectValue.query !== 'object' || !selectValue.query.className || Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $select');
  }
  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  var subquery = new RestQuery(this.config, this.auth, selectValue.query.className, selectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results);
    // Keep replacing $select clauses
    return this.replaceSelect();
  });
};
const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];
  for (var result of objects) {
    values.push(key.split('.').reduce(getDeepestObjectFromKey, result));
  }
  delete dontSelectObject['$dontSelect'];
  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
};

// Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.
RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
  if (!dontSelectObject) {
    return;
  }

  // The dontSelect value must have precisely two keys - query and key
  var dontSelectValue = dontSelectObject['$dontSelect'];
  if (!dontSelectValue.query || !dontSelectValue.key || typeof dontSelectValue.query !== 'object' || !dontSelectValue.query.className || Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $dontSelect');
  }
  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };
  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }
  var subquery = new RestQuery(this.config, this.auth, dontSelectValue.query.className, dontSelectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results);
    // Keep replacing $dontSelect clauses
    return this.replaceDontSelect();
  });
};
const cleanResultAuthData = function (result) {
  delete result.password;
  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });
    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};
const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }
  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;
  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }
  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }
  return constraint;
};
RestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }
  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
};

// Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.
RestQuery.prototype.runFind = function (options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {
      results: []
    };
    return Promise.resolve();
  }
  const findOptions = Object.assign({}, this.findOptions);
  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }
  if (options.op) {
    findOptions.op = options.op;
  }
  return this.config.database.find(this.className, this.restWhere, findOptions, this.auth).then(results => {
    if (this.className === '_User' && !findOptions.explain) {
      for (var result of results) {
        cleanResultAuthData(result);
      }
    }
    this.config.filesController.expandFilesInObject(this.config, results);
    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }
    this.response = {
      results: results
    };
  });
};

// Returns a promise for whether it was successful.
// Populates this.response.count with the count
RestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }
  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
};
RestQuery.prototype.denyProtectedFields = async function () {
  if (this.auth.isMaster) {
    return;
  }
  const schemaController = await this.config.database.loadSchema();
  const protectedFields = this.config.database.addProtectedFields(schemaController, this.className, this.restWhere, this.findOptions.acl, this.auth, this.findOptions) || [];
  for (const key of protectedFields) {
    if (this.restWhere[key]) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `This user is not allowed to query ${key} on class ${this.className}`);
    }
  }
};

// Augments this.response with all pointers on an object
RestQuery.prototype.handleIncludeAll = function () {
  if (!this.includeAll) {
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const includeFields = [];
    const keyFields = [];
    for (const field in schema.fields) {
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer' || schema.fields[field].type && schema.fields[field].type === 'Array') {
        includeFields.push([field]);
        keyFields.push(field);
      }
    }
    // Add fields to include, keys, remove dups
    this.include = [...new Set([...this.include, ...includeFields])];
    // if this.keys not set, then all keys are already included
    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
};

// Updates property `this.keys` to contain all keys but the ones unselected.
RestQuery.prototype.handleExcludeKeys = function () {
  if (!this.excludeKeys) {
    return;
  }
  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }
  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const fields = Object.keys(schema.fields);
    this.keys = fields.filter(k => !this.excludeKeys.includes(k));
  });
};

// Augments this.response with data at the paths provided in this.include.
RestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }
  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.restOptions);
  if (pathResponse.then) {
    return pathResponse.then(newResponse => {
      this.response = newResponse;
      this.include = this.include.slice(1);
      return this.handleInclude();
    });
  } else if (this.include.length > 0) {
    this.include = this.include.slice(1);
    return this.handleInclude();
  }
  return pathResponse;
};

//Returns a promise of a processed set of results
RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }
  if (!this.runAfterFind) {
    return;
  }
  // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.
  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);
  if (!hasAfterFindHook) {
    return Promise.resolve();
  }
  // Skip Aggregate and Distinct Queries
  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }
  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json);
  // Run afterFind trigger and set the new results
  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config, parseQuery, this.context).then(results => {
    // Ensure we properly set the className back
    if (this.redirectClassName) {
      this.response.results = results.map(object => {
        if (object instanceof Parse.Object) {
          object = object.toJSON();
        }
        object.className = this.redirectClassName;
        return object;
      });
    } else {
      this.response.results = results;
    }
  });
};

// Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.
function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);
  if (pointers.length == 0) {
    return response;
  }
  const pointersHash = {};
  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }
    const className = pointer.className;
    // only include the good pointers
    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }
  const includeRestOptions = {};
  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }
  if (restOptions.excludeKeys) {
    const excludeKeys = new Set(restOptions.excludeKeys.split(','));
    const excludeKeySet = Array.from(excludeKeys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;
      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }
      if (i == keyPath.length - 1) {
        set.add(keyPath[i]);
      }
      return set;
    }, new Set());
    if (excludeKeySet.size > 0) {
      includeRestOptions.excludeKeys = Array.from(excludeKeySet).join(',');
    }
  }
  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference = restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }
  const queryPromises = Object.keys(pointersHash).map(className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;
    if (objectIds.length === 1) {
      where = {
        objectId: objectIds[0]
      };
    } else {
      where = {
        objectId: {
          $in: objectIds
        }
      };
    }
    var query = new RestQuery(config, auth, className, where, includeRestOptions);
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  });

  // Get the objects for all these object ids
  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;
        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }
        replace[obj.objectId] = obj;
      }
      return replace;
    }, {});
    var resp = {
      results: replacePointers(response.results, path, replace)
    };
    if (response.count) {
      resp.count = response.count;
    }
    return resp;
  });
}

// Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.
function findPointers(object, path) {
  if (object instanceof Array) {
    var answer = [];
    for (var x of object) {
      answer = answer.concat(findPointers(x, path));
    }
    return answer;
  }
  if (typeof object !== 'object' || !object) {
    return [];
  }
  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }
    return [];
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return [];
  }
  return findPointers(subobject, path.slice(1));
}

// Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.
function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object.map(obj => replacePointers(obj, path, replace)).filter(obj => typeof obj !== 'undefined');
  }
  if (typeof object !== 'object' || !object) {
    return object;
  }
  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }
    return object;
  }
  var subobject = object[path[0]];
  if (!subobject) {
    return object;
  }
  var newsub = replacePointers(subobject, path.slice(1), replace);
  var answer = {};
  for (var key in object) {
    if (key == path[0]) {
      answer[key] = newsub;
    } else {
      answer[key] = object[key];
    }
  }
  return answer;
}

// Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.
function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }
  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);
      if (answer) {
        return answer;
      }
    }
  }
  if (root && root[key]) {
    return root;
  }
  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);
    if (answer) {
      return answer;
    }
  }
}
module.exports = RestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsIlBhcnNlIiwidHJpZ2dlcnMiLCJjb250aW51ZVdoaWxlIiwiQWx3YXlzU2VsZWN0ZWRLZXlzIiwiUmVzdFF1ZXJ5IiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwiY2xpZW50U0RLIiwicnVuQWZ0ZXJGaW5kIiwiY29udGV4dCIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwia2V5c0ZvckluY2x1ZGUiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJrZXlzIiwiZXhjbHVkZUtleXMiLCJsZW5ndGgiLCJzcGxpdCIsImZpbHRlciIsImtleSIsIm1hcCIsInNsaWNlIiwibGFzdEluZGV4T2YiLCJqb2luIiwib3B0aW9uIiwiY29uY2F0IiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwiZXhjbHVkZSIsImsiLCJpbmRleE9mIiwiZmllbGRzIiwib3JkZXIiLCJzb3J0IiwicmVkdWNlIiwic29ydE1hcCIsImZpZWxkIiwidHJpbSIsInNjb3JlIiwiJG1ldGEiLCJwYXRocyIsImluY2x1ZGVzIiwicGF0aFNldCIsIm1lbW8iLCJwYXRoIiwiaW5kZXgiLCJwYXJ0cyIsInMiLCJhIiwiYiIsInJlZGlyZWN0S2V5IiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJyZWRpcmVjdENsYXNzTmFtZSIsIklOVkFMSURfSlNPTiIsImV4ZWN1dGUiLCJleGVjdXRlT3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImJ1aWxkUmVzdFdoZXJlIiwiZGVueVByb3RlY3RlZEZpZWxkcyIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwicHJvdGVjdGVkRmllbGRzIiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsImFsbCIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwiYW5zd2VyIiwieCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQW4gb2JqZWN0IHRoYXQgZW5jYXBzdWxhdGVzIGV2ZXJ5dGhpbmcgd2UgbmVlZCB0byBydW4gYSAnZmluZCdcbi8vIG9wZXJhdGlvbiwgZW5jb2RlZCBpbiB0aGUgUkVTVCBBUEkgZm9ybWF0LlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG5jb25zdCB7IGNvbnRpbnVlV2hpbGUgfSA9IHJlcXVpcmUoJ3BhcnNlL2xpYi9ub2RlL3Byb21pc2VVdGlscycpO1xuY29uc3QgQWx3YXlzU2VsZWN0ZWRLZXlzID0gWydvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0JywgJ0FDTCddO1xuLy8gcmVzdE9wdGlvbnMgY2FuIGluY2x1ZGU6XG4vLyAgIHNraXBcbi8vICAgbGltaXRcbi8vICAgb3JkZXJcbi8vICAgY291bnRcbi8vICAgaW5jbHVkZVxuLy8gICBrZXlzXG4vLyAgIGV4Y2x1ZGVLZXlzXG4vLyAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5XG4vLyAgIHJlYWRQcmVmZXJlbmNlXG4vLyAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZVxuLy8gICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlXG5mdW5jdGlvbiBSZXN0UXVlcnkoXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUgPSB7fSxcbiAgcmVzdE9wdGlvbnMgPSB7fSxcbiAgY2xpZW50U0RLLFxuICBydW5BZnRlckZpbmQgPSB0cnVlLFxuICBjb250ZXh0XG4pIHtcbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLnJlc3RXaGVyZSA9IHJlc3RXaGVyZTtcbiAgdGhpcy5yZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5ydW5BZnRlckZpbmQgPSBydW5BZnRlckZpbmQ7XG4gIHRoaXMucmVzcG9uc2UgPSBudWxsO1xuICB0aGlzLmZpbmRPcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG4gIGxldCBrZXlzRm9ySW5jbHVkZSA9ICcnO1xuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIFNlZSBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzMxODVcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2tleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5cztcbiAgfVxuXG4gIC8vIElmIHdlIGhhdmUga2V5cywgd2UgcHJvYmFibHkgd2FudCB0byBmb3JjZSBzb21lIGluY2x1ZGVzIChuLTEgbGV2ZWwpXG4gIC8vIGluIG9yZGVyIHRvIGV4Y2x1ZGUgc3BlY2lmaWMga2V5cy5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN0T3B0aW9ucywgJ2V4Y2x1ZGVLZXlzJykpIHtcbiAgICBrZXlzRm9ySW5jbHVkZSArPSAnLCcgKyByZXN0T3B0aW9ucy5leGNsdWRlS2V5cztcbiAgfVxuXG4gIGlmIChrZXlzRm9ySW5jbHVkZS5sZW5ndGggPiAwKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZVxuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGtleSA9PiBrZXkubGVuZ3RoID4gMClcbiAgICAgICAgICAuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHBsYWluJzpcbiAgICAgIGNhc2UgJ2hpbnQnOlxuICAgICAgY2FzZSAnZGlzdGluY3QnOlxuICAgICAgY2FzZSAncGlwZWxpbmUnOlxuICAgICAgY2FzZSAnc2tpcCc6XG4gICAgICBjYXNlICdsaW1pdCc6XG4gICAgICBjYXNlICdyZWFkUHJlZmVyZW5jZSc6XG4gICAgICAgIHRoaXMuZmluZE9wdGlvbnNbb3B0aW9uXSA9IHJlc3RPcHRpb25zW29wdGlvbl07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb3JkZXInOlxuICAgICAgICB2YXIgZmllbGRzID0gcmVzdE9wdGlvbnMub3JkZXIuc3BsaXQoJywnKTtcbiAgICAgICAgdGhpcy5maW5kT3B0aW9ucy5zb3J0ID0gZmllbGRzLnJlZHVjZSgoc29ydE1hcCwgZmllbGQpID0+IHtcbiAgICAgICAgICBmaWVsZCA9IGZpZWxkLnRyaW0oKTtcbiAgICAgICAgICBpZiAoZmllbGQgPT09ICckc2NvcmUnIHx8IGZpZWxkID09PSAnLSRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbnlQcm90ZWN0ZWRGaWVsZHMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0V2hlcmUsIHJlc3RPcHRpb25zLCBjbGllbnRTREsgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlZGlyZWN0S2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV2UgbmVlZCB0byBjaGFuZ2UgdGhlIGNsYXNzIG5hbWUgYmFzZWQgb24gdGhlIHNjaGVtYVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkodGhpcy5jbGFzc05hbWUsIHRoaXMucmVkaXJlY3RLZXkpXG4gICAgLnRoZW4obmV3Q2xhc3NOYW1lID0+IHtcbiAgICAgIHRoaXMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICB9KTtcbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShpblF1ZXJ5T2JqZWN0WyckaW4nXSkpIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IGluUXVlcnlPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJGluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJGluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRpblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlU2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckc2VsZWN0Jyk7XG4gIGlmICghc2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIHNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgc2VsZWN0VmFsdWUgPSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgLy8gaU9TIFNESyBkb24ndCBzZW5kIHdoZXJlIGlmIG5vdCBzZXQsIGxldCBpdCBwYXNzXG4gIGlmIChcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhc2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIHNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhzZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJHNlbGVjdCcpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IHNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRG9udFNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgY2xlYW5SZXN1bHRBdXRoRGF0YSA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkZpbmQgPSBmdW5jdGlvbiAob3B0aW9ucyA9IHt9KSB7XG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLmxpbWl0ID09PSAwKSB7XG4gICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogW10gfTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgY29uc3QgZmluZE9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmZpbmRPcHRpb25zKTtcbiAgaWYgKHRoaXMua2V5cykge1xuICAgIGZpbmRPcHRpb25zLmtleXMgPSB0aGlzLmtleXMubWFwKGtleSA9PiB7XG4gICAgICByZXR1cm4ga2V5LnNwbGl0KCcuJylbMF07XG4gICAgfSk7XG4gIH1cbiAgaWYgKG9wdGlvbnMub3ApIHtcbiAgICBmaW5kT3B0aW9ucy5vcCA9IG9wdGlvbnMub3A7XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCBmaW5kT3B0aW9ucywgdGhpcy5hdXRoKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmICFmaW5kT3B0aW9ucy5leHBsYWluKSB7XG4gICAgICAgIGZvciAodmFyIHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgY2xlYW5SZXN1bHRBdXRoRGF0YShyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCByZXN1bHRzKTtcblxuICAgICAgaWYgKHRoaXMucmVkaXJlY3RDbGFzc05hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgciBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgci5jbGFzc05hbWUgPSB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3BvbnNlID0geyByZXN1bHRzOiByZXN1bHRzIH07XG4gICAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hldGhlciBpdCB3YXMgc3VjY2Vzc2Z1bC5cbi8vIFBvcHVsYXRlcyB0aGlzLnJlc3BvbnNlLmNvdW50IHdpdGggdGhlIGNvdW50XG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkNvdW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucykudGhlbihjID0+IHtcbiAgICB0aGlzLnJlc3BvbnNlLmNvdW50ID0gYztcbiAgfSk7XG59O1xuXG5SZXN0UXVlcnkucHJvdG90eXBlLmRlbnlQcm90ZWN0ZWRGaWVsZHMgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc2NoZW1hQ29udHJvbGxlciA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKTtcbiAgY29uc3QgcHJvdGVjdGVkRmllbGRzID1cbiAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5hZGRQcm90ZWN0ZWRGaWVsZHMoXG4gICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgIHRoaXMuZmluZE9wdGlvbnMuYWNsLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5maW5kT3B0aW9uc1xuICAgICkgfHwgW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgIGlmICh0aGlzLnJlc3RXaGVyZVtrZXldKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gcXVlcnkgJHtrZXl9IG9uIGNsYXNzICR7dGhpcy5jbGFzc05hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0ga2V5UGF0aC5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGV4Y2x1ZGVLZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20oZXhjbHVkZUtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmIChyZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgY29uc3QgcXVlcnlQcm9taXNlcyA9IE9iamVjdC5rZXlzKHBvaW50ZXJzSGFzaCkubWFwKGNsYXNzTmFtZSA9PiB7XG4gICAgY29uc3Qgb2JqZWN0SWRzID0gQXJyYXkuZnJvbShwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSk7XG4gICAgbGV0IHdoZXJlO1xuICAgIGlmIChvYmplY3RJZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IG9iamVjdElkc1swXSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICB3aGVyZSA9IHsgb2JqZWN0SWQ6IHsgJGluOiBvYmplY3RJZHMgfSB9O1xuICAgIH1cbiAgICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCB3aGVyZSwgaW5jbHVkZVJlc3RPcHRpb25zKTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSh7IG9wOiAnZ2V0JyB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdHMpO1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBHZXQgdGhlIG9iamVjdHMgZm9yIGFsbCB0aGVzZSBvYmplY3QgaWRzXG4gIHJldHVybiBQcm9taXNlLmFsbChxdWVyeVByb21pc2VzKS50aGVuKHJlc3BvbnNlcyA9PiB7XG4gICAgdmFyIHJlcGxhY2UgPSByZXNwb25zZXMucmVkdWNlKChyZXBsYWNlLCBpbmNsdWRlUmVzcG9uc2UpID0+IHtcbiAgICAgIGZvciAodmFyIG9iaiBvZiBpbmNsdWRlUmVzcG9uc2UucmVzdWx0cykge1xuICAgICAgICBvYmouX190eXBlID0gJ09iamVjdCc7XG4gICAgICAgIG9iai5jbGFzc05hbWUgPSBpbmNsdWRlUmVzcG9uc2UuY2xhc3NOYW1lO1xuXG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lID09ICdfVXNlcicgJiYgIWF1dGguaXNNYXN0ZXIpIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgICBkZWxldGUgb2JqLmF1dGhEYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJlcGxhY2Vbb2JqLm9iamVjdElkXSA9IG9iajtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXBsYWNlO1xuICAgIH0sIHt9KTtcblxuICAgIHZhciByZXNwID0ge1xuICAgICAgcmVzdWx0czogcmVwbGFjZVBvaW50ZXJzKHJlc3BvbnNlLnJlc3VsdHMsIHBhdGgsIHJlcGxhY2UpLFxuICAgIH07XG4gICAgaWYgKHJlc3BvbnNlLmNvdW50KSB7XG4gICAgICByZXNwLmNvdW50ID0gcmVzcG9uc2UuY291bnQ7XG4gICAgfVxuICAgIHJldHVybiByZXNwO1xuICB9KTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGZpbmQgcG9pbnRlcnMgaW4sIG9yXG4vLyBpdCBtYXkgYmUgYSBzaW5nbGUgb2JqZWN0LlxuLy8gSWYgdGhlIHBhdGggeWllbGRzIHRoaW5ncyB0aGF0IGFyZW4ndCBwb2ludGVycywgdGhpcyB0aHJvd3MgYW4gZXJyb3IuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyBSZXR1cm5zIGEgbGlzdCBvZiBwb2ludGVycyBpbiBSRVNUIGZvcm1hdC5cbmZ1bmN0aW9uIGZpbmRQb2ludGVycyhvYmplY3QsIHBhdGgpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFyIGFuc3dlciA9IFtdO1xuICAgIGZvciAodmFyIHggb2Ygb2JqZWN0KSB7XG4gICAgICBhbnN3ZXIgPSBhbnN3ZXIuY29uY2F0KGZpbmRQb2ludGVycyh4LCBwYXRoKSk7XG4gICAgfVxuICAgIHJldHVybiBhbnN3ZXI7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGlmIChwYXRoLmxlbmd0aCA9PSAwKSB7XG4gICAgaWYgKG9iamVjdCA9PT0gbnVsbCB8fCBvYmplY3QuX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIFtvYmplY3RdO1xuICAgIH1cbiAgICByZXR1cm4gW107XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gZmluZFBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSk7XG59XG5cbi8vIE9iamVjdCBtYXkgYmUgYSBsaXN0IG9mIFJFU1QtZm9ybWF0IG9iamVjdHMgdG8gcmVwbGFjZSBwb2ludGVyc1xuLy8gaW4sIG9yIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZHMgdG8gc2VhcmNoIGludG8uXG4vLyByZXBsYWNlIGlzIGEgbWFwIGZyb20gb2JqZWN0IGlkIC0+IG9iamVjdC5cbi8vIFJldHVybnMgc29tZXRoaW5nIGFuYWxvZ291cyB0byBvYmplY3QsIGJ1dCB3aXRoIHRoZSBhcHByb3ByaWF0ZVxuLy8gcG9pbnRlcnMgaW5mbGF0ZWQuXG5mdW5jdGlvbiByZXBsYWNlUG9pbnRlcnMob2JqZWN0LCBwYXRoLCByZXBsYWNlKSB7XG4gIGlmIChvYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBvYmplY3RcbiAgICAgIC5tYXAob2JqID0+IHJlcGxhY2VQb2ludGVycyhvYmosIHBhdGgsIHJlcGxhY2UpKVxuICAgICAgLmZpbHRlcihvYmogPT4gdHlwZW9mIG9iaiAhPT0gJ3VuZGVmaW5lZCcpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKG9iamVjdCAmJiBvYmplY3QuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIHJldHVybiByZXBsYWNlW29iamVjdC5vYmplY3RJZF07XG4gICAgfVxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICB2YXIgc3Vib2JqZWN0ID0gb2JqZWN0W3BhdGhbMF1dO1xuICBpZiAoIXN1Ym9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgdmFyIG5ld3N1YiA9IHJlcGxhY2VQb2ludGVycyhzdWJvYmplY3QsIHBhdGguc2xpY2UoMSksIHJlcGxhY2UpO1xuICB2YXIgYW5zd2VyID0ge307XG4gIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoa2V5ID09IHBhdGhbMF0pIHtcbiAgICAgIGFuc3dlcltrZXldID0gbmV3c3ViO1xuICAgIH0gZWxzZSB7XG4gICAgICBhbnN3ZXJba2V5XSA9IG9iamVjdFtrZXldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBGaW5kcyBhIHN1Ym9iamVjdCB0aGF0IGhhcyB0aGUgZ2l2ZW4ga2V5LCBpZiB0aGVyZSBpcyBvbmUuXG4vLyBSZXR1cm5zIHVuZGVmaW5lZCBvdGhlcndpc2UuXG5mdW5jdGlvbiBmaW5kT2JqZWN0V2l0aEtleShyb290LCBrZXkpIHtcbiAgaWYgKHR5cGVvZiByb290ICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm9vdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgZm9yICh2YXIgaXRlbSBvZiByb290KSB7XG4gICAgICBjb25zdCBhbnN3ZXIgPSBmaW5kT2JqZWN0V2l0aEtleShpdGVtLCBrZXkpO1xuICAgICAgaWYgKGFuc3dlcikge1xuICAgICAgICByZXR1cm4gYW5zd2VyO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAocm9vdCAmJiByb290W2tleV0pIHtcbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuICBmb3IgKHZhciBzdWJrZXkgaW4gcm9vdCkge1xuICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KHJvb3Rbc3Via2V5XSwga2V5KTtcbiAgICBpZiAoYW5zd2VyKSB7XG4gICAgICByZXR1cm4gYW5zd2VyO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RRdWVyeTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBOztBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQWdDLENBQUM7QUFDaEUsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUNDLEtBQUs7QUFDdkMsTUFBTUMsUUFBUSxHQUFHRixPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ3RDLE1BQU07RUFBRUc7QUFBYyxDQUFDLEdBQUdILE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQztBQUNoRSxNQUFNSSxrQkFBa0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQztBQUN4RTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTQyxTQUFTLENBQ2hCQyxNQUFNLEVBQ05DLElBQUksRUFDSkMsU0FBUyxFQUNUQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLEVBQ2RDLFdBQVcsR0FBRyxDQUFDLENBQUMsRUFDaEJDLFNBQVMsRUFDVEMsWUFBWSxHQUFHLElBQUksRUFDbkJDLE9BQU8sRUFDUDtFQUNBLElBQUksQ0FBQ1AsTUFBTSxHQUFHQSxNQUFNO0VBQ3BCLElBQUksQ0FBQ0MsSUFBSSxHQUFHQSxJQUFJO0VBQ2hCLElBQUksQ0FBQ0MsU0FBUyxHQUFHQSxTQUFTO0VBQzFCLElBQUksQ0FBQ0MsU0FBUyxHQUFHQSxTQUFTO0VBQzFCLElBQUksQ0FBQ0MsV0FBVyxHQUFHQSxXQUFXO0VBQzlCLElBQUksQ0FBQ0MsU0FBUyxHQUFH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