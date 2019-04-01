
'use strict';
var Report = require('z-schema/src/Report');
var ZSchemaValidator = require('z-schema/src/JsonValidation');

function enumValidator (report, schema, json) {
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
  if (caseInsensitiveMatch === true) {
    report.addCustomError(
      'ENUM_CASE_MISMATCH',
      'Enum doesn not match case for: {0}',
      [json],
      null,
      schema
    );
  } else if (match === false && !areExtraEnumValuesAllowed) {
    report.addError('ENUM_MISMATCH', [json], null, schema);
  }
}

function requiredPropertyValidator (report, schema, json) {
  // http://json-schema.org/latest/json-schema-validation.html#rfc.section.5.4.3.2

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
    if (this.validateOptions && this.validateOptions.isResponse && xMsMutability && xMsMutability.indexOf('read') === -1) {
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
  )

  // if none of the oneOf subschemas has a discriminator, we are not in a polymorphic oneOf.
  if (!basePolymorphicSchema) {
    return false
  }
  var discriminatorPropertyName = basePolymorphicSchema.__$refResolved.discriminator

  // to conform to the Azure specs, we accept a lenient discriminator. if the type is missing in the
  // payload we use the base class. Also if the type doesn't match anything, we use the base class.
  var jsonDiscriminatorValue =
    json[discriminatorPropertyName] ||
    basePolymorphicSchema.__$refResolved.properties[discriminatorPropertyName].enum[0]

  var schemaToValidate =
    schema.oneOf.find(
      s =>
        s.__$refResolved &&
        s.__$refResolved.properties[discriminatorPropertyName].enum[0] ===
        jsonDiscriminatorValue
    ) || basePolymorphicSchema

  ZSchemaValidator.validate.call(this, report, schemaToValidate, json)
  return true
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

module.exports.enumValidator = enumValidator;
module.exports.requiredPropertyValidator = requiredPropertyValidator;
module.exports.typeValidator = typeValidator;
module.exports.oneOf = oneOf;
