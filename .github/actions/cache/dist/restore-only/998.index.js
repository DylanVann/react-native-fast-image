"use strict";
exports.id = 998;
exports.ids = [998];
exports.modules = {

/***/ 60998:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

var __webpack_unused_export__;


var propertyProvider = __webpack_require__(71238);
var sharedIniFileLoader = __webpack_require__(94964);
var client = __webpack_require__(5152);
var tokenProviders = __webpack_require__(75433);

const isSsoProfile = (arg) => arg &&
    (typeof arg.sso_start_url === "string" ||
        typeof arg.sso_account_id === "string" ||
        typeof arg.sso_session === "string" ||
        typeof arg.sso_region === "string" ||
        typeof arg.sso_role_name === "string");

const SHOULD_FAIL_CREDENTIAL_CHAIN = false;
const resolveSSOCredentials = async ({ ssoStartUrl, ssoSession, ssoAccountId, ssoRegion, ssoRoleName, ssoClient, clientConfig, parentClientConfig, callerClientConfig, profile, filepath, configFilepath, ignoreCache, logger, }) => {
    let token;
    const refreshMessage = `To refresh this SSO session run aws sso login with the corresponding profile.`;
    if (ssoSession) {
        try {
            const _token = await tokenProviders.fromSso({
                profile,
                filepath,
                configFilepath,
                ignoreCache,
            })();
            token = {
                accessToken: _token.token,
                expiresAt: new Date(_token.expiration).toISOString(),
            };
        }
        catch (e) {
            throw new propertyProvider.CredentialsProviderError(e.message, {
                tryNextLink: SHOULD_FAIL_CREDENTIAL_CHAIN,
                logger,
            });
        }
    }
    else {
        try {
            token = await sharedIniFileLoader.getSSOTokenFromFile(ssoStartUrl);
        }
        catch (e) {
            throw new propertyProvider.CredentialsProviderError(`The SSO session associated with this profile is invalid. ${refreshMessage}`, {
                tryNextLink: SHOULD_FAIL_CREDENTIAL_CHAIN,
                logger,
            });
        }
    }
    if (new Date(token.expiresAt).getTime() - Date.now() <= 0) {
        throw new propertyProvider.CredentialsProviderError(`The SSO session associated with this profile has expired. ${refreshMessage}`, {
            tryNextLink: SHOULD_FAIL_CREDENTIAL_CHAIN,
            logger,
        });
    }
    const { accessToken } = token;
    const { SSOClient, GetRoleCredentialsCommand } = await Promise.resolve().then(function () { return __webpack_require__(91853); });
    const sso = ssoClient ||
        new SSOClient(Object.assign({}, clientConfig ?? {}, {
            logger: clientConfig?.logger ?? callerClientConfig?.logger ?? parentClientConfig?.logger,
            region: clientConfig?.region ?? ssoRegion,
            userAgentAppId: clientConfig?.userAgentAppId ?? callerClientConfig?.userAgentAppId ?? parentClientConfig?.userAgentAppId,
        }));
    let ssoResp;
    try {
        ssoResp = await sso.send(new GetRoleCredentialsCommand({
            accountId: ssoAccountId,
            roleName: ssoRoleName,
            accessToken,
        }));
    }
    catch (e) {
        throw new propertyProvider.CredentialsProviderError(e, {
            tryNextLink: SHOULD_FAIL_CREDENTIAL_CHAIN,
            logger,
        });
    }
    const { roleCredentials: { accessKeyId, secretAccessKey, sessionToken, expiration, credentialScope, accountId } = {}, } = ssoResp;
    if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
        throw new propertyProvider.CredentialsProviderError("SSO returns an invalid temporary credential.", {
            tryNextLink: SHOULD_FAIL_CREDENTIAL_CHAIN,
            logger,
        });
    }
    const credentials = {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiration: new Date(expiration),
        ...(credentialScope && { credentialScope }),
        ...(accountId && { accountId }),
    };
    if (ssoSession) {
        client.setCredentialFeature(credentials, "CREDENTIALS_SSO", "s");
    }
    else {
        client.setCredentialFeature(credentials, "CREDENTIALS_SSO_LEGACY", "u");
    }
    return credentials;
};

const validateSsoProfile = (profile, logger) => {
    const { sso_start_url, sso_account_id, sso_region, sso_role_name } = profile;
    if (!sso_start_url || !sso_account_id || !sso_region || !sso_role_name) {
        throw new propertyProvider.CredentialsProviderError(`Profile is configured with invalid SSO credentials. Required parameters "sso_account_id", ` +
            `"sso_region", "sso_role_name", "sso_start_url". Got ${Object.keys(profile).join(", ")}\nReference: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html`, { tryNextLink: false, logger });
    }
    return profile;
};

const fromSSO = (init = {}) => async ({ callerClientConfig } = {}) => {
    init.logger?.debug("@aws-sdk/credential-provider-sso - fromSSO");
    const { ssoStartUrl, ssoAccountId, ssoRegion, ssoRoleName, ssoSession } = init;
    const { ssoClient } = init;
    const profileName = sharedIniFileLoader.getProfileName({
        profile: init.profile ?? callerClientConfig?.profile,
    });
    if (!ssoStartUrl && !ssoAccountId && !ssoRegion && !ssoRoleName && !ssoSession) {
        const profiles = await sharedIniFileLoader.parseKnownFiles(init);
        const profile = profiles[profileName];
        if (!profile) {
            throw new propertyProvider.CredentialsProviderError(`Profile ${profileName} was not found.`, { logger: init.logger });
        }
        if (!isSsoProfile(profile)) {
            throw new propertyProvider.CredentialsProviderError(`Profile ${profileName} is not configured with SSO credentials.`, {
                logger: init.logger,
            });
        }
        if (profile?.sso_session) {
            const ssoSessions = await sharedIniFileLoader.loadSsoSessionData(init);
            const session = ssoSessions[profile.sso_session];
            const conflictMsg = ` configurations in profile ${profileName} and sso-session ${profile.sso_session}`;
            if (ssoRegion && ssoRegion !== session.sso_region) {
                throw new propertyProvider.CredentialsProviderError(`Conflicting SSO region` + conflictMsg, {
                    tryNextLink: false,
                    logger: init.logger,
                });
            }
            if (ssoStartUrl && ssoStartUrl !== session.sso_start_url) {
                throw new propertyProvider.CredentialsProviderError(`Conflicting SSO start_url` + conflictMsg, {
                    tryNextLink: false,
                    logger: init.logger,
                });
            }
            profile.sso_region = session.sso_region;
            profile.sso_start_url = session.sso_start_url;
        }
        const { sso_start_url, sso_account_id, sso_region, sso_role_name, sso_session } = validateSsoProfile(profile, init.logger);
        return resolveSSOCredentials({
            ssoStartUrl: sso_start_url,
            ssoSession: sso_session,
            ssoAccountId: sso_account_id,
            ssoRegion: sso_region,
            ssoRoleName: sso_role_name,
            ssoClient: ssoClient,
            clientConfig: init.clientConfig,
            parentClientConfig: init.parentClientConfig,
            callerClientConfig: init.callerClientConfig,
            profile: profileName,
            filepath: init.filepath,
            configFilepath: init.configFilepath,
            ignoreCache: init.ignoreCache,
            logger: init.logger,
        });
    }
    else if (!ssoStartUrl || !ssoAccountId || !ssoRegion || !ssoRoleName) {
        throw new propertyProvider.CredentialsProviderError("Incomplete configuration. The fromSSO() argument hash must include " +
            '"ssoStartUrl", "ssoAccountId", "ssoRegion", "ssoRoleName"', { tryNextLink: false, logger: init.logger });
    }
    else {
        return resolveSSOCredentials({
            ssoStartUrl,
            ssoSession,
            ssoAccountId,
            ssoRegion,
            ssoRoleName,
            ssoClient,
            clientConfig: init.clientConfig,
            parentClientConfig: init.parentClientConfig,
            callerClientConfig: init.callerClientConfig,
            profile: profileName,
            filepath: init.filepath,
            configFilepath: init.configFilepath,
            ignoreCache: init.ignoreCache,
            logger: init.logger,
        });
    }
};

exports.fromSSO = fromSSO;
__webpack_unused_export__ = isSsoProfile;
__webpack_unused_export__ = validateSsoProfile;


/***/ }),

/***/ 91853:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var sso = __webpack_require__(32579);



exports.GetRoleCredentialsCommand = sso.GetRoleCredentialsCommand;
exports.SSOClient = sso.SSOClient;


/***/ }),

/***/ 97452:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveHttpAuthSchemeConfig = exports.defaultSSOHttpAuthSchemeProvider = exports.defaultSSOHttpAuthSchemeParametersProvider = void 0;
const httpAuthSchemes_1 = __webpack_require__(97523);
const util_middleware_1 = __webpack_require__(76324);
const defaultSSOHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
        operation: (0, util_middleware_1.getSmithyContext)(context).operation,
        region: (await (0, util_middleware_1.normalizeProvider)(config.region)()) ||
            (() => {
                throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
            })(),
    };
};
exports.defaultSSOHttpAuthSchemeParametersProvider = defaultSSOHttpAuthSchemeParametersProvider;
function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
        schemeId: "aws.auth#sigv4",
        signingProperties: {
            name: "awsssoportal",
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
const defaultSSOHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
        case "GetRoleCredentials": {
            options.push(createSmithyApiNoAuthHttpAuthOption(authParameters));
            break;
        }
        default: {
            options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
        }
    }
    return options;
};
exports.defaultSSOHttpAuthSchemeProvider = defaultSSOHttpAuthSchemeProvider;
const resolveHttpAuthSchemeConfig = (config) => {
    const config_0 = (0, httpAuthSchemes_1.resolveAwsSdkSigV4Config)(config);
    return Object.assign(config_0, {
        authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? []),
    });
};
exports.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;


/***/ }),

/***/ 49239:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bdd = void 0;
const util_endpoints_1 = __webpack_require__(79674);
const k = "ref";
const a = -1, b = true, c = "isSet", d = "PartitionResult", e = "booleanEquals", f = "getAttr", g = { [k]: "Endpoint" }, h = { [k]: d }, i = {}, j = [{ [k]: "Region" }];
const _data = {
    conditions: [
        [c, [g]],
        [c, j],
        ["aws.partition", j, d],
        [e, [{ [k]: "UseFIPS" }, b]],
        [e, [{ [k]: "UseDualStack" }, b]],
        [e, [{ fn: f, argv: [h, "supportsDualStack"] }, b]],
        [e, [{ fn: f, argv: [h, "supportsFIPS"] }, b]],
        ["stringEquals", [{ fn: f, argv: [h, "name"] }, "aws-us-gov"]],
    ],
    results: [
        [a],
        [a, "Invalid Configuration: FIPS and custom endpoint are not supported"],
        [a, "Invalid Configuration: Dualstack and custom endpoint are not supported"],
        [g, i],
        ["https://portal.sso-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", i],
        [a, "FIPS and DualStack are enabled, but this partition does not support one or both"],
        ["https://portal.sso.{Region}.amazonaws.com", i],
        ["https://portal.sso-fips.{Region}.{PartitionResult#dnsSuffix}", i],
        [a, "FIPS is enabled but this partition does not support FIPS"],
        ["https://portal.sso.{Region}.{PartitionResult#dualStackDnsSuffix}", i],
        [a, "DualStack is enabled but this partition does not support DualStack"],
        ["https://portal.sso.{Region}.{PartitionResult#dnsSuffix}", i],
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
    13,
    3,
    1,
    4,
    r + 12,
    2,
    5,
    r + 12,
    3,
    8,
    6,
    4,
    7,
    r + 11,
    5,
    r + 9,
    r + 10,
    4,
    11,
    9,
    6,
    10,
    r + 8,
    7,
    r + 6,
    r + 7,
    5,
    12,
    r + 5,
    6,
    r + 4,
    r + 5,
    3,
    r + 1,
    14,
    4,
    r + 2,
    r + 3,
]);
exports.bdd = util_endpoints_1.BinaryDecisionDiagram.from(nodes, root, _data.conditions, _data.results);


/***/ }),

/***/ 85074:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultEndpointResolver = void 0;
const util_endpoints_1 = __webpack_require__(83068);
const util_endpoints_2 = __webpack_require__(79674);
const bdd_1 = __webpack_require__(49239);
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

/***/ 32579:
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
var httpAuthSchemeProvider = __webpack_require__(97452);
var runtimeConfig = __webpack_require__(85541);
var regionConfigResolver = __webpack_require__(36463);
var protocolHttp = __webpack_require__(72356);
var schemas_0 = __webpack_require__(52167);
var errors = __webpack_require__(24483);
var SSOServiceException = __webpack_require__(69849);

const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "awsssoportal",
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

class SSOClient extends smithyClient.Client {
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
            httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultSSOHttpAuthSchemeParametersProvider,
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

class GetRoleCredentialsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("SWBPortalService", "GetRoleCredentials", {})
    .n("SSOClient", "GetRoleCredentialsCommand")
    .sc(schemas_0.GetRoleCredentials$)
    .build() {
}

const commands = {
    GetRoleCredentialsCommand,
};
class SSO extends SSOClient {
}
smithyClient.createAggregatedClient(commands, SSO);

exports.$Command = smithyClient.Command;
exports.__Client = smithyClient.Client;
exports.SSOServiceException = SSOServiceException.SSOServiceException;
exports.GetRoleCredentialsCommand = GetRoleCredentialsCommand;
exports.SSO = SSO;
exports.SSOClient = SSOClient;
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

/***/ 69849:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SSOServiceException = exports.__ServiceException = void 0;
const smithy_client_1 = __webpack_require__(61411);
Object.defineProperty(exports, "__ServiceException", ({ enumerable: true, get: function () { return smithy_client_1.ServiceException; } }));
class SSOServiceException extends smithy_client_1.ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SSOServiceException.prototype);
    }
}
exports.SSOServiceException = SSOServiceException;


/***/ }),

/***/ 24483:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnauthorizedException = exports.TooManyRequestsException = exports.ResourceNotFoundException = exports.InvalidRequestException = void 0;
const SSOServiceException_1 = __webpack_require__(69849);
class InvalidRequestException extends SSOServiceException_1.SSOServiceException {
    name = "InvalidRequestException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "InvalidRequestException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidRequestException.prototype);
    }
}
exports.InvalidRequestException = InvalidRequestException;
class ResourceNotFoundException extends SSOServiceException_1.SSOServiceException {
    name = "ResourceNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ResourceNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
    }
}
exports.ResourceNotFoundException = ResourceNotFoundException;
class TooManyRequestsException extends SSOServiceException_1.SSOServiceException {
    name = "TooManyRequestsException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "TooManyRequestsException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TooManyRequestsException.prototype);
    }
}
exports.TooManyRequestsException = TooManyRequestsException;
class UnauthorizedException extends SSOServiceException_1.SSOServiceException {
    name = "UnauthorizedException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "UnauthorizedException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, UnauthorizedException.prototype);
    }
}
exports.UnauthorizedException = UnauthorizedException;


/***/ }),

/***/ 85541:
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
const runtimeConfig_shared_1 = __webpack_require__(43082);
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

/***/ 43082:
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
const httpAuthSchemeProvider_1 = __webpack_require__(97452);
const endpointResolver_1 = __webpack_require__(85074);
const schemas_0_1 = __webpack_require__(52167);
const getRuntimeConfig = (config) => {
    return {
        apiVersion: "2019-06-10",
        base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
        base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
        disableHostPrefix: config?.disableHostPrefix ?? false,
        endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
        extensions: config?.extensions ?? [],
        httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultSSOHttpAuthSchemeProvider,
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
            defaultNamespace: "com.amazonaws.sso",
            errorTypeRegistries: schemas_0_1.errorTypeRegistries,
            version: "2019-06-10",
            serviceTarget: "SWBPortalService",
        },
        serviceId: config?.serviceId ?? "SSO",
        urlParser: config?.urlParser ?? url_parser_1.parseUrl,
        utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
        utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8,
    };
};
exports.getRuntimeConfig = getRuntimeConfig;


/***/ }),

/***/ 52167:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GetRoleCredentials$ = exports.RoleCredentials$ = exports.GetRoleCredentialsResponse$ = exports.GetRoleCredentialsRequest$ = exports.errorTypeRegistries = exports.UnauthorizedException$ = exports.TooManyRequestsException$ = exports.ResourceNotFoundException$ = exports.InvalidRequestException$ = exports.SSOServiceException$ = void 0;
const _ATT = "AccessTokenType";
const _GRC = "GetRoleCredentials";
const _GRCR = "GetRoleCredentialsRequest";
const _GRCRe = "GetRoleCredentialsResponse";
const _IRE = "InvalidRequestException";
const _RC = "RoleCredentials";
const _RNFE = "ResourceNotFoundException";
const _SAKT = "SecretAccessKeyType";
const _STT = "SessionTokenType";
const _TMRE = "TooManyRequestsException";
const _UE = "UnauthorizedException";
const _aI = "accountId";
const _aKI = "accessKeyId";
const _aT = "accessToken";
const _ai = "account_id";
const _c = "client";
const _e = "error";
const _ex = "expiration";
const _h = "http";
const _hE = "httpError";
const _hH = "httpHeader";
const _hQ = "httpQuery";
const _m = "message";
const _rC = "roleCredentials";
const _rN = "roleName";
const _rn = "role_name";
const _s = "smithy.ts.sdk.synthetic.com.amazonaws.sso";
const _sAK = "secretAccessKey";
const _sT = "sessionToken";
const _xasbt = "x-amz-sso_bearer_token";
const n0 = "com.amazonaws.sso";
const schema_1 = __webpack_require__(26890);
const errors_1 = __webpack_require__(24483);
const SSOServiceException_1 = __webpack_require__(69849);
const _s_registry = schema_1.TypeRegistry.for(_s);
exports.SSOServiceException$ = [-3, _s, "SSOServiceException", 0, [], []];
_s_registry.registerError(exports.SSOServiceException$, SSOServiceException_1.SSOServiceException);
const n0_registry = schema_1.TypeRegistry.for(n0);
exports.InvalidRequestException$ = [-3, n0, _IRE, { [_e]: _c, [_hE]: 400 }, [_m], [0]];
n0_registry.registerError(exports.InvalidRequestException$, errors_1.InvalidRequestException);
exports.ResourceNotFoundException$ = [-3, n0, _RNFE, { [_e]: _c, [_hE]: 404 }, [_m], [0]];
n0_registry.registerError(exports.ResourceNotFoundException$, errors_1.ResourceNotFoundException);
exports.TooManyRequestsException$ = [-3, n0, _TMRE, { [_e]: _c, [_hE]: 429 }, [_m], [0]];
n0_registry.registerError(exports.TooManyRequestsException$, errors_1.TooManyRequestsException);
exports.UnauthorizedException$ = [-3, n0, _UE, { [_e]: _c, [_hE]: 401 }, [_m], [0]];
n0_registry.registerError(exports.UnauthorizedException$, errors_1.UnauthorizedException);
exports.errorTypeRegistries = [_s_registry, n0_registry];
var AccessTokenType = [0, n0, _ATT, 8, 0];
var SecretAccessKeyType = [0, n0, _SAKT, 8, 0];
var SessionTokenType = [0, n0, _STT, 8, 0];
exports.GetRoleCredentialsRequest$ = [
    3,
    n0,
    _GRCR,
    0,
    [_rN, _aI, _aT],
    [
        [0, { [_hQ]: _rn }],
        [0, { [_hQ]: _ai }],
        [() => AccessTokenType, { [_hH]: _xasbt }],
    ],
    3,
];
exports.GetRoleCredentialsResponse$ = [
    3,
    n0,
    _GRCRe,
    0,
    [_rC],
    [[() => exports.RoleCredentials$, 0]],
];
exports.RoleCredentials$ = [
    3,
    n0,
    _RC,
    0,
    [_aKI, _sAK, _sT, _ex],
    [0, [() => SecretAccessKeyType, 0], [() => SessionTokenType, 0], 1],
];
exports.GetRoleCredentials$ = [
    9,
    n0,
    _GRC,
    { [_h]: ["GET", "/federation/credentials", 200] },
    () => exports.GetRoleCredentialsRequest$,
    () => exports.GetRoleCredentialsResponse$,
];


/***/ }),

/***/ 75433:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var client = __webpack_require__(5152);
var httpAuthSchemes = __webpack_require__(97523);
var propertyProvider = __webpack_require__(71238);
var sharedIniFileLoader = __webpack_require__(94964);
var node_fs = __webpack_require__(73024);

const fromEnvSigningName = ({ logger, signingName } = {}) => async () => {
    logger?.debug?.("@aws-sdk/token-providers - fromEnvSigningName");
    if (!signingName) {
        throw new propertyProvider.TokenProviderError("Please pass 'signingName' to compute environment variable key", { logger });
    }
    const bearerTokenKey = httpAuthSchemes.getBearerTokenEnvKey(signingName);
    if (!(bearerTokenKey in process.env)) {
        throw new propertyProvider.TokenProviderError(`Token not present in '${bearerTokenKey}' environment variable`, { logger });
    }
    const token = { token: process.env[bearerTokenKey] };
    client.setTokenFeature(token, "BEARER_SERVICE_ENV_VARS", "3");
    return token;
};

const EXPIRE_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_MESSAGE = `To refresh this SSO session run 'aws sso login' with the corresponding profile.`;

const getSsoOidcClient = async (ssoRegion, init = {}, callerClientConfig) => {
    const { SSOOIDCClient } = await __webpack_require__.e(/* import() */ 443).then(__webpack_require__.t.bind(__webpack_require__, 89443, 23));
    const coalesce = (prop) => init.clientConfig?.[prop] ?? init.parentClientConfig?.[prop] ?? callerClientConfig?.[prop];
    const ssoOidcClient = new SSOOIDCClient(Object.assign({}, init.clientConfig ?? {}, {
        region: ssoRegion ?? init.clientConfig?.region,
        logger: coalesce("logger"),
        userAgentAppId: coalesce("userAgentAppId"),
    }));
    return ssoOidcClient;
};

const getNewSsoOidcToken = async (ssoToken, ssoRegion, init = {}, callerClientConfig) => {
    const { CreateTokenCommand } = await __webpack_require__.e(/* import() */ 443).then(__webpack_require__.t.bind(__webpack_require__, 89443, 23));
    const ssoOidcClient = await getSsoOidcClient(ssoRegion, init, callerClientConfig);
    return ssoOidcClient.send(new CreateTokenCommand({
        clientId: ssoToken.clientId,
        clientSecret: ssoToken.clientSecret,
        refreshToken: ssoToken.refreshToken,
        grantType: "refresh_token",
    }));
};

const validateTokenExpiry = (token) => {
    if (token.expiration && token.expiration.getTime() < Date.now()) {
        throw new propertyProvider.TokenProviderError(`Token is expired. ${REFRESH_MESSAGE}`, false);
    }
};

const validateTokenKey = (key, value, forRefresh = false) => {
    if (typeof value === "undefined") {
        throw new propertyProvider.TokenProviderError(`Value not present for '${key}' in SSO Token${forRefresh ? ". Cannot refresh" : ""}. ${REFRESH_MESSAGE}`, false);
    }
};

const { writeFile } = node_fs.promises;
const writeSSOTokenToFile = (id, ssoToken) => {
    const tokenFilepath = sharedIniFileLoader.getSSOTokenFilepath(id);
    const tokenString = JSON.stringify(ssoToken, null, 2);
    return writeFile(tokenFilepath, tokenString);
};

const lastRefreshAttemptTime = new Date(0);
const fromSso = (init = {}) => async ({ callerClientConfig } = {}) => {
    init.logger?.debug("@aws-sdk/token-providers - fromSso");
    const profiles = await sharedIniFileLoader.parseKnownFiles(init);
    const profileName = sharedIniFileLoader.getProfileName({
        profile: init.profile ?? callerClientConfig?.profile,
    });
    const profile = profiles[profileName];
    if (!profile) {
        throw new propertyProvider.TokenProviderError(`Profile '${profileName}' could not be found in shared credentials file.`, false);
    }
    else if (!profile["sso_session"]) {
        throw new propertyProvider.TokenProviderError(`Profile '${profileName}' is missing required property 'sso_session'.`);
    }
    const ssoSessionName = profile["sso_session"];
    const ssoSessions = await sharedIniFileLoader.loadSsoSessionData(init);
    const ssoSession = ssoSessions[ssoSessionName];
    if (!ssoSession) {
        throw new propertyProvider.TokenProviderError(`Sso session '${ssoSessionName}' could not be found in shared credentials file.`, false);
    }
    for (const ssoSessionRequiredKey of ["sso_start_url", "sso_region"]) {
        if (!ssoSession[ssoSessionRequiredKey]) {
            throw new propertyProvider.TokenProviderError(`Sso session '${ssoSessionName}' is missing required property '${ssoSessionRequiredKey}'.`, false);
        }
    }
    ssoSession["sso_start_url"];
    const ssoRegion = ssoSession["sso_region"];
    let ssoToken;
    try {
        ssoToken = await sharedIniFileLoader.getSSOTokenFromFile(ssoSessionName);
    }
    catch (e) {
        throw new propertyProvider.TokenProviderError(`The SSO session token associated with profile=${profileName} was not found or is invalid. ${REFRESH_MESSAGE}`, false);
    }
    validateTokenKey("accessToken", ssoToken.accessToken);
    validateTokenKey("expiresAt", ssoToken.expiresAt);
    const { accessToken, expiresAt } = ssoToken;
    const existingToken = { token: accessToken, expiration: new Date(expiresAt) };
    if (existingToken.expiration.getTime() - Date.now() > EXPIRE_WINDOW_MS) {
        return existingToken;
    }
    if (Date.now() - lastRefreshAttemptTime.getTime() < 30 * 1000) {
        validateTokenExpiry(existingToken);
        return existingToken;
    }
    validateTokenKey("clientId", ssoToken.clientId, true);
    validateTokenKey("clientSecret", ssoToken.clientSecret, true);
    validateTokenKey("refreshToken", ssoToken.refreshToken, true);
    try {
        lastRefreshAttemptTime.setTime(Date.now());
        const newSsoOidcToken = await getNewSsoOidcToken(ssoToken, ssoRegion, init, callerClientConfig);
        validateTokenKey("accessToken", newSsoOidcToken.accessToken);
        validateTokenKey("expiresIn", newSsoOidcToken.expiresIn);
        const newTokenExpiration = new Date(Date.now() + newSsoOidcToken.expiresIn * 1000);
        try {
            await writeSSOTokenToFile(ssoSessionName, {
                ...ssoToken,
                accessToken: newSsoOidcToken.accessToken,
                expiresAt: newTokenExpiration.toISOString(),
                refreshToken: newSsoOidcToken.refreshToken,
            });
        }
        catch (error) {
        }
        return {
            token: newSsoOidcToken.accessToken,
            expiration: newTokenExpiration,
        };
    }
    catch (error) {
        validateTokenExpiry(existingToken);
        return existingToken;
    }
};

const fromStatic = ({ token, logger }) => async () => {
    logger?.debug("@aws-sdk/token-providers - fromStatic");
    if (!token || !token.token) {
        throw new propertyProvider.TokenProviderError(`Please pass a valid token to fromStatic`, false);
    }
    return token;
};

const nodeProvider = (init = {}) => propertyProvider.memoize(propertyProvider.chain(fromSso(init), async () => {
    throw new propertyProvider.TokenProviderError("Could not load token from any providers", false);
}), (token) => token.expiration !== undefined && token.expiration.getTime() - Date.now() < 300000, (token) => token.expiration !== undefined);

exports.fromEnvSigningName = fromEnvSigningName;
exports.fromSso = fromSso;
exports.fromStatic = fromStatic;
exports.nodeProvider = nodeProvider;


/***/ }),

/***/ 39955:
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"name":"@aws-sdk/nested-clients","version":"3.997.4","description":"Nested clients for AWS SDK packages.","main":"./dist-cjs/index.js","module":"./dist-es/index.js","types":"./dist-types/index.d.ts","scripts":{"build":"yarn lint && concurrently \'yarn:build:types\' \'yarn:build:es\' && yarn build:cjs","build:cjs":"node ../../scripts/compilation/inline nested-clients","build:es":"tsc -p tsconfig.es.json","build:include:deps":"yarn g:turbo run build -F=\\"$npm_package_name\\"","build:types":"tsc -p tsconfig.types.json","build:types:downlevel":"downlevel-dts dist-types dist-types/ts3.4","clean":"premove dist-cjs dist-es dist-types tsconfig.cjs.tsbuildinfo tsconfig.es.tsbuildinfo tsconfig.types.tsbuildinfo","lint":"node ../../scripts/validation/submodules-linter.js --pkg nested-clients","test":"yarn g:vitest run","test:watch":"yarn g:vitest watch"},"engines":{"node":">=20.0.0"},"sideEffects":false,"author":{"name":"AWS SDK for JavaScript Team","url":"https://aws.amazon.com/javascript/"},"license":"Apache-2.0","dependencies":{"@aws-crypto/sha256-browser":"5.2.0","@aws-crypto/sha256-js":"5.2.0","@aws-sdk/core":"^3.974.6","@aws-sdk/middleware-host-header":"^3.972.10","@aws-sdk/middleware-logger":"^3.972.10","@aws-sdk/middleware-recursion-detection":"^3.972.11","@aws-sdk/middleware-user-agent":"^3.972.36","@aws-sdk/region-config-resolver":"^3.972.13","@aws-sdk/signature-v4-multi-region":"^3.996.23","@aws-sdk/types":"^3.973.8","@aws-sdk/util-endpoints":"^3.996.8","@aws-sdk/util-user-agent-browser":"^3.972.10","@aws-sdk/util-user-agent-node":"^3.973.22","@smithy/config-resolver":"^4.4.17","@smithy/core":"^3.23.17","@smithy/fetch-http-handler":"^5.3.17","@smithy/hash-node":"^4.2.14","@smithy/invalid-dependency":"^4.2.14","@smithy/middleware-content-length":"^4.2.14","@smithy/middleware-endpoint":"^4.4.32","@smithy/middleware-retry":"^4.5.6","@smithy/middleware-serde":"^4.2.20","@smithy/middleware-stack":"^4.2.14","@smithy/node-config-provider":"^4.3.14","@smithy/node-http-handler":"^4.6.1","@smithy/protocol-http":"^5.3.14","@smithy/smithy-client":"^4.12.13","@smithy/types":"^4.14.1","@smithy/url-parser":"^4.2.14","@smithy/util-base64":"^4.3.2","@smithy/util-body-length-browser":"^4.2.2","@smithy/util-body-length-node":"^4.2.3","@smithy/util-defaults-mode-browser":"^4.3.49","@smithy/util-defaults-mode-node":"^4.2.54","@smithy/util-endpoints":"^3.4.2","@smithy/util-middleware":"^4.2.14","@smithy/util-retry":"^4.3.5","@smithy/util-utf8":"^4.2.2","tslib":"^2.6.2"},"devDependencies":{"concurrently":"7.0.0","downlevel-dts":"0.10.1","premove":"4.0.0","typescript":"~5.8.3"},"typesVersions":{"<4.5":{"dist-types/*":["dist-types/ts3.4/*"]}},"files":["./cognito-identity.d.ts","./cognito-identity.js","./signin.d.ts","./signin.js","./sso-oidc.d.ts","./sso-oidc.js","./sso.d.ts","./sso.js","./sts.d.ts","./sts.js","dist-*/**"],"browser":{"./dist-es/submodules/cognito-identity/runtimeConfig":"./dist-es/submodules/cognito-identity/runtimeConfig.browser","./dist-es/submodules/signin/runtimeConfig":"./dist-es/submodules/signin/runtimeConfig.browser","./dist-es/submodules/sso-oidc/runtimeConfig":"./dist-es/submodules/sso-oidc/runtimeConfig.browser","./dist-es/submodules/sso/runtimeConfig":"./dist-es/submodules/sso/runtimeConfig.browser","./dist-es/submodules/sts/runtimeConfig":"./dist-es/submodules/sts/runtimeConfig.browser"},"react-native":{},"homepage":"https://github.com/aws/aws-sdk-js-v3/tree/main/packages/nested-clients","repository":{"type":"git","url":"https://github.com/aws/aws-sdk-js-v3.git","directory":"packages/nested-clients"},"exports":{"./package.json":"./package.json","./sso-oidc":{"types":"./dist-types/submodules/sso-oidc/index.d.ts","module":"./dist-es/submodules/sso-oidc/index.js","node":"./dist-cjs/submodules/sso-oidc/index.js","import":"./dist-es/submodules/sso-oidc/index.js","require":"./dist-cjs/submodules/sso-oidc/index.js"},"./sts":{"types":"./dist-types/submodules/sts/index.d.ts","module":"./dist-es/submodules/sts/index.js","node":"./dist-cjs/submodules/sts/index.js","import":"./dist-es/submodules/sts/index.js","require":"./dist-cjs/submodules/sts/index.js"},"./signin":{"types":"./dist-types/submodules/signin/index.d.ts","module":"./dist-es/submodules/signin/index.js","node":"./dist-cjs/submodules/signin/index.js","import":"./dist-es/submodules/signin/index.js","require":"./dist-cjs/submodules/signin/index.js"},"./cognito-identity":{"types":"./dist-types/submodules/cognito-identity/index.d.ts","module":"./dist-es/submodules/cognito-identity/index.js","node":"./dist-cjs/submodules/cognito-identity/index.js","import":"./dist-es/submodules/cognito-identity/index.js","require":"./dist-cjs/submodules/cognito-identity/index.js"},"./sso":{"types":"./dist-types/submodules/sso/index.d.ts","module":"./dist-es/submodules/sso/index.js","node":"./dist-cjs/submodules/sso/index.js","import":"./dist-es/submodules/sso/index.js","require":"./dist-cjs/submodules/sso/index.js"}}}');

/***/ })

};
;