/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = require('lodash');
var JsonRefs = require('json-refs');
var Operation = require('./operation');
var Parameter = require('./parameter');
var pathToRegexp = require('path-to-regexp');
var supportedHttpMethods = require('swagger-methods');

/**
 * The Path object.
 *
 * **Note:** Do not use directly.
 *
 * **Extra Properties:** Other than the documented properties, this object also exposes all properties of the
 *                       definition object.
 *
 * @param {module:Sway~SwaggerApi} api - The `SwaggerApi` object
 * @param {string} path - The path string
 * @param {object} definition - The path definition *(The raw path definition __after__ remote references were
 *                              resolved)*
 * @param {object} definitionFullyResolved - The path definition with all of its resolvable references resolved
 * @param {string[]} pathToDefinition - The path segments to the path definition
 * @param {string[]} isCaseSensitive - Specifies if to consider the path case sensitive or not
 * @param {string} specPath - The path of the swagger spec
 *
 * @property {module:Sway~SwaggerApi} api - The `SwaggerApi` object
 * @property {object} definition - The path definition *(The raw path definition __after__ remote references were
 *                                 resolved)*
 * @property {object} definitionFullyResolved - The path definition with all of its resolvable references resolved
 * @property {module:Sway~Operation[]} operationObjects - The `Operation` objects
 * @property {module:Sway~Parameter[]} parameterObjects - The path-level `Parameter` objects
 * @property {string} path - The path string
 * @property {string[]} pathToDefinition - The path segments to the path definition
 * @property {ptr} ptr - The JSON Pointer to the path
 * @property {regexp} regexp - The `RegExp` used to match request paths against this path
 * @property {string} specPath - The path of the swagger spec
 *
 * @constructor
 */
function Path (api, path, definition, definitionFullyResolved, pathToDefinition, isCaseSensitive, specPath) {
  var basePathPrefix = api.definitionFullyResolved.basePath || '/';
  var that = this;

  // TODO: We could/should refactor this to use the path module

  // Remove trailing slash from the basePathPrefix so we do not end up with double slashes
  if (basePathPrefix.charAt(basePathPrefix.length - 1) === '/') {
    basePathPrefix = basePathPrefix.substring(0, basePathPrefix.length - 1);
  }

  // Process 'x-ms-parameterized-host' extension if present.
  var xmsParameterizedHost = api.definitionFullyResolved['x-ms-parameterized-host'];
  var hostTemplate = '';

  if (xmsParameterizedHost && xmsParameterizedHost.hostTemplate) {
    hostTemplate = xmsParameterizedHost.hostTemplate;
  }
  this.hostTemplate = hostTemplate;

  // Assign local properties
  this.api = api;
  this.definition = definition;
  this.definitionFullyResolved = definitionFullyResolved;
  this.path = path;
  this.pathToDefinition = pathToDefinition;
  this.ptr = JsonRefs.pathToPtr(pathToDefinition);
  this.regexp = buildRegex(hostTemplate, basePathPrefix, path, isCaseSensitive);
  this.specPath = specPath

  // Whenever the path property is set, the regexp should also be updated accordingly.
  Object.defineProperty(this, 'path', {
    get: function () {
      return path;
    },
    set: function (value) {
      path = value;
      this.regexp = buildRegex(hostTemplate, basePathPrefix, path, isCaseSensitive);
    }
  });

  // Assign local properties from the Swagger definition properties
  _.assign(this, definitionFullyResolved);

  this._debug = this.api._debug;

  this._debug('    %s', this.path);

  this.parameterObjects = _.map(definitionFullyResolved.parameters, function (paramDef, index) {
    var pPath = pathToDefinition.concat(['parameters', index.toString()]);

    return new Parameter(that,
                         _.get(api.definitionRemotesResolved, pPath),
                         paramDef,
                         pPath);
  });

  this._debug('      Operations:');

  this.operationObjects = _.reduce(definitionFullyResolved, function (operations, operationDef, method) {
    var oPath = pathToDefinition.concat(method);

    if (supportedHttpMethods.indexOf(method) > -1) {
      operations.push(new Operation(that, method, _.get(api.definitionRemotesResolved, oPath), operationDef, oPath));
    }

    return operations;
  }, []);
}

/**
 * Builds the regex required for matching the request url against the templated path in the swagger spec.
 * @param {srting} hostTemplate - the host template if any or empty string
 * @param {string} basePathPrefix - the basePathPrefix if any or '/'
 * @param {string} path - the templated path
 * @param {bool} isCaseSensitive - specifies if to use case sensitive comparison or not
 * @returns {object} The pathToRegexp object
 */
function buildRegex (hostTemplate, basePathPrefix, path, isCaseSensitive) {
  hostTemplate = hostTemplate.replace('https://', '');
  hostTemplate = hostTemplate.replace('http://', '');

  let params = []
  let collectParamName = function (regResult) {
    if (regResult) {
      let paramName = regResult.replace('\{', "").replace('\}', "")
      if (params.indexOf(paramName) === -1) {
        params.push(paramName)
      }
    }
  }

  // collect all parameter name
  let regHostParams = hostTemplate.match(/({[\w\-]+})/ig)
  if (regHostParams) {
    regHostParams.forEach(v => collectParamName(v));
  }
  let regPathParams = path.match(/({[\w\-]+})/ig)
  if (regPathParams) {
    regPathParams.forEach(v => collectParamName(v))
  }

  // replace parameter name to index of array
  params.forEach(function (v,i) {
    hostTemplate = hostTemplate.replace('{' + v + '}', '{' + i + '}')
    path = path.replace('{' + v + '}', '{' + i + '}')
  })

  var processedPath = hostTemplate.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\{/g, ':').replace(/\}/g, '')
    + basePathPrefix
    + path.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\{/g, ':').replace(/\}/g, '');

  let sensitiveValue = isCaseSensitive === false ? false : true

  let regexp = pathToRegexp(processedPath, { sensitive: sensitiveValue });

  // restore parameter name
  regexp.keys.forEach(function (v, i) {
    if (params[v.name]) {
      regexp.keys[i].name = params[v.name]
    }
  })
  return regexp
}

/**
 * Return the operation for this path and operation id or method.
 *
 * @param {string} idOrMethod - The operation id or method
 *
 * @returns {module:Sway~Operation[]} The `Operation` objects for this path and method or `undefined` if there is no
 *                                    operation for the provided method
 */
Path.prototype.getOperation = function (idOrMethod) {
  return _.find(this.operationObjects, function (operationObject) {
    return operationObject.operationId === idOrMethod || operationObject.method === idOrMethod.toLowerCase();
  });
};

/**
 * Return the operations for this path.
 *
 * @returns {module:Sway~Operation[]} The `Operation` objects for this path
 */
Path.prototype.getOperations = function () {
  return this.operationObjects;
};

/**
 * Return the operations for this path and tag.
 *
 * @param {string} tag - The tag
 *
 * @returns {module:Sway~Operation[]} The `Operation` objects for this path and tag
 */
Path.prototype.getOperationsByTag = function (tag) {
  return _.filter(this.operationObjects, function (operationObject) {
    return _.includes(operationObject.tags, tag);
  });
};

/**
 * Return the parameters for this path.
 *
 * @returns {module:Sway~Parameter[]} The `Parameter` objects for this path
 */
Path.prototype.getParameters = function () {
  return this.parameterObjects;
};

module.exports = Path;
