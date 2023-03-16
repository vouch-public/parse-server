/*
 * A slightly patched version of node's URL module, with support for `mongodb://` URIs.
 * See https://github.com/nodejs/node for licensing information.
 */

'use strict';

const punycode = require('punycode');
exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;
exports.Url = Url;
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/;

// Special case for a simple path URL
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;

// protocols that can allow "unsafe" and "unwise" chars.
const unsafeProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that never have a hostname.
const hostlessProtocol = {
  javascript: true,
  'javascript:': true
};
// protocols that always contain a // bit.
const slashedProtocol = {
  http: true,
  'http:': true,
  https: true,
  'https:': true,
  ftp: true,
  'ftp:': true,
  gopher: true,
  'gopher:': true,
  file: true,
  'file:': true
};
const querystring = require('querystring');

/* istanbul ignore next: improve coverage */
function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url instanceof Url) return url;
  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

/* istanbul ignore next: improve coverage */
Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError('Parameter "url" must be a string, not ' + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var hasHash = false;
  var start = -1;
  var end = -1;
  var rest = '';
  var lastPos = 0;
  var i = 0;
  for (var inWs = false, split = false; i < url.length; ++i) {
    const code = url.charCodeAt(i);

    // Find first and last non-whitespace characters for trimming
    const isWs = code === 32 /* */ || code === 9 /*\t*/ || code === 13 /*\r*/ || code === 10 /*\n*/ || code === 12 /*\f*/ || code === 160 /*\u00A0*/ || code === 65279; /*\uFEFF*/
    if (start === -1) {
      if (isWs) continue;
      lastPos = start = i;
    } else {
      if (inWs) {
        if (!isWs) {
          end = -1;
          inWs = false;
        }
      } else if (isWs) {
        end = i;
        inWs = true;
      }
    }

    // Only convert backslashes while we haven't seen a split character
    if (!split) {
      switch (code) {
        case 35:
          // '#'
          hasHash = true;
        // Fall through
        case 63:
          // '?'
          split = true;
          break;
        case 92:
          // '\\'
          if (i - lastPos > 0) rest += url.slice(lastPos, i);
          rest += '/';
          lastPos = i + 1;
          break;
      }
    } else if (!hasHash && code === 35 /*#*/) {
      hasHash = true;
    }
  }

  // Check if string was non-empty (including strings with only whitespace)
  if (start !== -1) {
    if (lastPos === start) {
      // We didn't convert any backslashes

      if (end === -1) {
        if (start === 0) rest = url;else rest = url.slice(start);
      } else {
        rest = url.slice(start, end);
      }
    } else if (end === -1 && lastPos < url.length) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos);
    } else if (end !== -1 && lastPos < end) {
      // We converted some backslashes and have only part of the entire string
      rest += url.slice(lastPos, end);
    }
  }
  if (!slashesDenoteHost && !hasHash) {
    // Try fast path regexp
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.slice(1));
        } else {
          this.query = this.search.slice(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }
  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.slice(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || /^\/\/[^@\/]+@[^@\/]+/.test(rest)) {
    var slashes = rest.charCodeAt(0) === 47 /*/*/ && rest.charCodeAt(1) === 47; /*/*/
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.slice(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:b path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    var hostEnd = -1;
    var atSign = -1;
    var nonHost = -1;
    for (i = 0; i < rest.length; ++i) {
      switch (rest.charCodeAt(i)) {
        case 9: // '\t'
        case 10: // '\n'
        case 13: // '\r'
        case 32: // ' '
        case 34: // '"'
        case 37: // '%'
        case 39: // '\''
        case 59: // ';'
        case 60: // '<'
        case 62: // '>'
        case 92: // '\\'
        case 94: // '^'
        case 96: // '`'
        case 123: // '{'
        case 124: // '|'
        case 125:
          // '}'
          // Characters that are never ever allowed in a hostname from RFC 2396
          if (nonHost === -1) nonHost = i;
          break;
        case 35: // '#'
        case 47: // '/'
        case 63:
          // '?'
          // Find the first instance of any host-ending characters
          if (nonHost === -1) nonHost = i;
          hostEnd = i;
          break;
        case 64:
          // '@'
          // At this point, either we have an explicit point where the
          // auth portion cannot go past, or the last @ char is the decider.
          atSign = i;
          nonHost = -1;
          break;
      }
      if (hostEnd !== -1) break;
    }
    start = 0;
    if (atSign !== -1) {
      this.auth = decodeURIComponent(rest.slice(0, atSign));
      start = atSign + 1;
    }
    if (nonHost === -1) {
      this.host = rest.slice(start);
      rest = '';
    } else {
      this.host = rest.slice(start, nonHost);
      rest = rest.slice(nonHost);
    }

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    if (typeof this.hostname !== 'string') this.hostname = '';
    var hostname = this.hostname;

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = hostname.charCodeAt(0) === 91 /*[*/ && hostname.charCodeAt(hostname.length - 1) === 93; /*]*/

    // validate a little.
    if (!ipv6Hostname) {
      const result = validateHostname(this, rest, hostname);
      if (result !== undefined) rest = result;
    }

    // hostnames are always lower case.
    this.hostname = this.hostname.toLowerCase();
    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }
    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {
    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    const result = autoEscapeStr(rest);
    if (result !== undefined) rest = result;
  }
  var questionIdx = -1;
  var hashIdx = -1;
  for (i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);
    if (code === 35 /*#*/) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63 /*?*/ && questionIdx === -1) {
      questionIdx = i;
    }
  }
  if (questionIdx !== -1) {
    if (hashIdx === -1) {
      this.search = rest.slice(questionIdx);
      this.query = rest.slice(questionIdx + 1);
    } else {
      this.search = rest.slice(questionIdx, hashIdx);
      this.query = rest.slice(questionIdx + 1, hashIdx);
    }
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  var firstIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx) ? questionIdx : hashIdx;
  if (firstIdx === -1) {
    if (rest.length > 0) this.pathname = rest;
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  // to support http.request
  if (this.pathname || this.search) {
    const p = this.pathname || '';
    const s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

/* istanbul ignore next: improve coverage */
function validateHostname(self, rest, hostname) {
  for (var i = 0, lastPos; i <= hostname.length; ++i) {
    var code;
    if (i < hostname.length) code = hostname.charCodeAt(i);
    if (code === 46 /*.*/ || i === hostname.length) {
      if (i - lastPos > 0) {
        if (i - lastPos > 63) {
          self.hostname = hostname.slice(0, lastPos + 63);
          return '/' + hostname.slice(lastPos + 63) + rest;
        }
      }
      lastPos = i + 1;
      continue;
    } else if (code >= 48 /*0*/ && code <= 57 /*9*/ || code >= 97 /*a*/ && code <= 122 /*z*/ || code === 45 /*-*/ || code >= 65 /*A*/ && code <= 90 /*Z*/ || code === 43 /*+*/ || code === 95 /*_*/ || /* BEGIN MONGO URI PATCH */
    code === 44 /*,*/ || code === 58 /*:*/ || /* END MONGO URI PATCH */
    code > 127) {
      continue;
    }
    // Invalid host character
    self.hostname = hostname.slice(0, i);
    if (i < hostname.length) return '/' + hostname.slice(i) + rest;
    break;
  }
}

/* istanbul ignore next: improve coverage */
function autoEscapeStr(rest) {
  var newRest = '';
  var lastPos = 0;
  for (var i = 0; i < rest.length; ++i) {
    // Automatically escape all delimiters and unwise characters from RFC 2396
    // Also escape single quotes in case of an XSS attack
    switch (rest.charCodeAt(i)) {
      case 9:
        // '\t'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%09';
        lastPos = i + 1;
        break;
      case 10:
        // '\n'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0A';
        lastPos = i + 1;
        break;
      case 13:
        // '\r'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%0D';
        lastPos = i + 1;
        break;
      case 32:
        // ' '
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%20';
        lastPos = i + 1;
        break;
      case 34:
        // '"'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%22';
        lastPos = i + 1;
        break;
      case 39:
        // '\''
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%27';
        lastPos = i + 1;
        break;
      case 60:
        // '<'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3C';
        lastPos = i + 1;
        break;
      case 62:
        // '>'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%3E';
        lastPos = i + 1;
        break;
      case 92:
        // '\\'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5C';
        lastPos = i + 1;
        break;
      case 94:
        // '^'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%5E';
        lastPos = i + 1;
        break;
      case 96:
        // '`'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%60';
        lastPos = i + 1;
        break;
      case 123:
        // '{'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7B';
        lastPos = i + 1;
        break;
      case 124:
        // '|'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7C';
        lastPos = i + 1;
        break;
      case 125:
        // '}'
        if (i - lastPos > 0) newRest += rest.slice(lastPos, i);
        newRest += '%7D';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos === 0) return;
  if (lastPos < rest.length) return newRest + rest.slice(lastPos);else return newRest;
}

// format a parsed object into a url string
/* istanbul ignore next: improve coverage */
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof obj === 'string') obj = urlParse(obj);else if (typeof obj !== 'object' || obj === null) throw new TypeError('Parameter "urlObj" must be an object, not ' + obj === null ? 'null' : typeof obj);else if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

/* istanbul ignore next: improve coverage */
Url.prototype.format = function () {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeAuth(auth);
    auth += '@';
  }
  var protocol = this.protocol || '';
  var pathname = this.pathname || '';
  var hash = this.hash || '';
  var host = false;
  var query = '';
  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ? this.hostname : '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }
  if (this.query !== null && typeof this.query === 'object') query = querystring.stringify(this.query);
  var search = this.search || query && '?' + query || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58 /*:*/) protocol += ':';
  var newPathname = '';
  var lastPos = 0;
  for (var i = 0; i < pathname.length; ++i) {
    switch (pathname.charCodeAt(i)) {
      case 35:
        // '#'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%23';
        lastPos = i + 1;
        break;
      case 63:
        // '?'
        if (i - lastPos > 0) newPathname += pathname.slice(lastPos, i);
        newPathname += '%3F';
        lastPos = i + 1;
        break;
    }
  }
  if (lastPos > 0) {
    if (lastPos !== pathname.length) pathname = newPathname + pathname.slice(lastPos);else pathname = newPathname;
  }

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charCodeAt(0) !== 47 /*/*/) pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }
  search = search.replace('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35 /*#*/) hash = '#' + hash;
  if (search && search.charCodeAt(0) !== 63 /*?*/) search = '?' + search;
  return protocol + host + pathname + search + hash;
};

/* istanbul ignore next: improve coverage */
function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolve = function (relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

/* istanbul ignore next: improve coverage */
function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

/* istanbul ignore next: improve coverage */
Url.prototype.resolveObject = function (relative) {
  if (typeof relative === 'string') {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }
  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }
    result.href = result.format();
    return result;
  }
  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }
    result.protocol = relative.protocol;
    if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol[relative.protocol]) {
      const relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }
  var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/';
  var isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/';
  var mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
  var removeAllDots = mustEndAbs;
  var srcPath = result.pathname && result.pathname.split('/') || [];
  var relPath = relative.pathname && relative.pathname.split('/') || [];
  var psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }
  if (isRelAbs) {
    // it's absolute.
    result.host = relative.host || relative.host === '' ? relative.host : result.host;
    result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occasionally the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === '';

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      spliceOne(srcPath, i);
    } else if (last === '..') {
      spliceOne(srcPath, i);
      up++;
    } else if (up) {
      spliceOne(srcPath, i);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }
  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }
  if (hasTrailingSlash && srcPath.join('/').substr(-1) !== '/') {
    srcPath.push('');
  }
  var isAbsolute = srcPath[0] === '' || srcPath[0] && srcPath[0].charAt(0) === '/';

  // put the host back
  if (psychotic) {
    if (isAbsolute) {
      result.hostname = result.host = '';
    } else {
      result.hostname = result.host = srcPath.length ? srcPath.shift() : '';
    }
    //occasionally the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }
  mustEndAbs = mustEndAbs || result.host && srcPath.length;
  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }
  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

/* istanbul ignore next: improve coverage */
Url.prototype.parseHost = function () {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.slice(1);
    }
    host = host.slice(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

// About 1.5x faster than the two-arg version of Array#splice().
/* istanbul ignore next: improve coverage */
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) list[i] = list[k];
  list.pop();
}
var hexTable = new Array(256);
for (var i = 0; i < 256; ++i) hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
/* istanbul ignore next: improve coverage */
function encodeAuth(str) {
  // faster encodeURIComponent alternative for encoding auth uri components
  var out = '';
  var lastPos = 0;
  for (var i = 0; i < str.length; ++i) {
    var c = str.charCodeAt(i);

    // These characters do not need escaping:
    // ! - . _ ~
    // ' ( ) * :
    // digits
    // alpha (uppercase)
    // alpha (lowercase)
    if (c === 0x21 || c === 0x2d || c === 0x2e || c === 0x5f || c === 0x7e || c >= 0x27 && c <= 0x2a || c >= 0x30 && c <= 0x3a || c >= 0x41 && c <= 0x5a || c >= 0x61 && c <= 0x7a) {
      continue;
    }
    if (i - lastPos > 0) out += str.slice(lastPos, i);
    lastPos = i + 1;

    // Other ASCII characters
    if (c < 0x80) {
      out += hexTable[c];
      continue;
    }

    // Multi-byte characters ...
    if (c < 0x800) {
      out += hexTable[0xc0 | c >> 6] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    if (c < 0xd800 || c >= 0xe000) {
      out += hexTable[0xe0 | c >> 12] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
      continue;
    }
    // Surrogate pair
    ++i;
    var c2;
    if (i < str.length) c2 = str.charCodeAt(i) & 0x3ff;else c2 = 0;
    c = 0x10000 + ((c & 0x3ff) << 10 | c2);
    out += hexTable[0xf0 | c >> 18] + hexTable[0x80 | c >> 12 & 0x3f] + hexTable[0x80 | c >> 6 & 0x3f] + hexTable[0x80 | c & 0x3f];
  }
  if (lastPos === 0) return str;
  if (lastPos < str.length) return out + str.slice(lastPos);
  return out;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwdW55Y29kZSIsInJlcXVpcmUiLCJleHBvcnRzIiwicGFyc2UiLCJ1cmxQYXJzZSIsInJlc29sdmUiLCJ1cmxSZXNvbHZlIiwicmVzb2x2ZU9iamVjdCIsInVybFJlc29sdmVPYmplY3QiLCJmb3JtYXQiLCJ1cmxGb3JtYXQiLCJVcmwiLCJwcm90b2NvbCIsInNsYXNoZXMiLCJhdXRoIiwiaG9zdCIsInBvcnQiLCJob3N0bmFtZSIsImhhc2giLCJzZWFyY2giLCJxdWVyeSIsInBhdGhuYW1lIiwicGF0aCIsImhyZWYiLCJwcm90b2NvbFBhdHRlcm4iLCJwb3J0UGF0dGVybiIsInNpbXBsZVBhdGhQYXR0ZXJuIiwidW5zYWZlUHJvdG9jb2wiLCJqYXZhc2NyaXB0IiwiaG9zdGxlc3NQcm90b2NvbCIsInNsYXNoZWRQcm90b2NvbCIsImh0dHAiLCJodHRwcyIsImZ0cCIsImdvcGhlciIsImZpbGUiLCJxdWVyeXN0cmluZyIsInVybCIsInBhcnNlUXVlcnlTdHJpbmciLCJzbGFzaGVzRGVub3RlSG9zdCIsInUiLCJwcm90b3R5cGUiLCJUeXBlRXJyb3IiLCJoYXNIYXNoIiwic3RhcnQiLCJlbmQiLCJyZXN0IiwibGFzdFBvcyIsImkiLCJpbldzIiwic3BsaXQiLCJsZW5ndGgiLCJjb2RlIiwiY2hhckNvZGVBdCIsImlzV3MiLCJzbGljZSIsInNpbXBsZVBhdGgiLCJleGVjIiwicHJvdG8iLCJsb3dlclByb3RvIiwidG9Mb3dlckNhc2UiLCJ0ZXN0IiwiaG9zdEVuZCIsImF0U2lnbiIsIm5vbkhvc3QiLCJkZWNvZGVVUklDb21wb25lbnQiLCJwYXJzZUhvc3QiLCJpcHY2SG9zdG5hbWUiLCJyZXN1bHQiLCJ2YWxpZGF0ZUhvc3RuYW1lIiwidW5kZWZpbmVkIiwidG9BU0NJSSIsInAiLCJoIiwiYXV0b0VzY2FwZVN0ciIsInF1ZXN0aW9uSWR4IiwiaGFzaElkeCIsImZpcnN0SWR4IiwicyIsInNlbGYiLCJuZXdSZXN0Iiwib2JqIiwiY2FsbCIsImVuY29kZUF1dGgiLCJpbmRleE9mIiwic3RyaW5naWZ5IiwibmV3UGF0aG5hbWUiLCJyZXBsYWNlIiwic291cmNlIiwicmVsYXRpdmUiLCJyZWwiLCJ0a2V5cyIsIk9iamVjdCIsImtleXMiLCJ0ayIsInRrZXkiLCJya2V5cyIsInJrIiwicmtleSIsInYiLCJrIiwicmVsUGF0aCIsInNoaWZ0IiwidW5zaGlmdCIsImpvaW4iLCJpc1NvdXJjZUFicyIsImNoYXJBdCIsImlzUmVsQWJzIiwibXVzdEVuZEFicyIsInJlbW92ZUFsbERvdHMiLCJzcmNQYXRoIiwicHN5Y2hvdGljIiwicG9wIiwiY29uY2F0IiwiYXV0aEluSG9zdCIsImxhc3QiLCJoYXNUcmFpbGluZ1NsYXNoIiwidXAiLCJzcGxpY2VPbmUiLCJzdWJzdHIiLCJwdXNoIiwiaXNBYnNvbHV0ZSIsImxpc3QiLCJpbmRleCIsIm4iLCJoZXhUYWJsZSIsIkFycmF5IiwidG9TdHJpbmciLCJ0b1VwcGVyQ2FzZSIsInN0ciIsIm91dCIsImMiLCJjMiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92ZW5kb3IvbW9uZ29kYlVybC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQSBzbGlnaHRseSBwYXRjaGVkIHZlcnNpb24gb2Ygbm9kZSdzIFVSTCBtb2R1bGUsIHdpdGggc3VwcG9ydCBmb3IgYG1vbmdvZGI6Ly9gIFVSSXMuXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlIGZvciBsaWNlbnNpbmcgaW5mb3JtYXRpb24uXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCBwdW55Y29kZSA9IHJlcXVpcmUoJ3B1bnljb2RlJyk7XG5cbmV4cG9ydHMucGFyc2UgPSB1cmxQYXJzZTtcbmV4cG9ydHMucmVzb2x2ZSA9IHVybFJlc29sdmU7XG5leHBvcnRzLnJlc29sdmVPYmplY3QgPSB1cmxSZXNvbHZlT2JqZWN0O1xuZXhwb3J0cy5mb3JtYXQgPSB1cmxGb3JtYXQ7XG5cbmV4cG9ydHMuVXJsID0gVXJsO1xuXG5mdW5jdGlvbiBVcmwoKSB7XG4gIHRoaXMucHJvdG9jb2wgPSBudWxsO1xuICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICB0aGlzLmF1dGggPSBudWxsO1xuICB0aGlzLmhvc3QgPSBudWxsO1xuICB0aGlzLnBvcnQgPSBudWxsO1xuICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgdGhpcy5oYXNoID0gbnVsbDtcbiAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICB0aGlzLnF1ZXJ5ID0gbnVsbDtcbiAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG4gIHRoaXMucGF0aCA9IG51bGw7XG4gIHRoaXMuaHJlZiA9IG51bGw7XG59XG5cbi8vIFJlZmVyZW5jZTogUkZDIDM5ODYsIFJGQyAxODA4LCBSRkMgMjM5NlxuXG4vLyBkZWZpbmUgdGhlc2UgaGVyZSBzbyBhdCBsZWFzdCB0aGV5IG9ubHkgaGF2ZSB0byBiZVxuLy8gY29tcGlsZWQgb25jZSBvbiB0aGUgZmlyc3QgbW9kdWxlIGxvYWQuXG5jb25zdCBwcm90b2NvbFBhdHRlcm4gPSAvXihbYS16MC05ListXSs6KS9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuXG4vLyBTcGVjaWFsIGNhc2UgZm9yIGEgc2ltcGxlIHBhdGggVVJMXG5jb25zdCBzaW1wbGVQYXRoUGF0dGVybiA9IC9eKFxcL1xcLz8oPyFcXC8pW15cXD9cXHNdKikoXFw/W15cXHNdKik/JC87XG5cbi8vIHByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSB7XG4gIGphdmFzY3JpcHQ6IHRydWUsXG4gICdqYXZhc2NyaXB0Oic6IHRydWUsXG59O1xuLy8gcHJvdG9jb2xzIHRoYXQgbmV2ZXIgaGF2ZSBhIGhvc3RuYW1lLlxuY29uc3QgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgamF2YXNjcmlwdDogdHJ1ZSxcbiAgJ2phdmFzY3JpcHQ6JzogdHJ1ZSxcbn07XG4vLyBwcm90b2NvbHMgdGhhdCBhbHdheXMgY29udGFpbiBhIC8vIGJpdC5cbmNvbnN0IHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgaHR0cDogdHJ1ZSxcbiAgJ2h0dHA6JzogdHJ1ZSxcbiAgaHR0cHM6IHRydWUsXG4gICdodHRwczonOiB0cnVlLFxuICBmdHA6IHRydWUsXG4gICdmdHA6JzogdHJ1ZSxcbiAgZ29waGVyOiB0cnVlLFxuICAnZ29waGVyOic6IHRydWUsXG4gIGZpbGU6IHRydWUsXG4gICdmaWxlOic6IHRydWUsXG59O1xuY29uc3QgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gdXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodXJsIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gdXJsO1xuXG4gIHZhciB1ID0gbmV3IFVybCgpO1xuICB1LnBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpO1xuICByZXR1cm4gdTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbiAodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCkge1xuICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdQYXJhbWV0ZXIgXCJ1cmxcIiBtdXN0IGJlIGEgc3RyaW5nLCBub3QgJyArIHR5cGVvZiB1cmwpO1xuICB9XG5cbiAgLy8gQ29weSBjaHJvbWUsIElFLCBvcGVyYSBiYWNrc2xhc2gtaGFuZGxpbmcgYmVoYXZpb3IuXG4gIC8vIEJhY2sgc2xhc2hlcyBiZWZvcmUgdGhlIHF1ZXJ5IHN0cmluZyBnZXQgY29udmVydGVkIHRvIGZvcndhcmQgc2xhc2hlc1xuICAvLyBTZWU6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0yNTkxNlxuICB2YXIgaGFzSGFzaCA9IGZhbHNlO1xuICB2YXIgc3RhcnQgPSAtMTtcbiAgdmFyIGVuZCA9IC0xO1xuICB2YXIgcmVzdCA9ICcnO1xuICB2YXIgbGFzdFBvcyA9IDA7XG4gIHZhciBpID0gMDtcbiAgZm9yICh2YXIgaW5XcyA9IGZhbHNlLCBzcGxpdCA9IGZhbHNlOyBpIDwgdXJsLmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHVybC5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gRmluZCBmaXJzdCBhbmQgbGFzdCBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJzIGZvciB0cmltbWluZ1xuICAgIGNvbnN0IGlzV3MgPVxuICAgICAgY29kZSA9PT0gMzIgLyogKi8gfHxcbiAgICAgIGNvZGUgPT09IDkgLypcXHQqLyB8fFxuICAgICAgY29kZSA9PT0gMTMgLypcXHIqLyB8fFxuICAgICAgY29kZSA9PT0gMTAgLypcXG4qLyB8fFxuICAgICAgY29kZSA9PT0gMTIgLypcXGYqLyB8fFxuICAgICAgY29kZSA9PT0gMTYwIC8qXFx1MDBBMCovIHx8XG4gICAgICBjb2RlID09PSA2NTI3OTsgLypcXHVGRUZGKi9cbiAgICBpZiAoc3RhcnQgPT09IC0xKSB7XG4gICAgICBpZiAoaXNXcykgY29udGludWU7XG4gICAgICBsYXN0UG9zID0gc3RhcnQgPSBpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaW5Xcykge1xuICAgICAgICBpZiAoIWlzV3MpIHtcbiAgICAgICAgICBlbmQgPSAtMTtcbiAgICAgICAgICBpbldzID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoaXNXcykge1xuICAgICAgICBlbmQgPSBpO1xuICAgICAgICBpbldzID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPbmx5IGNvbnZlcnQgYmFja3NsYXNoZXMgd2hpbGUgd2UgaGF2ZW4ndCBzZWVuIGEgc3BsaXQgY2hhcmFjdGVyXG4gICAgaWYgKCFzcGxpdCkge1xuICAgICAgc3dpdGNoIChjb2RlKSB7XG4gICAgICAgIGNhc2UgMzU6IC8vICcjJ1xuICAgICAgICAgIGhhc0hhc2ggPSB0cnVlO1xuICAgICAgICAvLyBGYWxsIHRocm91Z2hcbiAgICAgICAgY2FzZSA2MzogLy8gJz8nXG4gICAgICAgICAgc3BsaXQgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgICByZXN0ICs9ICcvJztcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaGFzSGFzaCAmJiBjb2RlID09PSAzNSAvKiMqLykge1xuICAgICAgaGFzSGFzaCA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgaWYgc3RyaW5nIHdhcyBub24tZW1wdHkgKGluY2x1ZGluZyBzdHJpbmdzIHdpdGggb25seSB3aGl0ZXNwYWNlKVxuICBpZiAoc3RhcnQgIT09IC0xKSB7XG4gICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAvLyBXZSBkaWRuJ3QgY29udmVydCBhbnkgYmFja3NsYXNoZXNcblxuICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSByZXN0ID0gdXJsO1xuICAgICAgICBlbHNlIHJlc3QgPSB1cmwuc2xpY2Uoc3RhcnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdCA9IHVybC5zbGljZShzdGFydCwgZW5kKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVuZCA9PT0gLTEgJiYgbGFzdFBvcyA8IHVybC5sZW5ndGgpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcyk7XG4gICAgfSBlbHNlIGlmIChlbmQgIT09IC0xICYmIGxhc3RQb3MgPCBlbmQpIHtcbiAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgcmVzdCArPSB1cmwuc2xpY2UobGFzdFBvcywgZW5kKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXNsYXNoZXNEZW5vdGVIb3N0ICYmICFoYXNIYXNoKSB7XG4gICAgLy8gVHJ5IGZhc3QgcGF0aCByZWdleHBcbiAgICBjb25zdCBzaW1wbGVQYXRoID0gc2ltcGxlUGF0aFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgICBpZiAoc2ltcGxlUGF0aCkge1xuICAgICAgdGhpcy5wYXRoID0gcmVzdDtcbiAgICAgIHRoaXMuaHJlZiA9IHJlc3Q7XG4gICAgICB0aGlzLnBhdGhuYW1lID0gc2ltcGxlUGF0aFsxXTtcbiAgICAgIGlmIChzaW1wbGVQYXRoWzJdKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gc2ltcGxlUGF0aFsyXTtcbiAgICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgICB0aGlzLnF1ZXJ5ID0gcXVlcnlzdHJpbmcucGFyc2UodGhpcy5zZWFyY2guc2xpY2UoMSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSB0aGlzLnNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgfVxuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zbGljZShwcm90by5sZW5ndGgpO1xuICB9XG5cbiAgLy8gZmlndXJlIG91dCBpZiBpdCdzIGdvdCBhIGhvc3RcbiAgLy8gdXNlckBzZXJ2ZXIgaXMgKmFsd2F5cyogaW50ZXJwcmV0ZWQgYXMgYSBob3N0bmFtZSwgYW5kIHVybFxuICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gIC8vIGhvdyB0aGUgYnJvd3NlciByZXNvbHZlcyByZWxhdGl2ZSBVUkxzLlxuICBpZiAoc2xhc2hlc0Rlbm90ZUhvc3QgfHwgcHJvdG8gfHwgL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8udGVzdChyZXN0KSkge1xuICAgIHZhciBzbGFzaGVzID0gcmVzdC5jaGFyQ29kZUF0KDApID09PSA0NyAvKi8qLyAmJiByZXN0LmNoYXJDb2RlQXQoMSkgPT09IDQ3OyAvKi8qL1xuICAgIGlmIChzbGFzaGVzICYmICEocHJvdG8gJiYgaG9zdGxlc3NQcm90b2NvbFtwcm90b10pKSB7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZSgyKTtcbiAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJiAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKSkge1xuICAgIC8vIHRoZXJlJ3MgYSBob3N0bmFtZS5cbiAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgIC8vXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAvLyBVUkxzIGFyZSBvYm5veGlvdXMuXG4gICAgLy9cbiAgICAvLyBleDpcbiAgICAvLyBodHRwOi8vYUBiQGMvID0+IHVzZXI6YUBiIGhvc3Q6Y1xuICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YiBwYXRoOi8/QGNcblxuICAgIC8vIHYwLjEyIFRPRE8oaXNhYWNzKTogVGhpcyBpcyBub3QgcXVpdGUgaG93IENocm9tZSBkb2VzIHRoaW5ncy5cbiAgICAvLyBSZXZpZXcgb3VyIHRlc3QgY2FzZSBhZ2FpbnN0IGJyb3dzZXJzIG1vcmUgY29tcHJlaGVuc2l2ZWx5LlxuXG4gICAgdmFyIGhvc3RFbmQgPSAtMTtcbiAgICB2YXIgYXRTaWduID0gLTE7XG4gICAgdmFyIG5vbkhvc3QgPSAtMTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgICAgc3dpdGNoIChyZXN0LmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgICAgY2FzZSA5OiAvLyAnXFx0J1xuICAgICAgICBjYXNlIDEwOiAvLyAnXFxuJ1xuICAgICAgICBjYXNlIDEzOiAvLyAnXFxyJ1xuICAgICAgICBjYXNlIDMyOiAvLyAnICdcbiAgICAgICAgY2FzZSAzNDogLy8gJ1wiJ1xuICAgICAgICBjYXNlIDM3OiAvLyAnJSdcbiAgICAgICAgY2FzZSAzOTogLy8gJ1xcJydcbiAgICAgICAgY2FzZSA1OTogLy8gJzsnXG4gICAgICAgIGNhc2UgNjA6IC8vICc8J1xuICAgICAgICBjYXNlIDYyOiAvLyAnPidcbiAgICAgICAgY2FzZSA5MjogLy8gJ1xcXFwnXG4gICAgICAgIGNhc2UgOTQ6IC8vICdeJ1xuICAgICAgICBjYXNlIDk2OiAvLyAnYCdcbiAgICAgICAgY2FzZSAxMjM6IC8vICd7J1xuICAgICAgICBjYXNlIDEyNDogLy8gJ3wnXG4gICAgICAgIGNhc2UgMTI1OiAvLyAnfSdcbiAgICAgICAgICAvLyBDaGFyYWN0ZXJzIHRoYXQgYXJlIG5ldmVyIGV2ZXIgYWxsb3dlZCBpbiBhIGhvc3RuYW1lIGZyb20gUkZDIDIzOTZcbiAgICAgICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIG5vbkhvc3QgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM1OiAvLyAnIydcbiAgICAgICAgY2FzZSA0NzogLy8gJy8nXG4gICAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluc3RhbmNlIG9mIGFueSBob3N0LWVuZGluZyBjaGFyYWN0ZXJzXG4gICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSBub25Ib3N0ID0gaTtcbiAgICAgICAgICBob3N0RW5kID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA2NDogLy8gJ0AnXG4gICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCwgZWl0aGVyIHdlIGhhdmUgYW4gZXhwbGljaXQgcG9pbnQgd2hlcmUgdGhlXG4gICAgICAgICAgLy8gYXV0aCBwb3J0aW9uIGNhbm5vdCBnbyBwYXN0LCBvciB0aGUgbGFzdCBAIGNoYXIgaXMgdGhlIGRlY2lkZXIuXG4gICAgICAgICAgYXRTaWduID0gaTtcbiAgICAgICAgICBub25Ib3N0ID0gLTE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaG9zdEVuZCAhPT0gLTEpIGJyZWFrO1xuICAgIH1cbiAgICBzdGFydCA9IDA7XG4gICAgaWYgKGF0U2lnbiAhPT0gLTEpIHtcbiAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChyZXN0LnNsaWNlKDAsIGF0U2lnbikpO1xuICAgICAgc3RhcnQgPSBhdFNpZ24gKyAxO1xuICAgIH1cbiAgICBpZiAobm9uSG9zdCA9PT0gLTEpIHtcbiAgICAgIHRoaXMuaG9zdCA9IHJlc3Quc2xpY2Uoc3RhcnQpO1xuICAgICAgcmVzdCA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKHN0YXJ0LCBub25Ib3N0KTtcbiAgICAgIHJlc3QgPSByZXN0LnNsaWNlKG5vbkhvc3QpO1xuICAgIH1cblxuICAgIC8vIHB1bGwgb3V0IHBvcnQuXG4gICAgdGhpcy5wYXJzZUhvc3QoKTtcblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICBpZiAodHlwZW9mIHRoaXMuaG9zdG5hbWUgIT09ICdzdHJpbmcnKSB0aGlzLmhvc3RuYW1lID0gJyc7XG5cbiAgICB2YXIgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID1cbiAgICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IDkxIC8qWyovICYmIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IDkzOyAvKl0qL1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZhbGlkYXRlSG9zdG5hbWUodGhpcywgcmVzdCwgaG9zdG5hbWUpO1xuICAgICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55Y29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgIC8vIEl0IG9ubHkgY29udmVydHMgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAgIC8vIGhhdmUgbm9uLUFTQ0lJIGNoYXJhY3RlcnMsIGkuZS4gaXQgZG9lc24ndCBtYXR0ZXIgaWZcbiAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIEFTQ0lJLW9ubHkuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gcHVueWNvZGUudG9BU0NJSSh0aGlzLmhvc3RuYW1lKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnNsaWNlKDEsIC0xKTtcbiAgICAgIGlmIChyZXN0WzBdICE9PSAnLycpIHtcbiAgICAgICAgcmVzdCA9ICcvJyArIHJlc3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbm93IHJlc3QgaXMgc2V0IHRvIHRoZSBwb3N0LWhvc3Qgc3R1ZmYuXG4gIC8vIGNob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgaWYgKCF1bnNhZmVQcm90b2NvbFtsb3dlclByb3RvXSkge1xuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGNvbnN0IHJlc3VsdCA9IGF1dG9Fc2NhcGVTdHIocmVzdCk7XG4gICAgaWYgKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSByZXN0ID0gcmVzdWx0O1xuICB9XG5cbiAgdmFyIHF1ZXN0aW9uSWR4ID0gLTE7XG4gIHZhciBoYXNoSWR4ID0gLTE7XG4gIGZvciAoaSA9IDA7IGkgPCByZXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgY29kZSA9IHJlc3QuY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gMzUgLyojKi8pIHtcbiAgICAgIHRoaXMuaGFzaCA9IHJlc3Quc2xpY2UoaSk7XG4gICAgICBoYXNoSWR4ID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gNjMgLyo/Ki8gJiYgcXVlc3Rpb25JZHggPT09IC0xKSB7XG4gICAgICBxdWVzdGlvbklkeCA9IGk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXN0aW9uSWR4ICE9PSAtMSkge1xuICAgIGlmIChoYXNoSWR4ID09PSAtMSkge1xuICAgICAgdGhpcy5zZWFyY2ggPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4KTtcbiAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCwgaGFzaElkeCk7XG4gICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEsIGhhc2hJZHgpO1xuICAgIH1cbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgLy8gbm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgIHRoaXMucXVlcnkgPSB7fTtcbiAgfVxuXG4gIHZhciBmaXJzdElkeCA9XG4gICAgcXVlc3Rpb25JZHggIT09IC0xICYmIChoYXNoSWR4ID09PSAtMSB8fCBxdWVzdGlvbklkeCA8IGhhc2hJZHgpID8gcXVlc3Rpb25JZHggOiBoYXNoSWR4O1xuICBpZiAoZmlyc3RJZHggPT09IC0xKSB7XG4gICAgaWYgKHJlc3QubGVuZ3RoID4gMCkgdGhpcy5wYXRobmFtZSA9IHJlc3Q7XG4gIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9IHJlc3Quc2xpY2UoMCwgZmlyc3RJZHgpO1xuICB9XG4gIGlmIChzbGFzaGVkUHJvdG9jb2xbbG93ZXJQcm90b10gJiYgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICBpZiAodGhpcy5wYXRobmFtZSB8fCB0aGlzLnNlYXJjaCkge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIGNvbnN0IHMgPSB0aGlzLnNlYXJjaCB8fCAnJztcbiAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgfVxuXG4gIC8vIGZpbmFsbHksIHJlY29uc3RydWN0IHRoZSBocmVmIGJhc2VkIG9uIHdoYXQgaGFzIGJlZW4gdmFsaWRhdGVkLlxuICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKHNlbGYsIHJlc3QsIGhvc3RuYW1lKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsYXN0UG9zOyBpIDw9IGhvc3RuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGNvZGU7XG4gICAgaWYgKGkgPCBob3N0bmFtZS5sZW5ndGgpIGNvZGUgPSBob3N0bmFtZS5jaGFyQ29kZUF0KGkpO1xuICAgIGlmIChjb2RlID09PSA0NiAvKi4qLyB8fCBpID09PSBob3N0bmFtZS5sZW5ndGgpIHtcbiAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHtcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gNjMpIHtcbiAgICAgICAgICBzZWxmLmhvc3RuYW1lID0gaG9zdG5hbWUuc2xpY2UoMCwgbGFzdFBvcyArIDYzKTtcbiAgICAgICAgICByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UobGFzdFBvcyArIDYzKSArIHJlc3Q7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICAoY29kZSA+PSA0OCAvKjAqLyAmJiBjb2RlIDw9IDU3KSAvKjkqLyB8fFxuICAgICAgKGNvZGUgPj0gOTcgLyphKi8gJiYgY29kZSA8PSAxMjIpIC8qeiovIHx8XG4gICAgICBjb2RlID09PSA0NSAvKi0qLyB8fFxuICAgICAgKGNvZGUgPj0gNjUgLypBKi8gJiYgY29kZSA8PSA5MCkgLypaKi8gfHxcbiAgICAgIGNvZGUgPT09IDQzIC8qKyovIHx8XG4gICAgICBjb2RlID09PSA5NSAvKl8qLyB8fFxuICAgICAgLyogQkVHSU4gTU9OR08gVVJJIFBBVENIICovXG4gICAgICBjb2RlID09PSA0NCAvKiwqLyB8fFxuICAgICAgY29kZSA9PT0gNTggLyo6Ki8gfHxcbiAgICAgIC8qIEVORCBNT05HTyBVUkkgUEFUQ0ggKi9cbiAgICAgIGNvZGUgPiAxMjdcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICAvLyBJbnZhbGlkIGhvc3QgY2hhcmFjdGVyXG4gICAgc2VsZi5ob3N0bmFtZSA9IGhvc3RuYW1lLnNsaWNlKDAsIGkpO1xuICAgIGlmIChpIDwgaG9zdG5hbWUubGVuZ3RoKSByZXR1cm4gJy8nICsgaG9zdG5hbWUuc2xpY2UoaSkgKyByZXN0O1xuICAgIGJyZWFrO1xuICB9XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBhdXRvRXNjYXBlU3RyKHJlc3QpIHtcbiAgdmFyIG5ld1Jlc3QgPSAnJztcbiAgdmFyIGxhc3RQb3MgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAvLyBBdXRvbWF0aWNhbGx5IGVzY2FwZSBhbGwgZGVsaW1pdGVycyBhbmQgdW53aXNlIGNoYXJhY3RlcnMgZnJvbSBSRkMgMjM5NlxuICAgIC8vIEFsc28gZXNjYXBlIHNpbmdsZSBxdW90ZXMgaW4gY2FzZSBvZiBhbiBYU1MgYXR0YWNrXG4gICAgc3dpdGNoIChyZXN0LmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgIGNhc2UgOTogLy8gJ1xcdCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMDknO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMDogLy8gJ1xcbidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMEEnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMzogLy8gJ1xccidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMEQnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzMjogLy8gJyAnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTIwJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzQ6IC8vICdcIidcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjInO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOTogLy8gJ1xcJydcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclMjcnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA2MDogLy8gJzwnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTNDJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjI6IC8vICc+J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyUzRSc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDkyOiAvLyAnXFxcXCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclNUMnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSA5NDogLy8gJ14nXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTVFJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgOTY6IC8vICdgJ1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU2MCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDEyMzogLy8gJ3snXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1Jlc3QgKz0gcmVzdC5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UmVzdCArPSAnJTdCJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMTI0OiAvLyAnfCdcbiAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkgbmV3UmVzdCArPSByZXN0LnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdSZXN0ICs9ICclN0MnO1xuICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxMjU6IC8vICd9J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdSZXN0ICs9IHJlc3Quc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgIG5ld1Jlc3QgKz0gJyU3RCc7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID09PSAwKSByZXR1cm47XG4gIGlmIChsYXN0UG9zIDwgcmVzdC5sZW5ndGgpIHJldHVybiBuZXdSZXN0ICsgcmVzdC5zbGljZShsYXN0UG9zKTtcbiAgZWxzZSByZXR1cm4gbmV3UmVzdDtcbn1cblxuLy8gZm9ybWF0IGEgcGFyc2VkIG9iamVjdCBpbnRvIGEgdXJsIHN0cmluZ1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybEZvcm1hdChvYmopIHtcbiAgLy8gZW5zdXJlIGl0J3MgYW4gb2JqZWN0LCBhbmQgbm90IGEgc3RyaW5nIHVybC5cbiAgLy8gSWYgaXQncyBhbiBvYmosIHRoaXMgaXMgYSBuby1vcC5cbiAgLy8gdGhpcyB3YXksIHlvdSBjYW4gY2FsbCB1cmxfZm9ybWF0KCkgb24gc3RyaW5nc1xuICAvLyB0byBjbGVhbiB1cCBwb3RlbnRpYWxseSB3b25reSB1cmxzLlxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ3N0cmluZycpIG9iaiA9IHVybFBhcnNlKG9iaik7XG4gIGVsc2UgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgJ1BhcmFtZXRlciBcInVybE9ialwiIG11c3QgYmUgYW4gb2JqZWN0LCBub3QgJyArIG9iaiA9PT0gbnVsbCA/ICdudWxsJyA6IHR5cGVvZiBvYmpcbiAgICApO1xuICBlbHNlIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG5cbiAgcmV0dXJuIG9iai5mb3JtYXQoKTtcbn1cblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlQXV0aChhdXRoKTtcbiAgICBhdXRoICs9ICdAJztcbiAgfVxuXG4gIHZhciBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgJyc7XG4gIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gIHZhciBoYXNoID0gdGhpcy5oYXNoIHx8ICcnO1xuICB2YXIgaG9zdCA9IGZhbHNlO1xuICB2YXIgcXVlcnkgPSAnJztcblxuICBpZiAodGhpcy5ob3N0KSB7XG4gICAgaG9zdCA9IGF1dGggKyB0aGlzLmhvc3Q7XG4gIH0gZWxzZSBpZiAodGhpcy5ob3N0bmFtZSkge1xuICAgIGhvc3QgPSBhdXRoICsgKHRoaXMuaG9zdG5hbWUuaW5kZXhPZignOicpID09PSAtMSA/IHRoaXMuaG9zdG5hbWUgOiAnWycgKyB0aGlzLmhvc3RuYW1lICsgJ10nKTtcbiAgICBpZiAodGhpcy5wb3J0KSB7XG4gICAgICBob3N0ICs9ICc6JyArIHRoaXMucG9ydDtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSAhPT0gbnVsbCAmJiB0eXBlb2YgdGhpcy5xdWVyeSA9PT0gJ29iamVjdCcpXG4gICAgcXVlcnkgPSBxdWVyeXN0cmluZy5zdHJpbmdpZnkodGhpcy5xdWVyeSk7XG5cbiAgdmFyIHNlYXJjaCA9IHRoaXMuc2VhcmNoIHx8IChxdWVyeSAmJiAnPycgKyBxdWVyeSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDU4IC8qOiovKSBwcm90b2NvbCArPSAnOic7XG5cbiAgdmFyIG5ld1BhdGhuYW1lID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRobmFtZS5sZW5ndGg7ICsraSkge1xuICAgIHN3aXRjaCAocGF0aG5hbWUuY2hhckNvZGVBdChpKSkge1xuICAgICAgY2FzZSAzNTogLy8gJyMnXG4gICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIG5ld1BhdGhuYW1lICs9IHBhdGhuYW1lLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICBuZXdQYXRobmFtZSArPSAnJTIzJztcbiAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgNjM6IC8vICc/J1xuICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgbmV3UGF0aG5hbWUgKz0gJyUzRic7XG4gICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0UG9zID4gMCkge1xuICAgIGlmIChsYXN0UG9zICE9PSBwYXRobmFtZS5sZW5ndGgpIHBhdGhuYW1lID0gbmV3UGF0aG5hbWUgKyBwYXRobmFtZS5zbGljZShsYXN0UG9zKTtcbiAgICBlbHNlIHBhdGhuYW1lID0gbmV3UGF0aG5hbWU7XG4gIH1cblxuICAvLyBvbmx5IHRoZSBzbGFzaGVkUHJvdG9jb2xzIGdldCB0aGUgLy8uICBOb3QgbWFpbHRvOiwgeG1wcDosIGV0Yy5cbiAgLy8gdW5sZXNzIHRoZXkgaGFkIHRoZW0gdG8gYmVnaW4gd2l0aC5cbiAgaWYgKHRoaXMuc2xhc2hlcyB8fCAoKCFwcm90b2NvbCB8fCBzbGFzaGVkUHJvdG9jb2xbcHJvdG9jb2xdKSAmJiBob3N0ICE9PSBmYWxzZSkpIHtcbiAgICBob3N0ID0gJy8vJyArIChob3N0IHx8ICcnKTtcbiAgICBpZiAocGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gNDcgLyovKi8pIHBhdGhuYW1lID0gJy8nICsgcGF0aG5hbWU7XG4gIH0gZWxzZSBpZiAoIWhvc3QpIHtcbiAgICBob3N0ID0gJyc7XG4gIH1cblxuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICBpZiAoaGFzaCAmJiBoYXNoLmNoYXJDb2RlQXQoMCkgIT09IDM1IC8qIyovKSBoYXNoID0gJyMnICsgaGFzaDtcbiAgaWYgKHNlYXJjaCAmJiBzZWFyY2guY2hhckNvZGVBdCgwKSAhPT0gNjMgLyo/Ki8pIHNlYXJjaCA9ICc/JyArIHNlYXJjaDtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cbmZ1bmN0aW9uIHVybFJlc29sdmUoc291cmNlLCByZWxhdGl2ZSkge1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZShyZWxhdGl2ZSk7XG59XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5VcmwucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiAocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiB1cmxSZXNvbHZlT2JqZWN0KHNvdXJjZSwgcmVsYXRpdmUpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHVybFBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gKHJlbGF0aXZlKSB7XG4gIGlmICh0eXBlb2YgcmVsYXRpdmUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFyIHJlbCA9IG5ldyBVcmwoKTtcbiAgICByZWwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKTtcbiAgICByZWxhdGl2ZSA9IHJlbDtcbiAgfVxuXG4gIHZhciByZXN1bHQgPSBuZXcgVXJsKCk7XG4gIHZhciB0a2V5cyA9IE9iamVjdC5rZXlzKHRoaXMpO1xuICBmb3IgKHZhciB0ayA9IDA7IHRrIDwgdGtleXMubGVuZ3RoOyB0aysrKSB7XG4gICAgdmFyIHRrZXkgPSB0a2V5c1t0a107XG4gICAgcmVzdWx0W3RrZXldID0gdGhpc1t0a2V5XTtcbiAgfVxuXG4gIC8vIGhhc2ggaXMgYWx3YXlzIG92ZXJyaWRkZW4sIG5vIG1hdHRlciB3aGF0LlxuICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgcmVzdWx0Lmhhc2ggPSByZWxhdGl2ZS5oYXNoO1xuXG4gIC8vIGlmIHRoZSByZWxhdGl2ZSB1cmwgaXMgZW1wdHksIHRoZW4gdGhlcmUncyBub3RoaW5nIGxlZnQgdG8gZG8gaGVyZS5cbiAgaWYgKHJlbGF0aXZlLmhyZWYgPT09ICcnKSB7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAvLyB0YWtlIGV2ZXJ5dGhpbmcgZXhjZXB0IHRoZSBwcm90b2NvbCBmcm9tIHJlbGF0aXZlXG4gICAgdmFyIHJrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgIGZvciAodmFyIHJrID0gMDsgcmsgPCBya2V5cy5sZW5ndGg7IHJrKyspIHtcbiAgICAgIHZhciBya2V5ID0gcmtleXNbcmtdO1xuICAgICAgaWYgKHJrZXkgIT09ICdwcm90b2NvbCcpIHJlc3VsdFtya2V5XSA9IHJlbGF0aXZlW3JrZXldO1xuICAgIH1cblxuICAgIC8vdXJsUGFyc2UgYXBwZW5kcyB0cmFpbGluZyAvIHRvIHVybHMgbGlrZSBodHRwOi8vd3d3LmV4YW1wbGUuY29tXG4gICAgaWYgKHNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdICYmIHJlc3VsdC5ob3N0bmFtZSAmJiAhcmVzdWx0LnBhdGhuYW1lKSB7XG4gICAgICByZXN1bHQucGF0aCA9IHJlc3VsdC5wYXRobmFtZSA9ICcvJztcbiAgICB9XG5cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKHJlbGF0aXZlLnByb3RvY29sICYmIHJlbGF0aXZlLnByb3RvY29sICE9PSByZXN1bHQucHJvdG9jb2wpIHtcbiAgICAvLyBpZiBpdCdzIGEga25vd24gdXJsIHByb3RvY29sLCB0aGVuIGNoYW5naW5nXG4gICAgLy8gdGhlIHByb3RvY29sIGRvZXMgd2VpcmQgdGhpbmdzXG4gICAgLy8gZmlyc3QsIGlmIGl0J3Mgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgLy8gYW5kIGlmIHRoZXJlIHdhcyBhIHBhdGhcbiAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAvLyBiZWNhdXNlIHRoYXQncyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAvLyBhbnl0aGluZyBlbHNlIGlzIGFzc3VtZWQgdG8gYmUgYWJzb2x1dGUuXG4gICAgaWYgKCFzbGFzaGVkUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICAgIGZvciAodmFyIHYgPSAwOyB2IDwga2V5cy5sZW5ndGg7IHYrKykge1xuICAgICAgICB2YXIgayA9IGtleXNbdl07XG4gICAgICAgIHJlc3VsdFtrXSA9IHJlbGF0aXZlW2tdO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmIChcbiAgICAgICFyZWxhdGl2ZS5ob3N0ICYmXG4gICAgICAhL15maWxlOj8kLy50ZXN0KHJlbGF0aXZlLnByb3RvY29sKSAmJlxuICAgICAgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdXG4gICAgKSB7XG4gICAgICBjb25zdCByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJztcbiAgdmFyIGlzUmVsQWJzID0gcmVsYXRpdmUuaG9zdCB8fCAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpO1xuICB2YXIgbXVzdEVuZEFicyA9IGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8IChyZXN1bHQuaG9zdCAmJiByZWxhdGl2ZS5wYXRobmFtZSk7XG4gIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcbiAgdmFyIHNyY1BhdGggPSAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdCgnLycpKSB8fCBbXTtcbiAgdmFyIHJlbFBhdGggPSAocmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSkgfHwgW107XG4gIHZhciBwc3ljaG90aWMgPSByZXN1bHQucHJvdG9jb2wgJiYgIXNsYXNoZWRQcm90b2NvbFtyZXN1bHQucHJvdG9jb2xdO1xuXG4gIC8vIGlmIHRoZSB1cmwgaXMgYSBub24tc2xhc2hlZCB1cmwsIHRoZW4gcmVsYXRpdmVcbiAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gIC8vIHJlc3VsdC5wcm90b2NvbCBoYXMgYWxyZWFkeSBiZWVuIHNldCBieSBub3cuXG4gIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gJyc7XG4gICAgcmVzdWx0LnBvcnQgPSBudWxsO1xuICAgIGlmIChyZXN1bHQuaG9zdCkge1xuICAgICAgaWYgKHNyY1BhdGhbMF0gPT09ICcnKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgfVxuICAgIHJlc3VsdC5ob3N0ID0gJyc7XG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IG51bGw7XG4gICAgICByZWxhdGl2ZS5wb3J0ID0gbnVsbDtcbiAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgIGlmIChyZWxQYXRoWzBdID09PSAnJykgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgfVxuICAgICAgcmVsYXRpdmUuaG9zdCA9IG51bGw7XG4gICAgfVxuICAgIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzICYmIChyZWxQYXRoWzBdID09PSAnJyB8fCBzcmNQYXRoWzBdID09PSAnJyk7XG4gIH1cblxuICBpZiAoaXNSZWxBYnMpIHtcbiAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJyA/IHJlbGF0aXZlLmhvc3QgOiByZXN1bHQuaG9zdDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPVxuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdG5hbWUgPT09ICcnID8gcmVsYXRpdmUuaG9zdG5hbWUgOiByZXN1bHQuaG9zdG5hbWU7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAvLyBmYWxsIHRocm91Z2ggdG8gdGhlIGRvdC1oYW5kbGluZyBiZWxvdy5cbiAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgIC8vIGl0J3MgcmVsYXRpdmVcbiAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICBpZiAoIXNyY1BhdGgpIHNyY1BhdGggPSBbXTtcbiAgICBzcmNQYXRoLnBvcCgpO1xuICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCAhPT0gbnVsbCAmJiByZWxhdGl2ZS5zZWFyY2ggIT09IHVuZGVmaW5lZCkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgLy91cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICAgIGNvbnN0IGF1dGhJbkhvc3QgPVxuICAgICAgICByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArIChyZXN1bHQuc2VhcmNoID8gcmVzdWx0LnNlYXJjaCA6ICcnKTtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBubyBwYXRoIGF0IGFsbC4gIGVhc3kuXG4gICAgLy8gd2UndmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAocmVzdWx0LnNlYXJjaCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAnLycgKyByZXN1bHQuc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gIC8vIHRoZW4gaXQgbXVzdCBOT1QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gIHZhciBoYXNUcmFpbGluZ1NsYXNoID1cbiAgICAoKHJlc3VsdC5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgfHwgc3JjUGF0aC5sZW5ndGggPiAxKSAmJiAobGFzdCA9PT0gJy4nIHx8IGxhc3QgPT09ICcuLicpKSB8fFxuICAgIGxhc3QgPT09ICcnO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHNwbGljZU9uZShzcmNQYXRoLCBpKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3BsaWNlT25lKHNyY1BhdGgsIGkpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09ICcnICYmICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiBzcmNQYXRoLmpvaW4oJy8nKS5zdWJzdHIoLTEpICE9PSAnLycpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSAnJyB8fCAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgaWYgKGlzQWJzb2x1dGUpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiAnJztcbiAgICB9XG4gICAgLy9vY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3RcbiAgICAvL3RoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgIGNvbnN0IGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID8gcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgIH1cbiAgfVxuXG4gIG11c3RFbmRBYnMgPSBtdXN0RW5kQWJzIHx8IChyZXN1bHQuaG9zdCAmJiBzcmNQYXRoLmxlbmd0aCk7XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdC5wYXRobmFtZSA9IHNyY1BhdGguam9pbignLycpO1xuICB9XG5cbiAgLy90byBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICBpZiAocmVzdWx0LnBhdGhuYW1lICE9PSBudWxsIHx8IHJlc3VsdC5zZWFyY2ggIT09IG51bGwpIHtcbiAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgKyAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyogaXN0YW5idWwgaWdub3JlIG5leHQ6IGltcHJvdmUgY292ZXJhZ2UgKi9cblVybC5wcm90b3R5cGUucGFyc2VIb3N0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaG9zdCA9IHRoaXMuaG9zdDtcbiAgdmFyIHBvcnQgPSBwb3J0UGF0dGVybi5leGVjKGhvc3QpO1xuICBpZiAocG9ydCkge1xuICAgIHBvcnQgPSBwb3J0WzBdO1xuICAgIGlmIChwb3J0ICE9PSAnOicpIHtcbiAgICAgIHRoaXMucG9ydCA9IHBvcnQuc2xpY2UoMSk7XG4gICAgfVxuICAgIGhvc3QgPSBob3N0LnNsaWNlKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbi8vIEFib3V0IDEuNXggZmFzdGVyIHRoYW4gdGhlIHR3by1hcmcgdmVyc2lvbiBvZiBBcnJheSNzcGxpY2UoKS5cbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0OiBpbXByb3ZlIGNvdmVyYWdlICovXG5mdW5jdGlvbiBzcGxpY2VPbmUobGlzdCwgaW5kZXgpIHtcbiAgZm9yICh2YXIgaSA9IGluZGV4LCBrID0gaSArIDEsIG4gPSBsaXN0Lmxlbmd0aDsgayA8IG47IGkgKz0gMSwgayArPSAxKSBsaXN0W2ldID0gbGlzdFtrXTtcbiAgbGlzdC5wb3AoKTtcbn1cblxudmFyIGhleFRhYmxlID0gbmV3IEFycmF5KDI1Nik7XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgKytpKVxuICBoZXhUYWJsZVtpXSA9ICclJyArICgoaSA8IDE2ID8gJzAnIDogJycpICsgaS50b1N0cmluZygxNikpLnRvVXBwZXJDYXNlKCk7XG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dDogaW1wcm92ZSBjb3ZlcmFnZSAqL1xuZnVuY3Rpb24gZW5jb2RlQXV0aChzdHIpIHtcbiAgLy8gZmFzdGVyIGVuY29kZVVSSUNvbXBvbmVudCBhbHRlcm5hdGl2ZSBmb3IgZW5jb2RpbmcgYXV0aCB1cmkgY29tcG9uZW50c1xuICB2YXIgb3V0ID0gJyc7XG4gIHZhciBsYXN0UG9zID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgLy8gVGhlc2UgY2hhcmFjdGVycyBkbyBub3QgbmVlZCBlc2NhcGluZzpcbiAgICAvLyAhIC0gLiBfIH5cbiAgICAvLyAnICggKSAqIDpcbiAgICAvLyBkaWdpdHNcbiAgICAvLyBhbHBoYSAodXBwZXJjYXNlKVxuICAgIC8vIGFscGhhIChsb3dlcmNhc2UpXG4gICAgaWYgKFxuICAgICAgYyA9PT0gMHgyMSB8fFxuICAgICAgYyA9PT0gMHgyZCB8fFxuICAgICAgYyA9PT0gMHgyZSB8fFxuICAgICAgYyA9PT0gMHg1ZiB8fFxuICAgICAgYyA9PT0gMHg3ZSB8fFxuICAgICAgKGMgPj0gMHgyNyAmJiBjIDw9IDB4MmEpIHx8XG4gICAgICAoYyA+PSAweDMwICYmIGMgPD0gMHgzYSkgfHxcbiAgICAgIChjID49IDB4NDEgJiYgYyA8PSAweDVhKSB8fFxuICAgICAgKGMgPj0gMHg2MSAmJiBjIDw9IDB4N2EpXG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSBvdXQgKz0gc3RyLnNsaWNlKGxhc3RQb3MsIGkpO1xuXG4gICAgbGFzdFBvcyA9IGkgKyAxO1xuXG4gICAgLy8gT3RoZXIgQVNDSUkgY2hhcmFjdGVyc1xuICAgIGlmIChjIDwgMHg4MCkge1xuICAgICAgb3V0ICs9IGhleFRhYmxlW2NdO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gTXVsdGktYnl0ZSBjaGFyYWN0ZXJzIC4uLlxuICAgIGlmIChjIDwgMHg4MDApIHtcbiAgICAgIG91dCArPSBoZXhUYWJsZVsweGMwIHwgKGMgPj4gNildICsgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjIDwgMHhkODAwIHx8IGMgPj0gMHhlMDAwKSB7XG4gICAgICBvdXQgKz1cbiAgICAgICAgaGV4VGFibGVbMHhlMCB8IChjID4+IDEyKV0gK1xuICAgICAgICBoZXhUYWJsZVsweDgwIHwgKChjID4+IDYpICYgMHgzZildICtcbiAgICAgICAgaGV4VGFibGVbMHg4MCB8IChjICYgMHgzZildO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIC8vIFN1cnJvZ2F0ZSBwYWlyXG4gICAgKytpO1xuICAgIHZhciBjMjtcbiAgICBpZiAoaSA8IHN0ci5sZW5ndGgpIGMyID0gc3RyLmNoYXJDb2RlQXQoaSkgJiAweDNmZjtcbiAgICBlbHNlIGMyID0gMDtcbiAgICBjID0gMHgxMDAwMCArICgoKGMgJiAweDNmZikgPDwgMTApIHwgYzIpO1xuICAgIG91dCArPVxuICAgICAgaGV4VGFibGVbMHhmMCB8IChjID4+IDE4KV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiAxMikgJiAweDNmKV0gK1xuICAgICAgaGV4VGFibGVbMHg4MCB8ICgoYyA+PiA2KSAmIDB4M2YpXSArXG4gICAgICBoZXhUYWJsZVsweDgwIHwgKGMgJiAweDNmKV07XG4gIH1cbiAgaWYgKGxhc3RQb3MgPT09IDApIHJldHVybiBzdHI7XG4gIGlmIChsYXN0UG9zIDwgc3RyLmxlbmd0aCkgcmV0dXJuIG91dCArIHN0ci5zbGljZShsYXN0UG9zKTtcbiAgcmV0dXJuIG91dDtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsWUFBWTs7QUFFWixNQUFNQSxRQUFRLEdBQUdDLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFFcENDLE9BQU8sQ0FBQ0MsS0FBSyxHQUFHQyxRQUFRO0FBQ3hCRixPQUFPLENBQUNHLE9BQU8sR0FBR0MsVUFBVTtBQUM1QkosT0FBTyxDQUFDSyxhQUFhLEdBQUdDLGdCQUFnQjtBQUN4Q04sT0FBTyxDQUFDTyxNQUFNLEdBQUdDLFNBQVM7QUFFMUJSLE9BQU8sQ0FBQ1MsR0FBRyxHQUFHQSxHQUFHO0FBRWpCLFNBQVNBLEdBQUdBLENBQUEsRUFBRztFQUNiLElBQUksQ0FBQ0MsUUFBUSxHQUFHLElBQUk7RUFDcEIsSUFBSSxDQUFDQyxPQUFPLEdBQUcsSUFBSTtFQUNuQixJQUFJ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