'use strict'

var _ = require('./lodash')
var naturalSort = require('javascript-natural-sort');

var aggregators = {
  // Collections
  $sum: $sum,
  $avg: $avg,
  $max: $max,
  $min: $min,

  // Pickers
  $count: $count,
  $first: $first,
  $last: $last,
  $get: $get,
  $nth: $get, // nth is same as using a get
  $nthLast: $nthLast,
  $nthPct: $nthPct,
  $map: $map,
  $sort: $sort,
}


module.exports = {
    makeValueAccessor: makeValueAccessor,
    aggregators: aggregators,
    extractKeyValOrArray: extractKeyValOrArray,
    parseAggregatorParams: parseAggregatorParams,
  }
  // This is used to build aggregation stacks for sub-reductio
  // aggregations, or plucking values for use in filters from the data
function makeValueAccessor(obj) {
  if (typeof(obj) === 'string') {
    // Must be a column key. Return an identity accessor
    return obj
  }
  // Must be a column index. Return an identity accessor
  if (typeof(obj) === 'number') {
    return obj
  }
  // If it's an object, we need to build a custom value accessor function
  if (_.isObject(obj)) {
    return make()
  }

  function make(){
    var stack = makeSubAggregationFunction(obj)
    return function topStack(d){
      return stack(d)
    }
  }
}

// A recursive function that walks the aggregation stack and returns
// a function. The returned function, when called, will recursively invoke
// with the properties from the previous stack in reverse order
function makeSubAggregationFunction(obj) {

  // If its an object, either unwrap all of the properties as an
  // array of keyValues, or unwrap the first keyValue set as an object
  obj = _.isObject(obj) ? extractKeyValOrArray(obj) : obj

  // Detect strings
  if (_.isString(obj)) {
    // If begins with a $, then we need to convert it over to a regular query object and analyze it again
    if (['$', '('].indexOf(obj.charAt(0)) > -1) {
      return makeSubAggregationFunction(convertAggregatorString(obj))
    } else {
      // If normal string, then just return a an itentity accessor
      return function identity(d) {
        return d[obj]
      }
    }
  }


  // If an array, recurse into each item and return as a map
  if (_.isArray(obj)) {
    var subStack = _.map(obj, makeSubAggregationFunction)
    console.log('subStack', subStack)
    return function getSubStack(d) {
      return subStack.map(function(s) {
        return s(d)
      })
    }
  }

  // If object, find the aggregation, and recurse into the value
  if (obj.key) {
    if (aggregators[obj.key]) {
      var subAggregationFunction = makeSubAggregationFunction(obj.value)
      return function getAggregation(d){
        return aggregators[obj.key](subAggregationFunction(d))
      }
    } else {
      console.error('Could not find aggregration method', obj)
    }
  }

  return []
}

function extractKeyValOrArray(obj) {
  var keyVal
  var values = []
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      keyVal = {
        key: key,
        value: obj[key]
      }
      var subObj = {}
      subObj[key] = obj[key]
      values.push(subObj)
    }
  }
  return values.length > 1 ? values : keyVal
}

function parseAggregatorParams(keyString) {
  var params = []
  var p1 = keyString.indexOf('(')
  var p2 = keyString.indexOf(')')
  var key = p1 > -1 ? keyString.substring(0, p1) : keyString
  if (!aggregators[key]) {
    return false
  }
  if (p1 > -1 && p2 > -1 && p2 > p1) {
    params = keyString.substring(p1 + 1, p2).split(',')
  }

  return {
    aggregator: aggregators[key],
    params: params
  }
}

function convertAggregatorString(keyString) {
  var obj = {}

  // 1. unwrap top parentheses
  // 2. detect arrays

  // parentheses
  var outerParens = /\((.+)\)/g
  var innerParens = /\(([^\(\)]+)\)/g
    // comma not in ()
  var freeComma = /(?:\([^\(\)]*\))|(,)/g

  keyString = unwrapParensAndCommas(keyString)

  console.log('END', keyString)

  if (!aggregators[key]) {
    return false
  }
  return {
    key: key,
    value: keyString.substring(p1, keyString.length)
  }
}








// Collection Aggregators

function $sum(children) {
  return children.reduce(function(a, b) {
    return a + b
  })
}

function $avg(children) {
  return children.reduce(function(a, b) {
    return a + b
  }) / children.length
}

function $max(children) {
  return Math.max.apply(null, children)
}

function $min(children) {
  return Math.min.apply(null, children)
}

function $count(children) {
  return children.length
}

function $med(children) {
  children.sort(function(a, b) {
    return a - b
  })
  var half = Math.floor(children.length / 2)
  if (children.length % 2)
    return children[half]
  else
    return (children[half - 1] + children[half]) / 2.0
}

function $first(children) {
  return children[0]
}

function $last(children) {
  return children[children.length - 1]
}

function $get(children, n) {
  return children[n]
}

function $nthLast(children, n) {
  return children[children.length - n]
}

function $nthPct(children, n) {
  return children[Math.round(children.length * (n / 100))]
}

function $map(children, n) {
  return children.map(function(d) {
    return d[n]
  })
}

function $sort(children, n) {
  // Alphanumeric by property
  if (_.isString(n)) {
    children.sort(function sortByKey(a, b) {
      if (a[n] < b[n])
        return -1;
      else if (a[n] > b[n])
        return 1;
      else
        return 0;
    });
  }
  // Numeric by property
  if (_.isNumber(n)) {
    children.sort(function sortByKey(a, b) {
      return a[n] - b[n]
    });
  }
  // Flat, natural sorting
  // Be sure to copy the array as to not mutate the original
  return Array.prototype.slice.call(children).sort(naturalSort)
}
