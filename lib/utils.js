
var isObject = function(a) {
  return Object.prototype.toString.call( a ) === '[object Object]'
};

var isArray = function(a) {
  return Object.prototype.toString.call( a ) === '[object Array]'
};

var isString = function(obj) {
  return typeof obj === 'string' || obj instanceof String
}

module.exports = {
  isObject : isObject,
  isArray : isArray,
  isString : isString
}

