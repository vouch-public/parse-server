"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.
var SchemaController = require('./Controllers/SchemaController');

var Parse = require('parse/node').Parse;

const triggers = require('./triggers');

const {
  continueWhile
} = require('parse/lib/node/promiseUtils');

const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL']; // restOptions can include:
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
  this.includeAll = false; // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]

  this.include = [];
  let keysForInclude = ''; // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185

  if (Object.prototype.hasOwnProperty.call(restOptions, 'keys')) {
    keysForInclude = restOptions.keys;
  } // If we have keys, we probably want to force some includes (n-1 level)
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
    }).join(','); // Concat the possibly present include string with the one from the keys
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

          if (field === '$score') {
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
          } // Load the existing includes (from keys)


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
} // A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions


RestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
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
  } = this; // if the limit is set, use it

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
}; // Uses the Auth object to get the list of roles, adds the user id


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
}; // Changes the className if redirectClassNameForKey is set.
// Returns a promise.


RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  } // We need to change the class name based on the schema


  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
}; // Validates this operation against the allowClientClassCreation config.


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
} // Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');

  if (!inQueryObject) {
    return;
  } // The inQuery value must have precisely two keys - where and className


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
    transformInQuery(inQueryObject, subquery.className, response.results); // Recurse to repeat

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
} // Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');

  if (!notInQueryObject) {
    return;
  } // The notInQuery value must have precisely two keys - where and className


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
    transformNotInQuery(notInQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceNotInQuery();
  });
}; // Used to get the deepest object from json using dot notation.


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
}; // Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');

  if (!selectObject) {
    return;
  } // The select value must have precisely two keys - query and key


  var selectValue = selectObject['$select']; // iOS SDK don't send where if not set, let it pass

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
    transformSelect(selectObject, selectValue.key, response.results); // Keep replacing $select clauses

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
}; // Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');

  if (!dontSelectObject) {
    return;
  } // The dontSelect value must have precisely two keys - query and key


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
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results); // Keep replacing $dontSelect clauses

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
}; // Returns a promise for whether it was successful.
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
    if (this.className === '_User' && findOptions.explain !== true) {
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
}; // Returns a promise for whether it was successful.
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
}; // Augments this.response with all pointers on an object


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
    } // Add fields to include, keys, remove dups


    this.include = [...new Set([...this.include, ...includeFields])]; // if this.keys not set, then all keys are already included

    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
}; // Updates property `this.keys` to contain all keys but the ones unselected.


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
}; // Augments this.response with data at the paths provided in this.include.


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
}; //Returns a promise of a processed set of results


RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  }

  if (!this.runAfterFind) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.


  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);

  if (!hasAfterFindHook) {
    return Promise.resolve();
  } // Skip Aggregate and Distinct Queries


  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  }

  const json = Object.assign({}, this.restOptions);
  json.where = this.restWhere;
  const parseQuery = new Parse.Query(this.className);
  parseQuery.withJSON(json); // Run afterFind trigger and set the new results

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
}; // Adds included values to the response.
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

    const className = pointer.className; // only include the good pointers

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
  }); // Get the objects for all these object ids

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
} // Object may be a list of REST-format object to find pointers in, or
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
} // Object may be a list of REST-format objects to replace pointers
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
} // Finds a subobject that has the given key, if there is one.
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJ1bkFmdGVyRmluZCIsImNvbnRleHQiLCJyZXNwb25zZSIsImZpbmRPcHRpb25zIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCIkYW5kIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImRvQ291bnQiLCJpbmNsdWRlQWxsIiwiaW5jbHVkZSIsImtleXNGb3JJbmNsdWRlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwia2V5cyIsImV4Y2x1ZGVLZXlzIiwibGVuZ3RoIiwic3BsaXQiLCJmaWx0ZXIiLCJrZXkiLCJtYXAiLCJzbGljZSIsImxhc3RJbmRleE9mIiwiam9pbiIsIm9wdGlvbiIsImNvbmNhdCIsIkFycmF5IiwiZnJvbSIsIlNldCIsImV4Y2x1ZGUiLCJrIiwiaW5kZXhPZiIsImZpZWxkcyIsIm9yZGVyIiwic29ydCIsInJlZHVjZSIsInNvcnRNYXAiLCJmaWVsZCIsInRyaW0iLCJzY29yZSIsIiRtZXRhIiwicGF0aHMiLCJpbmNsdWRlcyIsInBhdGhTZXQiLCJtZW1vIiwicGF0aCIsImluZGV4IiwicGFydHMiLCJzIiwiYSIsImIiLCJyZWRpcmVjdEtleSIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwicmVkaXJlY3RDbGFzc05hbWUiLCJJTlZBTElEX0pTT04iLCJleGVjdXRlIiwiZXhlY3V0ZU9wdGlvbnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJidWlsZFJlc3RXaGVyZSIsImhhbmRsZUluY2x1ZGVBbGwiLCJoYW5kbGVFeGNsdWRlS2V5cyIsInJ1bkZpbmQiLCJydW5Db3VudCIsImhhbmRsZUluY2x1ZGUiLCJydW5BZnRlckZpbmRUcmlnZ2VyIiwiZWFjaCIsImNhbGxiYWNrIiwibGltaXQiLCJmaW5pc2hlZCIsInF1ZXJ5IiwicmVzdWx0cyIsImZvckVhY2giLCJhc3NpZ24iLCIkZ3QiLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsInJlcGxhY2VTZWxlY3QiLCJyZXBsYWNlRG9udFNlbGVjdCIsInJlcGxhY2VJblF1ZXJ5IiwicmVwbGFjZU5vdEluUXVlcnkiLCJyZXBsYWNlRXF1YWxpdHkiLCJhY2wiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImRhdGFiYXNlIiwibmV3Q2xhc3NOYW1lIiwiYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwic3lzdGVtQ2xhc3NlcyIsImxvYWRTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwiaGFzQ2xhc3MiLCJPUEVSQVRJT05fRk9SQklEREVOIiwidHJhbnNmb3JtSW5RdWVyeSIsImluUXVlcnlPYmplY3QiLCJ2YWx1ZXMiLCJyZXN1bHQiLCJwdXNoIiwiaXNBcnJheSIsImZpbmRPYmplY3RXaXRoS2V5IiwiaW5RdWVyeVZhbHVlIiwid2hlcmUiLCJJTlZBTElEX1FVRVJZIiwiYWRkaXRpb25hbE9wdGlvbnMiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwicmVhZFByZWZlcmVuY2UiLCJzdWJxdWVyeSIsInRyYW5zZm9ybU5vdEluUXVlcnkiLCJub3RJblF1ZXJ5T2JqZWN0Iiwibm90SW5RdWVyeVZhbHVlIiwiZ2V0RGVlcGVzdE9iamVjdEZyb21LZXkiLCJqc29uIiwiaWR4Iiwic3JjIiwic3BsaWNlIiwidHJhbnNmb3JtU2VsZWN0Iiwic2VsZWN0T2JqZWN0Iiwib2JqZWN0cyIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJleHBsYWluIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsInIiLCJjb3VudCIsInNraXAiLCJjIiwiZ2V0T25lU2NoZW1hIiwic2NoZW1hIiwiaW5jbHVkZUZpZWxkcyIsImtleUZpZWxkcyIsInR5cGUiLCJwYXRoUmVzcG9uc2UiLCJpbmNsdWRlUGF0aCIsIm5ld1Jlc3BvbnNlIiwiaGFzQWZ0ZXJGaW5kSG9vayIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImFmdGVyRmluZCIsImFwcGxpY2F0aW9uSWQiLCJwaXBlbGluZSIsImRpc3RpbmN0IiwicGFyc2VRdWVyeSIsIlF1ZXJ5Iiwid2l0aEpTT04iLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwiaSIsInNpemUiLCJleGNsdWRlS2V5U2V0IiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwicXVlcnlQcm9taXNlcyIsIm9iamVjdElkcyIsIiRpbiIsImFsbCIsInJlc3BvbnNlcyIsInJlcGxhY2UiLCJpbmNsdWRlUmVzcG9uc2UiLCJvYmoiLCJzZXNzaW9uVG9rZW4iLCJyZXNwIiwicmVwbGFjZVBvaW50ZXJzIiwiYW5zd2VyIiwieCIsInN1Ym9iamVjdCIsIm5ld3N1YiIsInJvb3QiLCJpdGVtIiwic3Via2V5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFB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RE8sTUFBTSxDQUFDQyxPQUFQLEdBQWlCaE4sU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHsgY29udGludWVXaGlsZSB9ID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvcHJvbWlzZVV0aWxzJyk7XG5jb25zdCBBbHdheXNTZWxlY3RlZEtleXMgPSBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnLCAnQUNMJ107XG4vLyByZXN0T3B0aW9ucyBjYW4gaW5jbHVkZTpcbi8vICAgc2tpcFxuLy8gICBsaW1pdFxuLy8gICBvcmRlclxuLy8gICBjb3VudFxuLy8gICBpbmNsdWRlXG4vLyAgIGtleXNcbi8vICAgZXhjbHVkZUtleXNcbi8vICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXlcbi8vICAgcmVhZFByZWZlcmVuY2Vcbi8vICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlXG4vLyAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2VcbmZ1bmN0aW9uIFJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREssXG4gIHJ1bkFmdGVyRmluZCA9IHRydWUsXG4gIGNvbnRleHRcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJ1bkFmdGVyRmluZCA9IHJ1bkFmdGVyRmluZDtcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG4gIHRoaXMuZmluZE9wdGlvbnMgPSB7fTtcbiAgdGhpcy5jb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT0gJ19TZXNzaW9uJykge1xuICAgICAgaWYgKCF0aGlzLmF1dGgudXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICB9XG4gICAgICB0aGlzLnJlc3RXaGVyZSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucmVzdFdoZXJlLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICB0aGlzLmRvQ291bnQgPSBmYWxzZTtcbiAgdGhpcy5pbmNsdWRlQWxsID0gZmFsc2U7XG5cbiAgLy8gVGhlIGZvcm1hdCBmb3IgdGhpcy5pbmNsdWRlIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgZm9ybWF0IGZvciB0aGVcbiAgLy8gaW5jbHVkZSBvcHRpb24gLSBpdCdzIHRoZSBwYXRocyB3ZSBzaG91bGQgaW5jbHVkZSwgaW4gb3JkZXIsXG4gIC8vIHN0b3JlZCBhcyBhcnJheXMsIHRha2luZyBpbnRvIGFjY291bnQgdGhhdCB3ZSBuZWVkIHRvIGluY2x1ZGUgZm9vXG4gIC8vIGJlZm9yZSBpbmNsdWRpbmcgZm9vLmJhci4gQWxzbyBpdCBzaG91bGQgZGVkdXBlLlxuICAvLyBGb3IgZXhhbXBsZSwgcGFzc2luZyBhbiBhcmcgb2YgaW5jbHVkZT1mb28uYmFyLGZvby5iYXogY291bGQgbGVhZCB0b1xuICAvLyB0aGlzLmluY2x1ZGUgPSBbWydmb28nXSwgWydmb28nLCAnYmF6J10sIFsnZm9vJywgJ2JhciddXVxuICB0aGlzLmluY2x1ZGUgPSBbXTtcbiAgbGV0IGtleXNGb3JJbmNsdWRlID0gJyc7XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAna2V5cycpKSB7XG4gICAga2V5c0ZvckluY2x1ZGUgPSByZXN0T3B0aW9ucy5rZXlzO1xuICB9XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gaW4gb3JkZXIgdG8gZXhjbHVkZSBzcGVjaWZpYyBrZXlzLlxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3RPcHRpb25zLCAnZXhjbHVkZUtleXMnKSkge1xuICAgIGtleXNGb3JJbmNsdWRlICs9ICcsJyArIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzO1xuICB9XG5cbiAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICBrZXlzRm9ySW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlXG4gICAgICAuc3BsaXQoJywnKVxuICAgICAgLmZpbHRlcihrZXkgPT4ge1xuICAgICAgICAvLyBBdCBsZWFzdCAyIGNvbXBvbmVudHNcbiAgICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpLmxlbmd0aCA+IDE7XG4gICAgICB9KVxuICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAvLyBTbGljZSB0aGUgbGFzdCBjb21wb25lbnQgKGEuYi5jIC0+IGEuYilcbiAgICAgICAgLy8gT3RoZXJ3aXNlIHdlJ2xsIGluY2x1ZGUgb25lIGxldmVsIHRvbyBtdWNoLlxuICAgICAgICByZXR1cm4ga2V5LnNsaWNlKDAsIGtleS5sYXN0SW5kZXhPZignLicpKTtcbiAgICAgIH0pXG4gICAgICAuam9pbignLCcpO1xuXG4gICAgLy8gQ29uY2F0IHRoZSBwb3NzaWJseSBwcmVzZW50IGluY2x1ZGUgc3RyaW5nIHdpdGggdGhlIG9uZSBmcm9tIHRoZSBrZXlzXG4gICAgLy8gRGVkdXAgLyBzb3J0aW5nIGlzIGhhbmRsZSBpbiAnaW5jbHVkZScgY2FzZS5cbiAgICBpZiAoa2V5c0ZvckluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKCFyZXN0T3B0aW9ucy5pbmNsdWRlIHx8IHJlc3RPcHRpb25zLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGtleXNGb3JJbmNsdWRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSArPSAnLCcgKyBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmb3IgKHZhciBvcHRpb24gaW4gcmVzdE9wdGlvbnMpIHtcbiAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgY2FzZSAna2V5cyc6IHtcbiAgICAgICAgY29uc3Qga2V5cyA9IHJlc3RPcHRpb25zLmtleXNcbiAgICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5jb25jYXQoQWx3YXlzU2VsZWN0ZWRLZXlzKTtcbiAgICAgICAgdGhpcy5rZXlzID0gQXJyYXkuZnJvbShuZXcgU2V0KGtleXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdleGNsdWRlS2V5cyc6IHtcbiAgICAgICAgY29uc3QgZXhjbHVkZSA9IHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzXG4gICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAuZmlsdGVyKGsgPT4gQWx3YXlzU2VsZWN0ZWRLZXlzLmluZGV4T2YoaykgPCAwKTtcbiAgICAgICAgdGhpcy5leGNsdWRlS2V5cyA9IEFycmF5LmZyb20obmV3IFNldChleGNsdWRlKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnY291bnQnOlxuICAgICAgICB0aGlzLmRvQ291bnQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2luY2x1ZGVBbGwnOlxuICAgICAgICB0aGlzLmluY2x1ZGVBbGwgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4cGxhaW4nOlxuICAgICAgY2FzZSAnaGludCc6XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgb3B0aW9uOiAnICsgb3B0aW9uKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoZXhlY3V0ZU9wdGlvbnMpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYnVpbGRSZXN0V2hlcmUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGVBbGwoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUV4Y2x1ZGVLZXlzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5GaW5kKGV4ZWN1dGVPcHRpb25zKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkNvdW50KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlckZpbmRUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuZWFjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCByZXN0V2hlcmUsIHJlc3RPcHRpb25zLCBjbGllbnRTREsgfSA9IHRoaXM7XG4gIC8vIGlmIHRoZSBsaW1pdCBpcyBzZXQsIHVzZSBpdFxuICByZXN0T3B0aW9ucy5saW1pdCA9IHJlc3RPcHRpb25zLmxpbWl0IHx8IDEwMDtcbiAgcmVzdE9wdGlvbnMub3JkZXIgPSAnb2JqZWN0SWQnO1xuICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcblxuICByZXR1cm4gY29udGludWVXaGlsZShcbiAgICAoKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbmlzaGVkO1xuICAgIH0sXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgY2xpZW50U0RLLFxuICAgICAgICB0aGlzLnJ1bkFmdGVyRmluZCxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICByZXN1bHRzLmZvckVhY2goY2FsbGJhY2spO1xuICAgICAgZmluaXNoZWQgPSByZXN1bHRzLmxlbmd0aCA8IHJlc3RPcHRpb25zLmxpbWl0O1xuICAgICAgaWYgKCFmaW5pc2hlZCkge1xuICAgICAgICByZXN0V2hlcmUub2JqZWN0SWQgPSBPYmplY3QuYXNzaWduKHt9LCByZXN0V2hlcmUub2JqZWN0SWQsIHtcbiAgICAgICAgICAkZ3Q6IHJlc3VsdHNbcmVzdWx0cy5sZW5ndGggLSAxXS5vYmplY3RJZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICApO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5idWlsZFJlc3RXaGVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5maW5kT3B0aW9ucy5hY2wgPSB0aGlzLmZpbmRPcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlZGlyZWN0S2V5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gV2UgbmVlZCB0byBjaGFuZ2UgdGhlIGNsYXNzIG5hbWUgYmFzZWQgb24gdGhlIHNjaGVtYVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAucmVkaXJlY3RDbGFzc05hbWVGb3JLZXkodGhpcy5jbGFzc05hbWUsIHRoaXMucmVkaXJlY3RLZXkpXG4gICAgLnRoZW4obmV3Q2xhc3NOYW1lID0+IHtcbiAgICAgIHRoaXMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcbiAgICB9KTtcbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5RdWVyeShpblF1ZXJ5T2JqZWN0LCBjbGFzc05hbWUsIHJlc3VsdHMpIHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICBvYmplY3RJZDogcmVzdWx0Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGRlbGV0ZSBpblF1ZXJ5T2JqZWN0WyckaW5RdWVyeSddO1xuICBpZiAoQXJyYXkuaXNBcnJheShpblF1ZXJ5T2JqZWN0WyckaW4nXSkpIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IGluUXVlcnlPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIGluUXVlcnlPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59XG5cbi8vIFJlcGxhY2VzIGEgJGluUXVlcnkgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhblxuLy8gJGluUXVlcnkgY2xhdXNlLlxuLy8gVGhlICRpblF1ZXJ5IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyB0aGF0IGFyZSBqdXN0XG4vLyBwb2ludGVycyB0byB0aGUgb2JqZWN0cyByZXR1cm5lZCBpbiB0aGUgc3VicXVlcnkuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VJblF1ZXJ5ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeScpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3RJblF1ZXJ5T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckbm90SW5RdWVyeScpO1xuICBpZiAoIW5vdEluUXVlcnlPYmplY3QpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUaGUgbm90SW5RdWVyeSB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gd2hlcmUgYW5kIGNsYXNzTmFtZVxuICB2YXIgbm90SW5RdWVyeVZhbHVlID0gbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKCFub3RJblF1ZXJ5VmFsdWUud2hlcmUgfHwgIW5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ2ltcHJvcGVyIHVzYWdlIG9mICRub3RJblF1ZXJ5Jyk7XG4gIH1cblxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogbm90SW5RdWVyeVZhbHVlLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBub3RJblF1ZXJ5VmFsdWUuY2xhc3NOYW1lLFxuICAgIG5vdEluUXVlcnlWYWx1ZS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgc3VicXVlcnkuY2xhc3NOYW1lLCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBSZWN1cnNlIHRvIHJlcGVhdFxuICAgIHJldHVybiB0aGlzLnJlcGxhY2VOb3RJblF1ZXJ5KCk7XG4gIH0pO1xufTtcblxuLy8gVXNlZCB0byBnZXQgdGhlIGRlZXBlc3Qgb2JqZWN0IGZyb20ganNvbiB1c2luZyBkb3Qgbm90YXRpb24uXG5jb25zdCBnZXREZWVwZXN0T2JqZWN0RnJvbUtleSA9IChqc29uLCBrZXksIGlkeCwgc3JjKSA9PiB7XG4gIGlmIChrZXkgaW4ganNvbikge1xuICAgIHJldHVybiBqc29uW2tleV07XG4gIH1cbiAgc3JjLnNwbGljZSgxKTsgLy8gRXhpdCBFYXJseVxufTtcblxuY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gKHNlbGVjdE9iamVjdCwga2V5LCBvYmplY3RzKSA9PiB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIG9iamVjdHMpIHtcbiAgICB2YWx1ZXMucHVzaChrZXkuc3BsaXQoJy4nKS5yZWR1Y2UoZ2V0RGVlcGVzdE9iamVjdEZyb21LZXksIHJlc3VsdCkpO1xuICB9XG4gIGRlbGV0ZSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0T2JqZWN0WyckaW4nXSkpIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gc2VsZWN0T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RPYmplY3RbJyRpbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRzZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkc2VsZWN0IGNsYXVzZS5cbi8vIFRoZSAkc2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRpbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlU2VsZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZWN0T2JqZWN0ID0gZmluZE9iamVjdFdpdGhLZXkodGhpcy5yZXN0V2hlcmUsICckc2VsZWN0Jyk7XG4gIGlmICghc2VsZWN0T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIHNlbGVjdCB2YWx1ZSBtdXN0IGhhdmUgcHJlY2lzZWx5IHR3byBrZXlzIC0gcXVlcnkgYW5kIGtleVxuICB2YXIgc2VsZWN0VmFsdWUgPSBzZWxlY3RPYmplY3RbJyRzZWxlY3QnXTtcbiAgLy8gaU9TIFNESyBkb24ndCBzZW5kIHdoZXJlIGlmIG5vdCBzZXQsIGxldCBpdCBwYXNzXG4gIGlmIChcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkgfHxcbiAgICAhc2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIHNlbGVjdFZhbHVlLnF1ZXJ5ICE9PSAnb2JqZWN0JyB8fFxuICAgICFzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUgfHxcbiAgICBPYmplY3Qua2V5cyhzZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJHNlbGVjdCcpO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IHNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBzZWxlY3RWYWx1ZS5xdWVyeS5jbGFzc05hbWUsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1TZWxlY3Qoc2VsZWN0T2JqZWN0LCBzZWxlY3RWYWx1ZS5rZXksIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRzZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb250U2VsZWN0ID0gKGRvbnRTZWxlY3RPYmplY3QsIGtleSwgb2JqZWN0cykgPT4ge1xuICB2YXIgdmFsdWVzID0gW107XG4gIGZvciAodmFyIHJlc3VsdCBvZiBvYmplY3RzKSB7XG4gICAgdmFsdWVzLnB1c2goa2V5LnNwbGl0KCcuJykucmVkdWNlKGdldERlZXBlc3RPYmplY3RGcm9tS2V5LCByZXN1bHQpKTtcbiAgfVxuICBkZWxldGUgZG9udFNlbGVjdE9iamVjdFsnJGRvbnRTZWxlY3QnXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZG9udFNlbGVjdE9iamVjdFsnJG5pbiddKSkge1xuICAgIGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSA9IGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJGRvbnRTZWxlY3QgY2xhdXNlIGJ5IHJ1bm5pbmcgdGhlIHN1YnF1ZXJ5LCBpZiB0aGVyZSBpcyBhXG4vLyAkZG9udFNlbGVjdCBjbGF1c2UuXG4vLyBUaGUgJGRvbnRTZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJG5pbiB3aXRoIHZhbHVlcyBzZWxlY3RlZCBvdXQgb2Zcbi8vIHRoZSBzdWJxdWVyeS5cbi8vIFJldHVybnMgYSBwb3NzaWJsZS1wcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRG9udFNlbGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoZG9udFNlbGVjdE9iamVjdCwgZG9udFNlbGVjdFZhbHVlLmtleSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gS2VlcCByZXBsYWNpbmcgJGRvbnRTZWxlY3QgY2xhdXNlc1xuICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgY2xlYW5SZXN1bHRBdXRoRGF0YSA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgdGhpcy5yZXN0V2hlcmUgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucmVzdFdoZXJlKSB7XG4gICAgdGhpcy5yZXN0V2hlcmVba2V5XSA9IHJlcGxhY2VFcXVhbGl0eUNvbnN0cmFpbnQodGhpcy5yZXN0V2hlcmVba2V5XSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbiBvYmplY3QgdGhhdCBvbmx5IGhhcyAncmVzdWx0cycuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJ1bkZpbmQgPSBmdW5jdGlvbiAob3B0aW9ucyA9IHt9KSB7XG4gIGlmICh0aGlzLmZpbmRPcHRpb25zLmxpbWl0ID09PSAwKSB7XG4gICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogW10gfTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgY29uc3QgZmluZE9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmZpbmRPcHRpb25zKTtcbiAgaWYgKHRoaXMua2V5cykge1xuICAgIGZpbmRPcHRpb25zLmtleXMgPSB0aGlzLmtleXMubWFwKGtleSA9PiB7XG4gICAgICByZXR1cm4ga2V5LnNwbGl0KCcuJylbMF07XG4gICAgfSk7XG4gIH1cbiAgaWYgKG9wdGlvbnMub3ApIHtcbiAgICBmaW5kT3B0aW9ucy5vcCA9IG9wdGlvbnMub3A7XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCBmaW5kT3B0aW9ucywgdGhpcy5hdXRoKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIGZpbmRPcHRpb25zLmV4cGxhaW4gIT09IHRydWUpIHtcbiAgICAgICAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICBjbGVhblJlc3VsdEF1dGhEYXRhKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHJlc3VsdHMpO1xuXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICBmb3IgKHZhciByIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICByLmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IHJlc3VsdHMgfTtcbiAgICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGV0aGVyIGl0IHdhcyBzdWNjZXNzZnVsLlxuLy8gUG9wdWxhdGVzIHRoaXMucmVzcG9uc2UuY291bnQgd2l0aCB0aGUgY291bnRcblJlc3RRdWVyeS5wcm90b3R5cGUucnVuQ291bnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kb0NvdW50KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuZmluZE9wdGlvbnMuY291bnQgPSB0cnVlO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5za2lwO1xuICBkZWxldGUgdGhpcy5maW5kT3B0aW9ucy5saW1pdDtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQodGhpcy5jbGFzc05hbWUsIHRoaXMucmVzdFdoZXJlLCB0aGlzLmZpbmRPcHRpb25zKS50aGVuKGMgPT4ge1xuICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBhbGwgcG9pbnRlcnMgb24gYW4gb2JqZWN0XG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGVBbGwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5pbmNsdWRlQWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5sb2FkU2NoZW1hKClcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuZ2V0T25lU2NoZW1hKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgY29uc3QgaW5jbHVkZUZpZWxkcyA9IFtdO1xuICAgICAgY29uc3Qga2V5RmllbGRzID0gW107XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAgICAgICAoc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKVxuICAgICAgICApIHtcbiAgICAgICAgICBpbmNsdWRlRmllbGRzLnB1c2goW2ZpZWxkXSk7XG4gICAgICAgICAga2V5RmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBBZGQgZmllbGRzIHRvIGluY2x1ZGUsIGtleXMsIHJlbW92ZSBkdXBzXG4gICAgICB0aGlzLmluY2x1ZGUgPSBbLi4ubmV3IFNldChbLi4udGhpcy5pbmNsdWRlLCAuLi5pbmNsdWRlRmllbGRzXSldO1xuICAgICAgLy8gaWYgdGhpcy5rZXlzIG5vdCBzZXQsIHRoZW4gYWxsIGtleXMgYXJlIGFscmVhZHkgaW5jbHVkZWRcbiAgICAgIGlmICh0aGlzLmtleXMpIHtcbiAgICAgICAgdGhpcy5rZXlzID0gWy4uLm5ldyBTZXQoWy4uLnRoaXMua2V5cywgLi4ua2V5RmllbGRzXSldO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gVXBkYXRlcyBwcm9wZXJ0eSBgdGhpcy5rZXlzYCB0byBjb250YWluIGFsbCBrZXlzIGJ1dCB0aGUgb25lcyB1bnNlbGVjdGVkLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVFeGNsdWRlS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmV4Y2x1ZGVLZXlzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICB0aGlzLmtleXMgPSB0aGlzLmtleXMuZmlsdGVyKGsgPT4gIXRoaXMuZXhjbHVkZUtleXMuaW5jbHVkZXMoaykpO1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpO1xuICAgICAgdGhpcy5rZXlzID0gZmllbGRzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICB9KTtcbn07XG5cbi8vIEF1Z21lbnRzIHRoaXMucmVzcG9uc2Ugd2l0aCBkYXRhIGF0IHRoZSBwYXRocyBwcm92aWRlZCBpbiB0aGlzLmluY2x1ZGUuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUluY2x1ZGUgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF0aGlzLnJ1bkFmdGVyRmluZCkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gdGhpcy5yZXN0V2hlcmU7XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuICAvLyBSdW4gYWZ0ZXJGaW5kIHRyaWdnZXIgYW5kIHNldCB0aGUgbmV3IHJlc3VsdHNcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgdGhpcy5yZXNwb25zZS5yZXN1bHRzLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBwYXJzZVF1ZXJ5LFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gRW5zdXJlIHdlIHByb3Blcmx5IHNldCB0aGUgY2xhc3NOYW1lIGJhY2tcbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICAgICAgb2JqZWN0ID0gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3QuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzdWx0cyA9IHJlc3VsdHM7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBBZGRzIGluY2x1ZGVkIHZhbHVlcyB0byB0aGUgcmVzcG9uc2UuXG4vLyBQYXRoIGlzIGEgbGlzdCBvZiBmaWVsZCBuYW1lcy5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhdWdtZW50ZWQgcmVzcG9uc2UuXG5mdW5jdGlvbiBpbmNsdWRlUGF0aChjb25maWcsIGF1dGgsIHJlc3BvbnNlLCBwYXRoLCByZXN0T3B0aW9ucyA9IHt9KSB7XG4gIHZhciBwb2ludGVycyA9IGZpbmRQb2ludGVycyhyZXNwb25zZS5yZXN1bHRzLCBwYXRoKTtcbiAgaWYgKHBvaW50ZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IHBvaW50ZXJzSGFzaCA9IHt9O1xuICBmb3IgKHZhciBwb2ludGVyIG9mIHBvaW50ZXJzKSB7XG4gICAgaWYgKCFwb2ludGVyKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcG9pbnRlci5jbGFzc05hbWU7XG4gICAgLy8gb25seSBpbmNsdWRlIHRoZSBnb29kIHBvaW50ZXJzXG4gICAgaWYgKGNsYXNzTmFtZSkge1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gPSBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXSB8fCBuZXcgU2V0KCk7XG4gICAgICBwb2ludGVyc0hhc2hbY2xhc3NOYW1lXS5hZGQocG9pbnRlci5vYmplY3RJZCk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGluY2x1ZGVSZXN0T3B0aW9ucyA9IHt9O1xuICBpZiAocmVzdE9wdGlvbnMua2V5cykge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KHJlc3RPcHRpb25zLmtleXMuc3BsaXQoJywnKSk7XG4gICAgY29uc3Qga2V5U2V0ID0gQXJyYXkuZnJvbShrZXlzKS5yZWR1Y2UoKHNldCwga2V5KSA9PiB7XG4gICAgICBjb25zdCBrZXlQYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICBsZXQgaSA9IDA7XG4gICAgICBmb3IgKGk7IGkgPCBwYXRoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChwYXRoW2ldICE9IGtleVBhdGhbaV0pIHtcbiAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaSA8IGtleVBhdGgubGVuZ3RoKSB7XG4gICAgICAgIHNldC5hZGQoa2V5UGF0aFtpXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2V0O1xuICAgIH0sIG5ldyBTZXQoKSk7XG4gICAgaWYgKGtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmtleXMgPSBBcnJheS5mcm9tKGtleVNldCkuam9pbignLCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cykge1xuICAgIGNvbnN0IGV4Y2x1ZGVLZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5leGNsdWRlS2V5cy5zcGxpdCgnLCcpKTtcbiAgICBjb25zdCBleGNsdWRlS2V5U2V0ID0gQXJyYXkuZnJvbShleGNsdWRlS2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPT0gKGtleVBhdGgubGVuZ3RoIC0gMSkpIHtcbiAgICAgICAgc2V0LmFkZChrZXlQYXRoW2ldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXQ7XG4gICAgfSwgbmV3IFNldCgpKTtcbiAgICBpZiAoZXhjbHVkZUtleVNldC5zaXplID4gMCkge1xuICAgICAgaW5jbHVkZVJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0gQXJyYXkuZnJvbShleGNsdWRlS2V5U2V0KS5qb2luKCcsJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICBpbmNsdWRlUmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBxdWVyeVByb21pc2VzID0gT2JqZWN0LmtleXMocG9pbnRlcnNIYXNoKS5tYXAoY2xhc3NOYW1lID0+IHtcbiAgICBjb25zdCBvYmplY3RJZHMgPSBBcnJheS5mcm9tKHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdKTtcbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKG9iamVjdElkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogb2JqZWN0SWRzWzBdIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogeyAkaW46IG9iamVjdElkcyB9IH07XG4gICAgfVxuICAgIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHdoZXJlLCBpbmNsdWRlUmVzdE9wdGlvbnMpO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuXG4gICAgdmFyIHJlc3AgPSB7XG4gICAgICByZXN1bHRzOiByZXBsYWNlUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCwgcmVwbGFjZSksXG4gICAgfTtcbiAgICBpZiAocmVzcG9uc2UuY291bnQpIHtcbiAgICAgIHJlc3AuY291bnQgPSByZXNwb25zZS5jb3VudDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3A7XG4gIH0pO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3QgdG8gZmluZCBwb2ludGVycyBpbiwgb3Jcbi8vIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBJZiB0aGUgcGF0aCB5aWVsZHMgdGhpbmdzIHRoYXQgYXJlbid0IHBvaW50ZXJzLCB0aGlzIHRocm93cyBhbiBlcnJvci5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIFJldHVybnMgYSBsaXN0IG9mIHBvaW50ZXJzIGluIFJFU1QgZm9ybWF0LlxuZnVuY3Rpb24gZmluZFBvaW50ZXJzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YXIgYW5zd2VyID0gW107XG4gICAgZm9yICh2YXIgeCBvZiBvYmplY3QpIHtcbiAgICAgIGFuc3dlciA9IGFuc3dlci5jb25jYXQoZmluZFBvaW50ZXJzKHgsIHBhdGgpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFuc3dlcjtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuIl19