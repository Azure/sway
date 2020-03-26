
'use strict';
var Report = require('z-schema/src/Report');
var ZSchemaValidator = require('z-schema/src/JsonValidation');

function enumValidator (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.5.5.1.2
  if (shouldSkipValidate(this.validateOptions, ['ENUM_CASE_MISMATCH', 'ENUM_MISMATCH'])) {
    return;
  }
  var match = false;
  var idx = schema.enum.length;
  var caseInsensitiveMatch = false;
  var areExtraEnumValuesAllowed = false;

  while (idx--) {
    if (json === schema.enum[idx]) {
      match = true;
      return;
    } else if (
      typeof json === 'string' &&
      typeof schema.enum[idx] === 'string' &&
      json.toUpperCase() === schema.enum[idx].toUpperCase()
    ) {
      caseInsensitiveMatch = true;
    }
  }

  areExtraEnumValuesAllowed = schema['x-ms-enum'] && schema['x-ms-enum'].modelAsString;
  if (caseInsensitiveMatch === true && !shouldSkipValidate(this.validateOptions, ['ENUM_CASE_MISMATCH'])) {
    report.addCustomError(
      'ENUM_CASE_MISMATCH',
      'Enum does not match case for: {0}',
      [json],
      null,
      schema
    );
  } else if (match === false && !areExtraEnumValuesAllowed && !shouldSkipValidate(this.validateOptions, ['ENUM_MISMATCH'])) {
    report.addError('ENUM_MISMATCH', [json], null, schema);
  }
}

function requiredPropertyValidator (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.5.4.3.2
  if (shouldSkipValidate(this.validateOptions, ['OBJECT_MISSING_REQUIRED_PROPERTY'])) {
    return;
  }
  if (
    !(typeof json === 'object' && json === Object(json) && !Array.isArray(json))
  ) {
    return;
  }
  var idx = schema.required.length;
  var requiredPropertyName;
  var xMsMutability;

  while (idx--) {
    requiredPropertyName = schema.required[idx];
    xMsMutability = (schema.properties && schema.properties[`${requiredPropertyName}`]) && schema.properties[`${requiredPropertyName}`]['x-ms-mutability'];

    // If a response has x-ms-mutability property and its missing the read we can skip this step
    if (
      this.validateOptions &&
      this.validateOptions.isResponse &&
      (xMsMutability &&
        xMsMutability.indexOf('read') === -1) 
    ) {
      schema.properties[`${requiredPropertyName}`].isRequired = true;
      continue;
    }
    if (json[requiredPropertyName] === undefined) {
      report.addError(
        'OBJECT_MISSING_REQUIRED_PROPERTY',
        [requiredPropertyName],
        null,
        schema
      );
    }
  }
}

function typeValidator (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.5.5.2.2
  if (schema.type !== 'null' && shouldSkipValidate(this.validateOptions, ['INVALID_TYPE'])) {
    return;
  }
  var jsonType = whatIs(json);
  var xMsMutabilityAllowsNullType = schema['x-ms-mutability'] && schema['x-ms-mutability'].indexOf('read') === -1;
  var isResponse = this.validateOptions && this.validateOptions.isResponse;

  if (isResponse && xMsMutabilityAllowsNullType && schema.isRequired) {
    return;
  }
  if (typeof schema.type === 'string') {
    if (jsonType !== schema.type && (jsonType !== 'integer' || schema.type !== 'number')) {
      report.addError('INVALID_TYPE', [schema.type, jsonType], null, schema);
    }
  } else {
    if (schema.type.indexOf(jsonType) === -1 && (jsonType !== 'integer' || schema.type.indexOf('number') === -1)) {
      report.addError('INVALID_TYPE', [schema.type, jsonType], null, schema);
    }
  }
}

function oneOf (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.5.5.5.2
  var passes = 0,
    subReports = [],
    idx = schema.oneOf.length
  var subReport

  // first check and handle the case of polymporhic oneOf.
  if (validateDiscriminator.call(this, report, schema, json)) {
    return
  }

  while (idx--) {
    subReport = new Report(report, {maxErrors: 1})
    subReports.push(subReport)
    if (ZSchemaValidator.validate.call(this, subReport, schema.oneOf[idx], json) === true) {
      passes++
    }
  }
  if (passes === 0) {
    report.addError('ONE_OF_MISSING', undefined, subReports, schema)
  } else if (passes > 1) {
    report.addError('ONE_OF_MULTIPLE', null, null, schema)
  }
}

function validateDiscriminator (report, schema, json) {
  var basePolymorphicSchema = schema.oneOf.find(
    s => s.__$refResolved && s.__$refResolved.discriminator !== undefined
  );

  // if none of the oneOf subschemas has a discriminator, we are not in a polymorphic oneOf.
  if (!basePolymorphicSchema) {
    return false;
  }
  var discriminatorPropertyName = basePolymorphicSchema.__$refResolved.discriminator;

  // to conform to the Azure specs, we accept a lenient discriminator. if the type is missing in the
  // payload we use the base class. Also if the type doesn't match anything, we use the base class.
  var basePolymorphicSchemaDiscriminatorValue =
    basePolymorphicSchema.__$refResolved.properties[discriminatorPropertyName].enum[0];

    var jsonDiscriminatorValue =
    json[discriminatorPropertyName] ||
    basePolymorphicSchemaDiscriminatorValue;

  var schemaToValidate =
    schema.oneOf.find(
      s =>
        s.__$refResolved &&
        s.__$refResolved.properties[discriminatorPropertyName].enum[0] ===
        jsonDiscriminatorValue
    ) || basePolymorphicSchema;
  
  var isJsonObject = typeof json === 'object' && json !== null && !Array.isArray(json);

  // if the schema to validate is the base schema and the payload is of type object then,
  // we do not need to validate the discriminator enum value.
  if (schemaToValidate === basePolymorphicSchema && isJsonObject) {
    json[discriminatorPropertyName] = basePolymorphicSchemaDiscriminatorValue;
  }
  ZSchemaValidator.validate.call(this, report, schemaToValidate, json);
  return true;
}

function whatIs (what) {
  var to = typeof what;

  if (to === 'object') {
    if (what === null) {
      return 'null';
    }
    if (Array.isArray(what)) {
      return 'array';
    }
    return 'object'; // typeof what === 'object' && what === Object(what) && !Array.isArray(what);
  }

  if (to === 'number') {
    if (Number.isFinite(what)) {
      if (what % 1 === 0) {
        return 'integer';
      } else {
        return 'number';
      }
    }
    if (Number.isNaN(what)) {
      return 'not-a-number';
    }
    return 'unknown-number';
  }
  return to; // undefined, boolean, string, function
}

function shouldSkipValidate (options, errors) {
  return options &&
    Array.isArray(options.includeErrors) &&
    options.includeErrors.length > 0 &&
    !errors.some(function (err) {
      return options.includeErrors.includes(err);
    });
}

function isPropertyWriteOnly (xMsMutability) {
  return xMsMutability && xMsMutability.indexOf('read') === -1 && (xMsMutability.indexOf('create') !== -1 || xMsMutability.indexOf('update') !== -1);
}

function isPropertyReadOnly (xMsMutability) {
  // Detect the setting of xMsMutability['read'] as it also means the readonly property. 
  return xMsMutability && xMsMutability.indexOf('update') === -1 && (xMsMutability.indexOf('create') === -1 && xMsMutability.indexOf('read') !== -1);
}

function checkSecretPropertyInResponse (validateOptions, schema, json, report) {
  if (shouldSkipValidate(validateOptions, ['SECRET_PROPERTY'])) {
    return
  }

  var isResponse = validateOptions && validateOptions.isResponse
  var xMsSecret = schema && schema['x-ms-secret']
  var isXmsSecretTrue = xMsSecret && typeof xMsSecret === 'string' && xMsSecret.toLowerCase() === 'true'

  if (isResponse && schema && isXmsSecretTrue && json !== undefined) {
    let errorMessage = 'Secret property `"{0}": ';

    if (schema && schema.type === 'string' && typeof json === 'string') {
      errorMessage += '"{1}"';
    } else {
      errorMessage += '{1}';
    }
    let propertyName = '';

    if (schema.title && typeof schema.title === 'string') {
      try {
        let result = JSON.parse(schema.title);

        if (Array.isArray(result.path) && result.path.length) {
          propertyName = result.path[result.path.length - 1];
        }
      } catch (err) {
        // do nothing
      }
    }
    errorMessage += '`, cannot be sent in the response.';
    report.addCustomError('SECRET_PROPERTY', errorMessage, [propertyName, json], null, schema);
  }
}

function checkWriteOnlyPropertyInResponse (validateOptions, schema, json, report) {
  // Check if there's a write-only property in the response. 
  // Write-only property definition: Property with 'x-ms-mutability' that does NOT have ['read'] and only has 'create' or 'update' or both
  
  if (shouldSkipValidate(validateOptions, ['WRITEONLY_PROPERTY_NOT_ALLOWED_IN_RESPONSE'])) {
    return
  }

  var isResponse = validateOptions && validateOptions.isResponse
  var xMsMutability = schema && schema['x-ms-mutability']

  if (isResponse && schema && isPropertyWriteOnly(xMsMutability) && json !== undefined) {
    let errorMessage = 'Write-only property `"{0}": ';

    if (schema && schema.type === 'string' && typeof json === 'string') {
      errorMessage += '"{1}"';
    } else {
      errorMessage += '{1}';
    }
    let propertyName = '';

    if (schema.title && typeof schema.title === 'string') {
      try {
        let result = JSON.parse(schema.title);

        if (Array.isArray(result.path) && result.path.length) {
          propertyName = result.path[result.path.length - 1];
        }
      } catch (err) {
        // do nothing
      }
    }
    errorMessage += '`, is not allowed in the response.';
    report.addCustomError('WRITEONLY_PROPERTY_NOT_ALLOWED_IN_RESPONSE', errorMessage, [propertyName, json], null, schema);
  }
}

function checkReadOnlyPropertyInRequest (validateOptions, schema, json, report) {
  if (shouldSkipValidate(validateOptions, ['READONLY_PROPERTY_NOT_ALLOWED_IN_REQUEST'])) {
    return;
  }

  var isResponse = validateOptions && validateOptions.isResponse;
  var xMsMutability = schema && schema['x-ms-mutability']
  
  if (!isResponse && schema && isPropertyReadOnly(xMsMutability) && schema.readOnly === undefined && json !== undefined) {
    let errorMessage = 'ReadOnly property `"{0}": ';
    
    if (schema && schema.type === 'string' && typeof json === 'string') {
      errorMessage += '"{1}"';
    } else {
      errorMessage += '{1}';
    }

    let propertyName = '';

    if (schema.title && typeof schema.title === 'string') {
      try {
        let result = JSON.parse(schema.title);

        if (Array.isArray(result.path) && result.path.length) {
          propertyName = result.path[result.path.length - 1];
        }
      } catch (err) {
        // do nothing
      }
    }
    errorMessage += '`, cannot be sent in the request.';
    report.addCustomError('READONLY_PROPERTY_NOT_ALLOWED_IN_REQUEST', errorMessage, [propertyName, json], null, schema);
  }
}

function readOnlyValidator (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.10.3
  if (shouldSkipValidate(this.validateOptions, ['READONLY_PROPERTY_NOT_ALLOWED_IN_REQUEST'])) {
    return;
  }

  var isResponse = this.validateOptions && this.validateOptions.isResponse;
  
  if (!isResponse && schema && schema.readOnly && json !== undefined) {
    let errorMessage = 'ReadOnly property `"{0}": ';
    
    if (schema && schema.type === 'string' && typeof json === 'string') {
      errorMessage += '"{1}"';
    } else {
      errorMessage += '{1}';
    }

    let propertyName = '';

    if (schema.title && typeof schema.title === 'string') {
      try {
        let result = JSON.parse(schema.title);

        if (Array.isArray(result.path) && result.path.length) {
          propertyName = result.path[result.path.length - 1];
        }
      } catch (err) {
        // do nothing
      }
    }

    errorMessage += '`, cannot be sent in the request.';
    report.addCustomError(
      'READONLY_PROPERTY_NOT_ALLOWED_IN_REQUEST',
      errorMessage,
      [propertyName, json],
      null,
      schema
    );
  }
}

function checkGlobalParameterInRequest (schema, json, report) {
  // Validate the global parameter when it has $schema defined in request
  var isResponse = this.validateOptions && this.validateOptions.isResponse

  if (!isResponse && schema && schema.schema && json !== undefined) {
    if (this.options && this.options.customValidator) {
      this.options.customValidator = null
      ZSchemaValidator.validate.call(this, report, schema.schema, json)
    }
  }
}

function customValidatorFn (report, schema, json) {
  checkWriteOnlyPropertyInResponse(this.validateOptions, schema, json, report)
  checkSecretPropertyInResponse(this.validateOptions, schema, json, report)
  checkReadOnlyPropertyInRequest(this.validateOptions, schema, json, report)
  checkGlobalParameterInRequest.call(this, schema, json, report)
}

module.exports.shouldSkipValidate = shouldSkipValidate;
module.exports.enumValidator = enumValidator;
module.exports.requiredPropertyValidator = requiredPropertyValidator;
module.exports.typeValidator = typeValidator;
module.exports.oneOf = oneOf;
module.exports.readOnlyValidator = readOnlyValidator;
module.exports.customValidator = customValidatorFn;