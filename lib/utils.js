
var AV = require('leanengine');

var isObject = function(a) {
  return Object.prototype.toString.call( a ) === '[object Object]'
};

var isArray = function(a) {
  return Object.prototype.toString.call( a ) === '[object Array]'
};

var isString = function(obj) {
  return typeof obj === 'string' || obj instanceof String
}

var errorWithStatus = function(message, status) {
  var e = new Error(message);
  e.status = status;
  return e;
}

// Helper functions / methods

Object.defineProperty(Error.prototype, 'toJSON', {
  value: function () {
    var alt = {};

    Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key];
    }, this);

    return alt;
  },
  configurable: true
});

AV.Promise.prototype.toPromise = function() {
  var self = this;
  var p = new Promise(function(resolve, reject) {
    self.then(function() {
      resolve.apply(p, arguments);
    }, function() {
      reject.apply(p, arguments);
    });
  })
  return p;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(searchString, position) {
      var subjectString = this.toString();
      if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
        position = subjectString.length;
      }
      position -= searchString.length;
      var lastIndex = subjectString.indexOf(searchString, position);
      return lastIndex !== -1 && lastIndex === position;
  };
}

module.exports = {
  isObject : isObject,
  isArray : isArray,
  isString : isString,
  errorWithStatus: errorWithStatus,
}

