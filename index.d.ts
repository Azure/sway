interface SwaggerObject {
    "x-ms-paths"?: PathsObject
    paths?: PathsObject
    definitions?: DefinitionsObject
    "x-ms-parameterized-host"?: {
        parameters: ParameterObject[]
    }
    consumes?: string[]
    produces?: string[]
    parameters?: ParametersDefinitionsObject
    responses?: ResponsesDefinitionsObject
    readonly documents?: any
}

interface PathsObject {
    [name: string]: PathItemObject
}

interface DefinitionsObject {
    [name: string]: SchemaObject
}

interface ParameterObject {
    name: string
    in: string
    schema?: SchemaObject
    required?: boolean
    items?: SchemaObject
    type?: DataType
}

interface ParametersDefinitionsObject {
    [name: string]: ParameterObject
}

interface ResponsesDefinitionsObject {
    [name: string]: ResponseObject
}

interface PathItemObject extends PathItemObjectMethods {
    parameters?: ParameterObject[]
}

interface SchemaObject {
    type?: DataType
    items?: SchemaObject
    properties?: JsonSchemaProperties
    additionalProperties?: SchemaObject|boolean
    "x-nullable"?: boolean
    in?: string
    oneOf?: SchemaObject[]
    $ref?: string
    required?: string[]|false
    schema?: SchemaObject
    allOf?: SchemaObject[]
    description?: string
    discriminator?: string
    "x-ms-discriminator-value"?: string
    enum?: string[]
    "x-ms-azure-resource"?: boolean
    anyOf?: SchemaObject[]
}

type DataType = "integer"|"number"|"string"|"boolean"|"null"|"file"|"object"|"array"

interface ResponseObject {
    schema?: SchemaObject
}

type PathItemObjectMethods = {
    [m in Methods]?: OperationObject
}

/**
 * JSON Schema "properties"
 */
interface JsonSchemaProperties {
    [name: string]: SchemaObject
}

type Methods = "get"|"put"|"post"|"delete"|"options"|"head"|"patch"

interface OperationObject {
    operationId?: string
    parameters?: ParameterObject[]
    consumes?: string[]
    produces?: string[]
    responses?: ResponsesObject
}

interface ResponsesObject {
    default?: ResponseObject
    [name: string]: ResponseObject|undefined
}

declare interface Options {
    definition: SwaggerObject | string
    jsonRefs?: {
        readonly relativeBase: any
    }
    customValidatiors?: ValidatorCallback[]
    readonly isPathCaseSensitive?: boolean
}

declare type ValidationResults = {
    errors: ValidationEntry[],
    warnings: ValidationEntry[]
}

declare class Path {
    path: string
    regexp: RegExp
    api: SwaggerApi

    definition: Object
    definitionFullyResolved: Object
    operationObjects: Operation[]
    parameterObjects: Parameter[]

    pathToDefinition: string[]
    ptr: string

    getOperation(method : string): Operation[]
    getOperations(): Operation[]
    getOperationsByTag(tag: any): Operation[]
    getParameters(): Parameter[]
}

declare interface Schema {
    readonly example: any
    format: any
}

declare class Parameter{
    definition: Object
    definitionFullyResolved: Object
    operationObject: Operation
    pathObject: Path
    pathToDefinition: string[]
    ptr: string
    schema: Schema
    name: any
    format: any
    required: any
    in: any
    "x-ms-skip-url-encoding": any
    type: any

    getSample() : Object
    getValue(request : Request): ParameterValue
}

declare interface Operation {
    readonly operationId?: any
    method: string
    pathObject: Path
    provider?: any
    readonly responses?: ResponsesObject
    "x-ms-examples": any
    readonly consumes: string[]
    readonly produces: any
    definition: Object
    definitionFullyResolved: Object
    pathToDefinition: string[]
    parameterObjects: Parameter[]
    ptr: string
    securityDefinitions: Object

    validateRequest(request : Request) : ValidationResults
    validateResponse(response : LiveResponse) : ValidationResults
    getParameters() : Parameter[]
    getResponses() : Response[]
    getResponse(statusCode ?: number | string) : Response
    getParameter(name : string, location ?: string) : Parameter
    getSecurity() : Object//Security
}

declare interface SwaggerApi{
    customValidators: ValidatorCallback[]
    definition: Object
    definitionRemotesResolved: Object
    definitionFullyResolved: Object
    documentationUrl: string
    pathObjects: Path[]
    options: Object
    references: Object
    version: string
    readonly info: {
        readonly version: string
        readonly title: any
    }

    getOperation(pathOrRequest : string | Request, method ?: string): Operation
    getOperations(path ?: string): Operation[]
    getOperationsByTag(tag ?: string): Operation[]
    getPath(pathOrRequest : string | Request): Path
    getPaths(): Path[]
    registerValidator(validator: ValidatorCallback): void
    validate(): ValidationResults
}

export declare function create(options : Options) : Promise<SwaggerApi>

//

declare type ValidatorCallback = (api : SwaggerApi) => ValidationResults

interface ParsedUrlQuery {
    [key: string]: any
}

declare interface Request {
    query?: ParsedUrlQuery
    readonly url: string
    readonly method: string
}

declare type ValidationEntry = {
    code: string
    error: string
    errors: ValidationEntry[] //for nested errors
    lineage: string[]
    message: string
    name: string
    params: Object[]
    path: string[]
    schemaId: string
}

declare interface LiveResponse {
}

declare interface Response {
    definition: Object
    definitionFullyResolved: Object
    operationObject: Operation
    pathToDefinition: string[]
    ptr: string
    statusCode: string
    readonly examples: any
    readonly schema: any

    getExample(mimeType: string): string
    getSample(): Object
    validateResponse(response: LiveResponse): ValidationResults
}

declare class ParameterValue{
    error: Error
    parameterObject: Parameter
    raw: Object
    valid: boolean
    value: Object
}