"use strict";

/**
 * utils.js
 * @file General purpose utilities
 * @description General purpose utilities.
 */
const path = require('path');

const fs = require('fs').promises;
/**
 * The general purpose utilities.
 */


class Utils {
  /**
   * @function getLocalizedPath
   * @description Returns a localized file path accoring to the locale.
   *
   * Localized files are searched in subfolders of a given path, e.g.
   *
   * root/
   * ├── base/                    // base path to files
   * │   ├── example.html         // default file
   * │   └── de/                  // de language folder
   * │   │   └── example.html     // de localized file
   * │   └── de-AT/               // de-AT locale folder
   * │   │   └── example.html     // de-AT localized file
   *
   * Files are matched with the locale in the following order:
   * 1. Locale match, e.g. locale `de-AT` matches file in folder `de-AT`.
   * 2. Language match, e.g. locale `de-AT` matches file in folder `de`.
   * 3. Default; file in base folder is returned.
   *
   * @param {String} defaultPath The absolute file path, which is also
   * the default path returned if localization is not available.
   * @param {String} locale The locale.
   * @returns {Promise<Object>} The object contains:
   * - `path`: The path to the localized file, or the original path if
   *   localization is not available.
   * - `subdir`: The subdirectory of the localized file, or undefined if
   *   there is no matching localized file.
   */
  static async getLocalizedPath(defaultPath, locale) {
    // Get file name and paths
    const file = path.basename(defaultPath);
    const basePath = path.dirname(defaultPath); // If locale is not set return default file

    if (!locale) {
      return {
        path: defaultPath
      };
    } // Check file for locale exists


    const localePath = path.join(basePath, locale, file);
    const localeFileExists = await Utils.fileExists(localePath); // If file for locale exists return file

    if (localeFileExists) {
      return {
        path: localePath,
        subdir: locale
      };
    } // Check file for language exists


    const language = locale.split('-')[0];
    const languagePath = path.join(basePath, language, file);
    const languageFileExists = await Utils.fileExists(languagePath); // If file for language exists return file

    if (languageFileExists) {
      return {
        path: languagePath,
        subdir: language
      };
    } // Return default file


    return {
      path: defaultPath
    };
  }
  /**
   * @function fileExists
   * @description Checks whether a file exists.
   * @param {String} path The file path.
   * @returns {Promise<Boolean>} Is true if the file can be accessed, false otherwise.
   */


  static async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch (e) {
      return false;
    }
  }
  /**
   * @function isPath
   * @description Evaluates whether a string is a file path (as opposed to a URL for example).
   * @param {String} s The string to evaluate.
   * @returns {Boolean} Returns true if the evaluated string is a path.
   */


  static isPath(s) {
    return /(^\/)|(^\.\/)|(^\.\.\/)/.test(s);
  }
  /**
   * Flattens an object and crates new keys with custom delimiters.
   * @param {Object} obj The object to flatten.
   * @param {String} [delimiter='.'] The delimiter of the newly generated keys.
   * @param {Object} result
   * @returns {Object} The flattened object.
   **/


  static flattenObject(obj, parentKey, delimiter = '.', result = {}) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const newKey = parentKey ? parentKey + delimiter + key : key;

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.flattenObject(obj[key], newKey, delimiter, result);
        } else {
          result[newKey] = obj[key];
        }
      }
    }

    return result;
  }
  /**
   * Determines whether an object is a Promise.
   * @param {any} object The object to validate.
   * @returns {Boolean} Returns true if the object is a promise.
   */


  static isPromise(object) {
    return object instanceof Promise;
  }
  /**
   * Creates an object with all permutations of the original keys.
   * For example, this definition:
   * ```
   * {
   *   a: [true, false],
   *   b: [1, 2],
   *   c: ['x']
   * }
   * ```
   * permutates to:
   * ```
   * [
   *   { a: true, b: 1, c: 'x' },
   *   { a: true, b: 2, c: 'x' },
   *   { a: false, b: 1, c: 'x' },
   *   { a: false, b: 2, c: 'x' }
   * ]
   * ```
   * @param {Object} object The object to permutate.
   * @param {Integer} [index=0] The current key index.
   * @param {Object} [current={}] The current result entry being composed.
   * @param {Array} [results=[]] The resulting array of permutations.
   */


  static getObjectKeyPermutations(object, index = 0, current = {}, results = []) {
    const keys = Object.keys(object);
    const key = keys[index];
    const values = object[key];

    for (const value of values) {
      current[key] = value;
      const nextIndex = index + 1;

      if (nextIndex < keys.length) {
        Utils.getObjectKeyPermutations(object, nextIndex, current, results);
      } else {
        const result = Object.assign({}, current);
        results.push(result);
      }
    }

    return results;
  }
  /**
   * Validates parameters and throws if a parameter is invalid.
   * Example parameter types syntax:
   * ```
   * {
   *   parameterName: {
   *      t: 'boolean',
   *      v: isBoolean,
   *      o: true
   *   },
   *   ...
   * }
   * ```
   * @param {Object} params The parameters to validate.
   * @param {Array<Object>} types The parameter types used for validation.
   * @param {Object} types.t The parameter type; used for error message, not for validation.
   * @param {Object} types.v The function to validate the parameter value.
   * @param {Boolean} [types.o=false] Is true if the parameter is optional.
   */


  static validateParams(params, types) {
    for (const key of Object.keys(params)) {
      const type = types[key];
      const isOptional = !!type.o;
      const param = params[key];

      if (!(isOptional && param == null) && !type.v(param)) {
        throw `Invalid parameter ${key} must be of type ${type.t} but is ${typeof param}`;
      }
    }
  }

}

module.exports = Utils;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9VdGlscy5qcyJdLCJuYW1lcyI6WyJwYXRoIiwicmVxdWlyZSIsImZzIiwicHJvbWlzZXMiLCJVdGlscyIsImdldExvY2FsaXplZFBhdGgiLCJkZWZhdWx0UGF0aCIsImxvY2FsZSIsImZpbGUiLCJiYXNlbmFtZSIsImJhc2VQYXRoIiwiZGlybmFtZSIsImxvY2FsZVBhdGgiLCJqb2luIiwibG9jYWxlRmlsZUV4aXN0cyIsImZpbGVFeGlzdHMiLCJzdWJkaXIiLCJsYW5ndWFnZSIsInNwbGl0IiwibGFuZ3VhZ2VQYXRoIiwibGFuZ3VhZ2VGaWxlRXhpc3RzIiwiYWNjZXNzIiwiZSIsImlzUGF0aCIsInMiLCJ0ZXN0IiwiZmxhdHRlbk9iamVjdCIsIm9iaiIsInBhcmVudEtleSIsImRlbGltaXRlciIsInJlc3VsdCIsImtleSIsIk9iamVjdCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5ld0tleSIsImlzUHJvbWlzZSIsIm9iamVjdCIsIlByb21pc2UiLCJnZXRPYmplY3RLZXlQZXJtdXRhdGlvbnMiLCJpbmRleCIsImN1cnJlbnQiLCJyZXN1bHRzIiwia2V5cyIsInZhbHVlcyIsInZhbHVlIiwibmV4dEluZGV4IiwibGVuZ3RoIiwiYXNzaWduIiwicHVzaCIsInZhbGlkYXRlUGFyYW1zIiwicGFyYW1zIiwidHlwZXMiLCJ0eXBlIiwiaXNPcHRpb25hbCIsIm8iLCJwYXJhbSIsInYiLCJ0IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxPQUFPLENBQUMsTUFBRCxDQUFwQjs7QUFDQSxNQUFNQyxFQUFFLEdBQUdELE9BQU8sQ0FBQyxJQUFELENBQVAsQ0FBY0UsUUFBekI7QUFFQTtBQUNBO0FBQ0E7OztBQUNBLE1BQU1DLEtBQU4sQ0FBWTtBQUNWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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Q0wsY0FBTWIsTUFBTSxHQUFHRSxNQUFNLENBQUNpQixNQUFQLENBQWMsRUFBZCxFQUFrQlAsT0FBbEIsQ0FBZjtBQUNBQyxRQUFBQSxPQUFPLENBQUNPLElBQVIsQ0FBYXBCLE1BQWI7QUFDRDtBQUNGOztBQUNELFdBQU9hLE9BQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDdUIsU0FBZFEsY0FBYyxDQUFDQyxNQUFELEVBQVNDLEtBQVQsRUFBZ0I7QUFDbkMsU0FBSyxNQUFNdEIsR0FBWCxJQUFrQkMsTUFBTSxDQUFDWSxJQUFQLENBQVlRLE1BQVosQ0FBbEIsRUFBdUM7QUFDckMsWUFBTUUsSUFBSSxHQUFHRCxLQUFLLENBQUN0QixHQUFELENBQWxCO0FBQ0EsWUFBTXdCLFVBQVUsR0FBRyxDQUFDLENBQUNELElBQUksQ0FBQ0UsQ0FBMUI7QUFDQSxZQUFNQyxLQUFLLEdBQUdMLE1BQU0sQ0FBQ3JCLEdBQUQsQ0FBcEI7O0FBQ0EsVUFBSSxFQUFFd0IsVUFBVSxJQUFJRSxLQUFLLElBQUksSUFBekIsS0FBa0MsQ0FBQ0gsSUFBSSxDQUFDSSxDQUFMLENBQU9ELEtBQVAsQ0FBdkMsRUFBc0Q7QUFDcEQsY0FBTyxxQkFBb0IxQixHQUFJLG9CQUFtQnVCLElBQUksQ0FBQ0ssQ0FBRSxXQUFVLE9BQU9GLEtBQU0sRUFBaEY7QUFDRDtBQUNGO0FBQ0Y7O0FBN0xTOztBQWdNWkcsTUFBTSxDQUFDQyxPQUFQLEdBQWlCekQsS0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHV0aWxzLmpzXG4gKiBAZmlsZSBHZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzXG4gKiBAZGVzY3JpcHRpb24gR2VuZXJhbCBwdXJwb3NlIHV0aWxpdGllcy5cbiAqL1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgZnMgPSByZXF1aXJlKCdmcycpLnByb21pc2VzO1xuXG4vKipcbiAqIFRoZSBnZW5lcmFsIHB1cnBvc2UgdXRpbGl0aWVzLlxuICovXG5jbGFzcyBVdGlscyB7XG4gIC8qKlxuICAgKiBAZnVuY3Rpb24gZ2V0TG9jYWxpemVkUGF0aFxuICAgKiBAZGVzY3JpcHRpb24gUmV0dXJucyBhIGxvY2FsaXplZCBmaWxlIHBhdGggYWNjb3JpbmcgdG8gdGhlIGxvY2FsZS5cbiAgICpcbiAgICogTG9jYWxpemVkIGZpbGVzIGFyZSBzZWFyY2hlZCBpbiBzdWJmb2xkZXJzIG9mIGEgZ2l2ZW4gcGF0aCwgZS5nLlxuICAgKlxuICAgKiByb290L1xuICAgKiDilJzilIDilIAgYmFzZS8gICAgICAgICAgICAgICAgICAgIC8vIGJhc2UgcGF0aCB0byBmaWxlc1xuICAgKiDilIIgICDilJzilIDilIAgZXhhbXBsZS5odG1sICAgICAgICAgLy8gZGVmYXVsdCBmaWxlXG4gICAqIOKUgiAgIOKUlOKUgOKUgCBkZS8gICAgICAgICAgICAgICAgICAvLyBkZSBsYW5ndWFnZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUgbG9jYWxpemVkIGZpbGVcbiAgICog4pSCICAg4pSU4pSA4pSAIGRlLUFULyAgICAgICAgICAgICAgIC8vIGRlLUFUIGxvY2FsZSBmb2xkZXJcbiAgICog4pSCICAg4pSCICAg4pSU4pSA4pSAIGV4YW1wbGUuaHRtbCAgICAgLy8gZGUtQVQgbG9jYWxpemVkIGZpbGVcbiAgICpcbiAgICogRmlsZXMgYXJlIG1hdGNoZWQgd2l0aCB0aGUgbG9jYWxlIGluIHRoZSBmb2xsb3dpbmcgb3JkZXI6XG4gICAqIDEuIExvY2FsZSBtYXRjaCwgZS5nLiBsb2NhbGUgYGRlLUFUYCBtYXRjaGVzIGZpbGUgaW4gZm9sZGVyIGBkZS1BVGAuXG4gICAqIDIuIExhbmd1YWdlIG1hdGNoLCBlLmcuIGxvY2FsZSBgZGUtQVRgIG1hdGNoZXMgZmlsZSBpbiBmb2xkZXIgYGRlYC5cbiAgICogMy4gRGVmYXVsdDsgZmlsZSBpbiBiYXNlIGZvbGRlciBpcyByZXR1cm5lZC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlZmF1bHRQYXRoIFRoZSBhYnNvbHV0ZSBmaWxlIHBhdGgsIHdoaWNoIGlzIGFsc29cbiAgICogdGhlIGRlZmF1bHQgcGF0aCByZXR1cm5lZCBpZiBsb2NhbGl6YXRpb24gaXMgbm90IGF2YWlsYWJsZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGxvY2FsZSBUaGUgbG9jYWxlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxPYmplY3Q+fSBUaGUgb2JqZWN0IGNvbnRhaW5zOlxuICAgKiAtIGBwYXRoYDogVGhlIHBhdGggdG8gdGhlIGxvY2FsaXplZCBmaWxlLCBvciB0aGUgb3JpZ2luYWwgcGF0aCBpZlxuICAgKiAgIGxvY2FsaXphdGlvbiBpcyBub3QgYXZhaWxhYmxlLlxuICAgKiAtIGBzdWJkaXJgOiBUaGUgc3ViZGlyZWN0b3J5IG9mIHRoZSBsb2NhbGl6ZWQgZmlsZSwgb3IgdW5kZWZpbmVkIGlmXG4gICAqICAgdGhlcmUgaXMgbm8gbWF0Y2hpbmcgbG9jYWxpemVkIGZpbGUuXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZ2V0TG9jYWxpemVkUGF0aChkZWZhdWx0UGF0aCwgbG9jYWxlKSB7XG4gICAgLy8gR2V0IGZpbGUgbmFtZSBhbmQgcGF0aHNcbiAgICBjb25zdCBmaWxlID0gcGF0aC5iYXNlbmFtZShkZWZhdWx0UGF0aCk7XG4gICAgY29uc3QgYmFzZVBhdGggPSBwYXRoLmRpcm5hbWUoZGVmYXVsdFBhdGgpO1xuXG4gICAgLy8gSWYgbG9jYWxlIGlzIG5vdCBzZXQgcmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIGlmICghbG9jYWxlKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBkZWZhdWx0UGF0aCB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxvY2FsZSBleGlzdHNcbiAgICBjb25zdCBsb2NhbGVQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsb2NhbGUsIGZpbGUpO1xuICAgIGNvbnN0IGxvY2FsZUZpbGVFeGlzdHMgPSBhd2FpdCBVdGlscy5maWxlRXhpc3RzKGxvY2FsZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbG9jYWxlIGV4aXN0cyByZXR1cm4gZmlsZVxuICAgIGlmIChsb2NhbGVGaWxlRXhpc3RzKSB7XG4gICAgICByZXR1cm4geyBwYXRoOiBsb2NhbGVQYXRoLCBzdWJkaXI6IGxvY2FsZSB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZpbGUgZm9yIGxhbmd1YWdlIGV4aXN0c1xuICAgIGNvbnN0IGxhbmd1YWdlID0gbG9jYWxlLnNwbGl0KCctJylbMF07XG4gICAgY29uc3QgbGFuZ3VhZ2VQYXRoID0gcGF0aC5qb2luKGJhc2VQYXRoLCBsYW5ndWFnZSwgZmlsZSk7XG4gICAgY29uc3QgbGFuZ3VhZ2VGaWxlRXhpc3RzID0gYXdhaXQgVXRpbHMuZmlsZUV4aXN0cyhsYW5ndWFnZVBhdGgpO1xuXG4gICAgLy8gSWYgZmlsZSBmb3IgbGFuZ3VhZ2UgZXhpc3RzIHJldHVybiBmaWxlXG4gICAgaWYgKGxhbmd1YWdlRmlsZUV4aXN0cykge1xuICAgICAgcmV0dXJuIHsgcGF0aDogbGFuZ3VhZ2VQYXRoLCBzdWJkaXI6IGxhbmd1YWdlIH07XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIGRlZmF1bHQgZmlsZVxuICAgIHJldHVybiB7IHBhdGg6IGRlZmF1bHRQYXRoIH07XG4gIH1cblxuICAvKipcbiAgICogQGZ1bmN0aW9uIGZpbGVFeGlzdHNcbiAgICogQGRlc2NyaXB0aW9uIENoZWNrcyB3aGV0aGVyIGEgZmlsZSBleGlzdHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBmaWxlIHBhdGguXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPEJvb2xlYW4+fSBJcyB0cnVlIGlmIHRoZSBmaWxlIGNhbiBiZSBhY2Nlc3NlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGZpbGVFeGlzdHMocGF0aCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBmcy5hY2Nlc3MocGF0aCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBpc1BhdGhcbiAgICogQGRlc2NyaXB0aW9uIEV2YWx1YXRlcyB3aGV0aGVyIGEgc3RyaW5nIGlzIGEgZmlsZSBwYXRoIChhcyBvcHBvc2VkIHRvIGEgVVJMIGZvciBleGFtcGxlKS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHMgVGhlIHN0cmluZyB0byBldmFsdWF0ZS5cbiAgICogQHJldHVybnMge0Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiB0aGUgZXZhbHVhdGVkIHN0cmluZyBpcyBhIHBhdGguXG4gICAqL1xuICBzdGF0aWMgaXNQYXRoKHMpIHtcbiAgICByZXR1cm4gLyheXFwvKXwoXlxcLlxcLyl8KF5cXC5cXC5cXC8pLy50ZXN0KHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZsYXR0ZW5zIGFuIG9iamVjdCBhbmQgY3JhdGVzIG5ldyBrZXlzIHdpdGggY3VzdG9tIGRlbGltaXRlcnMuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBmbGF0dGVuLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gW2RlbGltaXRlcj0nLiddIFRoZSBkZWxpbWl0ZXIgb2YgdGhlIG5ld2x5IGdlbmVyYXRlZCBrZXlzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzdWx0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBmbGF0dGVuZWQgb2JqZWN0LlxuICAgKiovXG4gIHN0YXRpYyBmbGF0dGVuT2JqZWN0KG9iaiwgcGFyZW50S2V5LCBkZWxpbWl0ZXIgPSAnLicsIHJlc3VsdCA9IHt9KSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICBjb25zdCBuZXdLZXkgPSBwYXJlbnRLZXkgPyBwYXJlbnRLZXkgKyBkZWxpbWl0ZXIgKyBrZXkgOiBrZXk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ29iamVjdCcgJiYgb2JqW2tleV0gIT09IG51bGwpIHtcbiAgICAgICAgICB0aGlzLmZsYXR0ZW5PYmplY3Qob2JqW2tleV0sIG5ld0tleSwgZGVsaW1pdGVyLCByZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtuZXdLZXldID0gb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgYW4gb2JqZWN0IGlzIGEgUHJvbWlzZS5cbiAgICogQHBhcmFtIHthbnl9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHZhbGlkYXRlLlxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBvYmplY3QgaXMgYSBwcm9taXNlLlxuICAgKi9cbiAgc3RhdGljIGlzUHJvbWlzZShvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgUHJvbWlzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuIG9iamVjdCB3aXRoIGFsbCBwZXJtdXRhdGlvbnMgb2YgdGhlIG9yaWdpbmFsIGtleXMuXG4gICAqIEZvciBleGFtcGxlLCB0aGlzIGRlZmluaXRpb246XG4gICAqIGBgYFxuICAgKiB7XG4gICAqICAgYTogW3RydWUsIGZhbHNlXSxcbiAgICogICBiOiBbMSwgMl0sXG4gICAqICAgYzogWyd4J11cbiAgICogfVxuICAgKiBgYGBcbiAgICogcGVybXV0YXRlcyB0bzpcbiAgICogYGBgXG4gICAqIFtcbiAgICogICB7IGE6IHRydWUsIGI6IDEsIGM6ICd4JyB9LFxuICAgKiAgIHsgYTogdHJ1ZSwgYjogMiwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiBmYWxzZSwgYjogMSwgYzogJ3gnIH0sXG4gICAqICAgeyBhOiBmYWxzZSwgYjogMiwgYzogJ3gnIH1cbiAgICogXVxuICAgKiBgYGBcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHBlcm11dGF0ZS5cbiAgICogQHBhcmFtIHtJbnRlZ2VyfSBbaW5kZXg9MF0gVGhlIGN1cnJlbnQga2V5IGluZGV4LlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2N1cnJlbnQ9e31dIFRoZSBjdXJyZW50IHJlc3VsdCBlbnRyeSBiZWluZyBjb21wb3NlZC5cbiAgICogQHBhcmFtIHtBcnJheX0gW3Jlc3VsdHM9W11dIFRoZSByZXN1bHRpbmcgYXJyYXkgb2YgcGVybXV0YXRpb25zLlxuICAgKi9cbiAgc3RhdGljIGdldE9iamVjdEtleVBlcm11dGF0aW9ucyhvYmplY3QsIGluZGV4ID0gMCwgY3VycmVudCA9IHt9LCByZXN1bHRzID0gW10pIHtcbiAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcbiAgICBjb25zdCBrZXkgPSBrZXlzW2luZGV4XTtcbiAgICBjb25zdCB2YWx1ZXMgPSBvYmplY3Rba2V5XTtcblxuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSB2YWx1ZTtcbiAgICAgIGNvbnN0IG5leHRJbmRleCA9IGluZGV4ICsgMTtcblxuICAgICAgaWYgKG5leHRJbmRleCA8IGtleXMubGVuZ3RoKSB7XG4gICAgICAgIFV0aWxzLmdldE9iamVjdEtleVBlcm11dGF0aW9ucyhvYmplY3QsIG5leHRJbmRleCwgY3VycmVudCwgcmVzdWx0cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBPYmplY3QuYXNzaWduKHt9LCBjdXJyZW50KTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBwYXJhbWV0ZXJzIGFuZCB0aHJvd3MgaWYgYSBwYXJhbWV0ZXIgaXMgaW52YWxpZC5cbiAgICogRXhhbXBsZSBwYXJhbWV0ZXIgdHlwZXMgc3ludGF4OlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgIHBhcmFtZXRlck5hbWU6IHtcbiAgICogICAgICB0OiAnYm9vbGVhbicsXG4gICAqICAgICAgdjogaXNCb29sZWFuLFxuICAgKiAgICAgIG86IHRydWVcbiAgICogICB9LFxuICAgKiAgIC4uLlxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKiBAcGFyYW0ge0FycmF5PE9iamVjdD59IHR5cGVzIFRoZSBwYXJhbWV0ZXIgdHlwZXMgdXNlZCBmb3IgdmFsaWRhdGlvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IHR5cGVzLnQgVGhlIHBhcmFtZXRlciB0eXBlOyB1c2VkIGZvciBlcnJvciBtZXNzYWdlLCBub3QgZm9yIHZhbGlkYXRpb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0eXBlcy52IFRoZSBmdW5jdGlvbiB0byB2YWxpZGF0ZSB0aGUgcGFyYW1ldGVyIHZhbHVlLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFt0eXBlcy5vPWZhbHNlXSBJcyB0cnVlIGlmIHRoZSBwYXJhbWV0ZXIgaXMgb3B0aW9uYWwuXG4gICAqL1xuICBzdGF0aWMgdmFsaWRhdGVQYXJhbXMocGFyYW1zLCB0eXBlcykge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHBhcmFtcykpIHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0eXBlc1trZXldO1xuICAgICAgY29uc3QgaXNPcHRpb25hbCA9ICEhdHlwZS5vO1xuICAgICAgY29uc3QgcGFyYW0gPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICghKGlzT3B0aW9uYWwgJiYgcGFyYW0gPT0gbnVsbCkgJiYgIXR5cGUudihwYXJhbSkpIHtcbiAgICAgICAgdGhyb3cgYEludmFsaWQgcGFyYW1ldGVyICR7a2V5fSBtdXN0IGJlIG9mIHR5cGUgJHt0eXBlLnR9IGJ1dCBpcyAke3R5cGVvZiBwYXJhbX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFV0aWxzO1xuIl19