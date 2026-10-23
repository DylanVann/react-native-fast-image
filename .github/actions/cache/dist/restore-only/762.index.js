"use strict";
exports.id = 762;
exports.ids = [762];
exports.modules = {

/***/ 77709:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveHttpAuthSchemeConfig = exports.defaultSigninHttpAuthSchemeProvider = exports.defaultSigninHttpAuthSchemeParametersProvider = void 0;
const httpAuthSchemes_1 = __webpack_require__(97523);
const util_middleware_1 = __webpack_require__(76324);
const defaultSigninHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
        operation: (0, util_middleware_1.getSmithyContext)(context).operation,
        region: (await (0, util_middleware_1.normalizeProvider)(config.region)()) ||
            (() => {
                throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
            })(),
    };
};
exports.defaultSigninHttpAuthSchemeParametersProvider = defaultSigninHttpAuthSchemeParametersProvider;
function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
        schemeId: "aws.auth#sigv4",
        signingProperties: {
            name: "signin",
            region: authParameters.region,
        },
        propertiesExtractor: (config, context) => ({
            signingProperties: {
                config,
                context,
            },
        }),
    };
}
function createSmithyApiNoAuthHttpAuthOption(authParameters) {
    return {
        schemeId: "smithy.api#noAuth",
    };
}
const defaultSigninHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
        case "CreateOAuth2Token": {
            options.push(createSmithyApiNoAuthHttpAuthOption(authParameters));
            break;
        }
        default: {
            options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
        }
    }
    return options;
};
exports.defaultSigninHttpAuthSchemeProvider = defaultSigninHttpAuthSchemeProvider;
const resolveHttpAuthSchemeConfig = (config) => {
    const config_0 = (0, httpAuthSchemes_1.resolveAwsSdkSigV4Config)(config);
    return Object.assign(config_0, {
        authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? []),
    });
};
exports.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;


/***/ }),

/***/ 34776:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bdd = void 0;
const util_endpoints_1 = __webpack_require__(79674);
const m = "ref";
const a = -1, b = true, c = "isSet", d = "PartitionResult", e = "booleanEquals", f = "getAttr", g = "stringEquals", h = { [m]: "Endpoint" }, i = { [m]: d }, j = { fn: f, argv: [i, "name"] }, k = {}, l = [{ [m]: "Region" }];
const _data = {
    conditions: [
        [c, [h]],
        [c, l],
        ["aws.partition", l, d],
        [e, [{ [m]: "UseFIPS" }, b]],
        [e, [{ [m]: "UseDualStack" }, b]],
        [e, [{ fn: f, argv: [i, "supportsDualStack"] }, b]],
        [e, [{ fn: f, argv: [i, "supportsFIPS"] }, b]],
        [g, [j, "aws"]],
        [g, [j, "aws-cn"]],
        [g, [j, "aws-us-gov"]],
    ],
    results: [
        [a],
        [a, "Invalid Configuration: FIPS and custom endpoint are not supported"],
        [a, "Invalid Configuration: Dualstack and custom endpoint are not supported"],
        [h, k],
        ["https://{Region}.signin.aws.amazon.com", k],
        ["https://{Region}.signin.amazonaws.cn", k],
        ["https://{Region}.signin.amazonaws-us-gov.com", k],
        ["https://signin-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", k],
        [a, "FIPS and DualStack are enabled, but this partition does not support one or both"],
        ["https://signin-fips.{Region}.{PartitionResult#dnsSuffix}", k],
        [a, "FIPS is enabled but this partition does not support FIPS"],
        ["https://signin.{Region}.{PartitionResult#dualStackDnsSuffix}", k],
        [a, "DualStack is enabled but this partition does not support DualStack"],
        ["https://signin.{Region}.{PartitionResult#dnsSuffix}", k],
        [a, "Invalid Configuration: Missing Region"],
    ],
};
const root = 2;
const r = 100_000_000;
const nodes = new Int32Array([
    -1,
    1,
    -1,
    0,
    15,
    3,
    1,
    4,
    r + 14,
    2,
    5,
    r + 14,
    3,
    11,
    6,
    4,
    10,
    7,
    7,
    r + 4,
    8,
    8,
    r + 5,
    9,
    9,
    r + 6,
    r + 13,
    5,
    r + 11,
    r + 12,
    4,
    13,
    12,
    6,
    r + 9,
    r + 10,
    5,
    14,
    r + 8,
    6,
    r + 7,
    r + 8,
    3,
    r + 1,
    16,
    4,
    r + 2,
    r + 3,
]);
exports.bdd = util_endpoints_1.BinaryDecisionDiagram.from(nodes, root, _data.conditions, _data.results);


/***/ }),

/***/ 12547:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultEndpointResolver = void 0;
const util_endpoints_1 = __webpack_require__(83068);
const util_endpoints_2 = __webpack_require__(79674);
const bdd_1 = __webpack_require__(34776);
const cache = new util_endpoints_2.EndpointCache({
    size: 50,
    params: ["Endpoint", "Region", "UseDualStack", "UseFIPS"],
});
const defaultEndpointResolver = (endpointParams, context = {}) => {
    return cache.get(endpointParams, () => (0, util_endpoints_2.decideEndpoint)(bdd_1.bdd, {
        endpointParams: endpointParams,
        logger: context.logger,
    }));
};
exports.defaultEndpointResolver = defaultEndpointResolver;
util_endpoints_2.customEndpointFunctions.aws = util_endpoints_1.awsEndpointFunctions;


/***/ }),

/***/ 99762:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var middlewareHostHeader = __webpack_require__(52590);
var middlewareLogger = __webpack_require__(85242);
var middlewareRecursionDetection = __webpack_require__(81568);
var middlewareUserAgent = __webpack_require__(32959);
var configResolver = __webpack_require__(39316);
var core = __webpack_require__(90402);
var schema = __webpack_require__(26890);
var middlewareContentLength = __webpack_require__(47212);
var middlewareEndpoint = __webpack_require__(40099);
var middlewareRetry = __webpack_require__(19618);
var smithyClient = __webpack_require__(61411);
var httpAuthSchemeProvider = __webpack_require__(77709);
var runtimeConfig = __webpack_require__(22836);
var regionConfigResolver = __webpack_require__(36463);
var protocolHttp = __webpack_require__(72356);
var schemas_0 = __webpack_require__(60890);
var errors = __webpack_require__(27214);
var SigninServiceException = __webpack_require__(42831);

const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "signin",
    });
};
const commonParams = {
    UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
    Endpoint: { type: "builtInParams", name: "endpoint" },
    Region: { type: "builtInParams", name: "region" },
    UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
};

const getHttpAuthExtensionConfiguration = (runtimeConfig) => {
    const _httpAuthSchemes = runtimeConfig.httpAuthSchemes;
    let _httpAuthSchemeProvider = runtimeConfig.httpAuthSchemeProvider;
    let _credentials = runtimeConfig.credentials;
    return {
        setHttpAuthScheme(httpAuthScheme) {
            const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
            if (index === -1) {
                _httpAuthSchemes.push(httpAuthScheme);
            }
            else {
                _httpAuthSchemes.splice(index, 1, httpAuthScheme);
            }
        },
        httpAuthSchemes() {
            return _httpAuthSchemes;
        },
        setHttpAuthSchemeProvider(httpAuthSchemeProvider) {
            _httpAuthSchemeProvider = httpAuthSchemeProvider;
        },
        httpAuthSchemeProvider() {
            return _httpAuthSchemeProvider;
        },
        setCredentials(credentials) {
            _credentials = credentials;
        },
        credentials() {
            return _credentials;
        },
    };
};
const resolveHttpAuthRuntimeConfig = (config) => {
    return {
        httpAuthSchemes: config.httpAuthSchemes(),
        httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
        credentials: config.credentials(),
    };
};

const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig), smithyClient.getDefaultExtensionConfiguration(runtimeConfig), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig), getHttpAuthExtensionConfiguration(runtimeConfig));
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return Object.assign(runtimeConfig, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
};

class SigninClient extends smithyClient.Client {
    config;
    constructor(...[configuration]) {
        const _config_0 = runtimeConfig.getRuntimeConfig(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = middlewareUserAgent.resolveUserAgentConfig(_config_1);
        const _config_3 = middlewareRetry.resolveRetryConfig(_config_2);
        const _config_4 = configResolver.resolveRegionConfig(_config_3);
        const _config_5 = middlewareHostHeader.resolveHostHeaderConfig(_config_4);
        const _config_6 = middlewareEndpoint.resolveEndpointConfig(_config_5);
        const _config_7 = httpAuthSchemeProvider.resolveHttpAuthSchemeConfig(_config_6);
        const _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        this.config = _config_8;
        this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
        this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
        this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
        this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
        this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
        this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
        this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
            httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultSigninHttpAuthSchemeParametersProvider,
            identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
                "aws.auth#sigv4": config.credentials,
            }),
        }));
        this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

class CreateOAuth2TokenCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("Signin", "CreateOAuth2Token", {})
    .n("SigninClient", "CreateOAuth2TokenCommand")
    .sc(schemas_0.CreateOAuth2Token$)
    .build() {
}

const commands = {
    CreateOAuth2TokenCommand,
};
class Signin extends SigninClient {
}
smithyClient.createAggregatedClient(commands, Signin);

const OAuth2ErrorCode = {
    AUTHCODE_EXPIRED: "AUTHCODE_EXPIRED",
    INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
    INVALID_REQUEST: "INVALID_REQUEST",
    SERVER_ERROR: "server_error",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    USER_CREDENTIALS_CHANGED: "USER_CREDENTIALS_CHANGED",
};

exports.$Command = smithyClient.Command;
exports.__Client = smithyClient.Client;
exports.SigninServiceException = SigninServiceException.SigninServiceException;
exports.CreateOAuth2TokenCommand = CreateOAuth2TokenCommand;
exports.OAuth2ErrorCode = OAuth2ErrorCode;
exports.Signin = Signin;
exports.SigninClient = SigninClient;
Object.prototype.hasOwnProperty.call(schemas_0, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: schemas_0['__proto__']
    });

Object.keys(schemas_0).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = schemas_0[k];
});
Object.prototype.hasOwnProperty.call(errors, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: errors['__proto__']
    });

Object.keys(errors).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = errors[k];
});


/***/ }),

/***/ 42831:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SigninServiceException = exports.__ServiceException = void 0;
const smithy_client_1 = __webpack_require__(61411);
Object.defineProperty(exports, "__ServiceException", ({ enumerable: true, get: function () { return smithy_client_1.ServiceException; } }));
class SigninServiceException extends smithy_client_1.ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SigninServiceException.prototype);
    }
}
exports.SigninServiceException = SigninServiceException;


/***/ }),

/***/ 27214:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ValidationException = exports.TooManyRequestsError = exports.InternalServerException = exports.AccessDeniedException = void 0;
const SigninServiceException_1 = __webpack_require__(42831);
class AccessDeniedException extends SigninServiceException_1.SigninServiceException {
    name = "AccessDeniedException";
    $fault = "client";
    error;
    constructor(opts) {
        super({
            name: "AccessDeniedException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, AccessDeniedException.prototype);
        this.error = opts.error;
    }
}
exports.AccessDeniedException = AccessDeniedException;
class InternalServerException extends SigninServiceException_1.SigninServiceException {
    name = "InternalServerException";
    $fault = "server";
    error;
    constructor(opts) {
        super({
            name: "InternalServerException",
            $fault: "server",
            ...opts,
        });
        Object.setPrototypeOf(this, InternalServerException.prototype);
        this.error = opts.error;
    }
}
exports.InternalServerException = InternalServerException;
class TooManyRequestsError extends SigninServiceException_1.SigninServiceException {
    name = "TooManyRequestsError";
    $fault = "client";
    error;
    constructor(opts) {
        super({
            name: "TooManyRequestsError",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TooManyRequestsError.prototype);
        this.error = opts.error;
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class ValidationException extends SigninServiceException_1.SigninServiceException {
    name = "ValidationException";
    $fault = "client";
    error;
    constructor(opts) {
        super({
            name: "ValidationException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ValidationException.prototype);
        this.error = opts.error;
    }
}
exports.ValidationException = ValidationException;


/***/ }),

/***/ 22836:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRuntimeConfig = void 0;
const tslib_1 = __webpack_require__(61860);
const package_json_1 = tslib_1.__importDefault(__webpack_require__(39955));
const client_1 = __webpack_require__(5152);
const httpAuthSchemes_1 = __webpack_require__(97523);
const util_user_agent_node_1 = __webpack_require__(51656);
const config_resolver_1 = __webpack_require__(39316);
const hash_node_1 = __webpack_require__(5092);
const middleware_retry_1 = __webpack_require__(19618);
const node_config_provider_1 = __webpack_require__(55704);
const node_http_handler_1 = __webpack_require__(61279);
const smithy_client_1 = __webpack_require__(61411);
const util_body_length_node_1 = __webpack_require__(13638);
const util_defaults_mode_node_1 = __webpack_require__(15435);
const util_retry_1 = __webpack_require__(15518);
const runtimeConfig_shared_1 = __webpack_require__(357);
const getRuntimeConfig = (config) => {
    (0, smithy_client_1.emitWarningIfUnsupportedVersion)(process.version);
    const defaultsMode = (0, util_defaults_mode_node_1.resolveDefaultsModeConfig)(config);
    const defaultConfigProvider = () => defaultsMode().then(smithy_client_1.loadConfigsForDefaultMode);
    const clientSharedValues = (0, runtimeConfig_shared_1.getRuntimeConfig)(config);
    (0, client_1.emitWarningIfUnsupportedVersion)(process.version);
    const loaderConfig = {
        profile: config?.profile,
        logger: clientSharedValues.logger,
    };
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        authSchemePreference: config?.authSchemePreference ?? (0, node_config_provider_1.loadConfig)(httpAuthSchemes_1.NODE_AUTH_SCHEME_PREFERENCE_OPTIONS, loaderConfig),
        bodyLengthChecker: config?.bodyLengthChecker ?? util_body_length_node_1.calculateBodyLength,
        defaultUserAgentProvider: config?.defaultUserAgentProvider ??
            (0, util_user_agent_node_1.createDefaultUserAgentProvider)({ serviceId: clientSharedValues.serviceId, clientVersion: package_json_1.default.version }),
        maxAttempts: config?.maxAttempts ?? (0, node_config_provider_1.loadConfig)(middleware_retry_1.NODE_MAX_ATTEMPT_CONFIG_OPTIONS, config),
        region: config?.region ??
            (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_REGION_CONFIG_OPTIONS, { ...config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS, ...loaderConfig }),
        requestHandler: node_http_handler_1.NodeHttpHandler.create(config?.requestHandler ?? defaultConfigProvider),
        retryMode: config?.retryMode ??
            (0, node_config_provider_1.loadConfig)({
                ...middleware_retry_1.NODE_RETRY_MODE_CONFIG_OPTIONS,
                default: async () => (await defaultConfigProvider()).retryMode || util_retry_1.DEFAULT_RETRY_MODE,
            }, config),
        sha256: config?.sha256 ?? hash_node_1.Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? node_http_handler_1.streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
        useFipsEndpoint: config?.useFipsEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
        userAgentAppId: config?.userAgentAppId ?? (0, node_config_provider_1.loadConfig)(util_user_agent_node_1.NODE_APP_ID_CONFIG_OPTIONS, loaderConfig),
    };
};
exports.getRuntimeConfig = getRuntimeConfig;


/***/ }),

/***/ 357:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRuntimeConfig = void 0;
const httpAuthSchemes_1 = __webpack_require__(97523);
const protocols_1 = __webpack_require__(37288);
const core_1 = __webpack_require__(90402);
const smithy_client_1 = __webpack_require__(61411);
const url_parser_1 = __webpack_require__(14494);
const util_base64_1 = __webpack_require__(68385);
const util_utf8_1 = __webpack_require__(71577);
const httpAuthSchemeProvider_1 = __webpack_require__(77709);
const endpointResolver_1 = __webpack_require__(12547);
const schemas_0_1 = __webpack_require__(60890);
const getRuntimeConfig = (config) => {
    return {
        apiVersion: "2023-01-01",
        base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
        base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
        disableHostPrefix: config?.disableHostPrefix ?? false,
        endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
        extensions: config?.extensions ?? [],
        httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultSigninHttpAuthSchemeProvider,
        httpAuthSchemes: config?.httpAuthSchemes ?? [
            {
                schemeId: "aws.auth#sigv4",
                identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4"),
                signer: new httpAuthSchemes_1.AwsSdkSigV4Signer(),
            },
            {
                schemeId: "smithy.api#noAuth",
                identityProvider: (ipc) => ipc.getIdentityProvider("smithy.api#noAuth") || (async () => ({})),
                signer: new core_1.NoAuthSigner(),
            },
        ],
        logger: config?.logger ?? new smithy_client_1.NoOpLogger(),
        protocol: config?.protocol ?? protocols_1.AwsRestJsonProtocol,
        protocolSettings: config?.protocolSettings ?? {
            defaultNamespace: "com.amazonaws.signin",
            errorTypeRegistries: schemas_0_1.errorTypeRegistries,
            version: "2023-01-01",
            serviceTarget: "Signin",
        },
        serviceId: config?.serviceId ?? "Signin",
        urlParser: config?.urlParser ?? url_parser_1.parseUrl,
        utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
        utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8,
    };
};
exports.getRuntimeConfig = getRuntimeConfig;


/***/ }),

/***/ 60890:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateOAuth2Token$ = exports.CreateOAuth2TokenResponseBody$ = exports.CreateOAuth2TokenResponse$ = exports.CreateOAuth2TokenRequestBody$ = exports.CreateOAuth2TokenRequest$ = exports.AccessToken$ = exports.errorTypeRegistries = exports.ValidationException$ = exports.TooManyRequestsError$ = exports.InternalServerException$ = exports.AccessDeniedException$ = exports.SigninServiceException$ = void 0;
const _ADE = "AccessDeniedException";
const _AT = "AccessToken";
const _COAT = "CreateOAuth2Token";
const _COATR = "CreateOAuth2TokenRequest";
const _COATRB = "CreateOAuth2TokenRequestBody";
const _COATRBr = "CreateOAuth2TokenResponseBody";
const _COATRr = "CreateOAuth2TokenResponse";
const _ISE = "InternalServerException";
const _RT = "RefreshToken";
const _TMRE = "TooManyRequestsError";
const _VE = "ValidationException";
const _aKI = "accessKeyId";
const _aT = "accessToken";
const _c = "client";
const _cI = "clientId";
const _cV = "codeVerifier";
const _co = "code";
const _e = "error";
const _eI = "expiresIn";
const _gT = "grantType";
const _h = "http";
const _hE = "httpError";
const _iT = "idToken";
const _jN = "jsonName";
const _m = "message";
const _rT = "refreshToken";
const _rU = "redirectUri";
const _s = "smithy.ts.sdk.synthetic.com.amazonaws.signin";
const _sAK = "secretAccessKey";
const _sT = "sessionToken";
const _se = "server";
const _tI = "tokenInput";
const _tO = "tokenOutput";
const _tT = "tokenType";
const n0 = "com.amazonaws.signin";
const schema_1 = __webpack_require__(26890);
const errors_1 = __webpack_require__(27214);
const SigninServiceException_1 = __webpack_require__(42831);
const _s_registry = schema_1.TypeRegistry.for(_s);
exports.SigninServiceException$ = [-3, _s, "SigninServiceException", 0, [], []];
_s_registry.registerError(exports.SigninServiceException$, SigninServiceException_1.SigninServiceException);
const n0_registry = schema_1.TypeRegistry.for(n0);
exports.AccessDeniedException$ = [-3, n0, _ADE, { [_e]: _c }, [_e, _m], [0, 0], 2];
n0_registry.registerError(exports.AccessDeniedException$, errors_1.AccessDeniedException);
exports.InternalServerException$ = [-3, n0, _ISE, { [_e]: _se, [_hE]: 500 }, [_e, _m], [0, 0], 2];
n0_registry.registerError(exports.InternalServerException$, errors_1.InternalServerException);
exports.TooManyRequestsError$ = [-3, n0, _TMRE, { [_e]: _c, [_hE]: 429 }, [_e, _m], [0, 0], 2];
n0_registry.registerError(exports.TooManyRequestsError$, errors_1.TooManyRequestsError);
exports.ValidationException$ = [-3, n0, _VE, { [_e]: _c, [_hE]: 400 }, [_e, _m], [0, 0], 2];
n0_registry.registerError(exports.ValidationException$, errors_1.ValidationException);
exports.errorTypeRegistries = [_s_registry, n0_registry];
var RefreshToken = [0, n0, _RT, 8, 0];
exports.AccessToken$ = [
    3,
    n0,
    _AT,
    8,
    [_aKI, _sAK, _sT],
    [
        [0, { [_jN]: _aKI }],
        [0, { [_jN]: _sAK }],
        [0, { [_jN]: _sT }],
    ],
    3,
];
exports.CreateOAuth2TokenRequest$ = [
    3,
    n0,
    _COATR,
    0,
    [_tI],
    [[() => exports.CreateOAuth2TokenRequestBody$, 16]],
    1,
];
exports.CreateOAuth2TokenRequestBody$ = [
    3,
    n0,
    _COATRB,
    0,
    [_cI, _gT, _co, _rU, _cV, _rT],
    [
        [0, { [_jN]: _cI }],
        [0, { [_jN]: _gT }],
        0,
        [0, { [_jN]: _rU }],
        [0, { [_jN]: _cV }],
        [() => RefreshToken, { [_jN]: _rT }],
    ],
    2,
];
exports.CreateOAuth2TokenResponse$ = [
    3,
    n0,
    _COATRr,
    0,
    [_tO],
    [[() => exports.CreateOAuth2TokenResponseBody$, 16]],
    1,
];
exports.CreateOAuth2TokenResponseBody$ = [
    3,
    n0,
    _COATRBr,
    0,
    [_aT, _tT, _eI, _rT, _iT],
    [
        [() => exports.AccessToken$, { [_jN]: _aT }],
        [0, { [_jN]: _tT }],
        [1, { [_jN]: _eI }],
        [() => RefreshToken, { [_jN]: _rT }],
        [0, { [_jN]: _iT }],
    ],
    4,
];
exports.CreateOAuth2Token$ = [
    9,
    n0,
    _COAT,
    { [_h]: ["POST", "/v1/token", 200] },
    () => exports.CreateOAuth2TokenRequest$,
    () => exports.CreateOAuth2TokenResponse$,
];


/***/ }),

/***/ 39955:
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"name":"@aws-sdk/nested-clients","version":"3.997.4","description":"Nested clients for AWS SDK packages.","main":"./dist-cjs/index.js","module":"./dist-es/index.js","types":"./dist-types/index.d.ts","scripts":{"build":"yarn lint && concurrently \'yarn:build:types\' \'yarn:build:es\' && yarn build:cjs","build:cjs":"node ../../scripts/compilation/inline nested-clients","build:es":"tsc -p tsconfig.es.json","build:include:deps":"yarn g:turbo run build -F=\\"$npm_package_name\\"","build:types":"tsc -p tsconfig.types.json","build:types:downlevel":"downlevel-dts dist-types dist-types/ts3.4","clean":"premove dist-cjs dist-es dist-types tsconfig.cjs.tsbuildinfo tsconfig.es.tsbuildinfo tsconfig.types.tsbuildinfo","lint":"node ../../scripts/validation/submodules-linter.js --pkg nested-clients","test":"yarn g:vitest run","test:watch":"yarn g:vitest watch"},"engines":{"node":">=20.0.0"},"sideEffects":false,"author":{"name":"AWS SDK for JavaScript Team","url":"https://aws.amazon.com/javascript/"},"license":"Apache-2.0","dependencies":{"@aws-crypto/sha256-browser":"5.2.0","@aws-crypto/sha256-js":"5.2.0","@aws-sdk/core":"^3.974.6","@aws-sdk/middleware-host-header":"^3.972.10","@aws-sdk/middleware-logger":"^3.972.10","@aws-sdk/middleware-recursion-detection":"^3.972.11","@aws-sdk/middleware-user-agent":"^3.972.36","@aws-sdk/region-config-resolver":"^3.972.13","@aws-sdk/signature-v4-multi-region":"^3.996.23","@aws-sdk/types":"^3.973.8","@aws-sdk/util-endpoints":"^3.996.8","@aws-sdk/util-user-agent-browser":"^3.972.10","@aws-sdk/util-user-agent-node":"^3.973.22","@smithy/config-resolver":"^4.4.17","@smithy/core":"^3.23.17","@smithy/fetch-http-handler":"^5.3.17","@smithy/hash-node":"^4.2.14","@smithy/invalid-dependency":"^4.2.14","@smithy/middleware-content-length":"^4.2.14","@smithy/middleware-endpoint":"^4.4.32","@smithy/middleware-retry":"^4.5.6","@smithy/middleware-serde":"^4.2.20","@smithy/middleware-stack":"^4.2.14","@smithy/node-config-provider":"^4.3.14","@smithy/node-http-handler":"^4.6.1","@smithy/protocol-http":"^5.3.14","@smithy/smithy-client":"^4.12.13","@smithy/types":"^4.14.1","@smithy/url-parser":"^4.2.14","@smithy/util-base64":"^4.3.2","@smithy/util-body-length-browser":"^4.2.2","@smithy/util-body-length-node":"^4.2.3","@smithy/util-defaults-mode-browser":"^4.3.49","@smithy/util-defaults-mode-node":"^4.2.54","@smithy/util-endpoints":"^3.4.2","@smithy/util-middleware":"^4.2.14","@smithy/util-retry":"^4.3.5","@smithy/util-utf8":"^4.2.2","tslib":"^2.6.2"},"devDependencies":{"concurrently":"7.0.0","downlevel-dts":"0.10.1","premove":"4.0.0","typescript":"~5.8.3"},"typesVersions":{"<4.5":{"dist-types/*":["dist-types/ts3.4/*"]}},"files":["./cognito-identity.d.ts","./cognito-identity.js","./signin.d.ts","./signin.js","./sso-oidc.d.ts","./sso-oidc.js","./sso.d.ts","./sso.js","./sts.d.ts","./sts.js","dist-*/**"],"browser":{"./dist-es/submodules/cognito-identity/runtimeConfig":"./dist-es/submodules/cognito-identity/runtimeConfig.browser","./dist-es/submodules/signin/runtimeConfig":"./dist-es/submodules/signin/runtimeConfig.browser","./dist-es/submodules/sso-oidc/runtimeConfig":"./dist-es/submodules/sso-oidc/runtimeConfig.browser","./dist-es/submodules/sso/runtimeConfig":"./dist-es/submodules/sso/runtimeConfig.browser","./dist-es/submodules/sts/runtimeConfig":"./dist-es/submodules/sts/runtimeConfig.browser"},"react-native":{},"homepage":"https://github.com/aws/aws-sdk-js-v3/tree/main/packages/nested-clients","repository":{"type":"git","url":"https://github.com/aws/aws-sdk-js-v3.git","directory":"packages/nested-clients"},"exports":{"./package.json":"./package.json","./sso-oidc":{"types":"./dist-types/submodules/sso-oidc/index.d.ts","module":"./dist-es/submodules/sso-oidc/index.js","node":"./dist-cjs/submodules/sso-oidc/index.js","import":"./dist-es/submodules/sso-oidc/index.js","require":"./dist-cjs/submodules/sso-oidc/index.js"},"./sts":{"types":"./dist-types/submodules/sts/index.d.ts","module":"./dist-es/submodules/sts/index.js","node":"./dist-cjs/submodules/sts/index.js","import":"./dist-es/submodules/sts/index.js","require":"./dist-cjs/submodules/sts/index.js"},"./signin":{"types":"./dist-types/submodules/signin/index.d.ts","module":"./dist-es/submodules/signin/index.js","node":"./dist-cjs/submodules/signin/index.js","import":"./dist-es/submodules/signin/index.js","require":"./dist-cjs/submodules/signin/index.js"},"./cognito-identity":{"types":"./dist-types/submodules/cognito-identity/index.d.ts","module":"./dist-es/submodules/cognito-identity/index.js","node":"./dist-cjs/submodules/cognito-identity/index.js","import":"./dist-es/submodules/cognito-identity/index.js","require":"./dist-cjs/submodules/cognito-identity/index.js"},"./sso":{"types":"./dist-types/submodules/sso/index.d.ts","module":"./dist-es/submodules/sso/index.js","node":"./dist-cjs/submodules/sso/index.js","import":"./dist-es/submodules/sso/index.js","require":"./dist-cjs/submodules/sso/index.js"}}}');

/***/ })

};
;