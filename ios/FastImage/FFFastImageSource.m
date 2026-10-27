#import "FFFastImageSource.h"
#import <SDWebImage/SDWebImageDownloader.h>
#import <SDWebImage/SDWebImageDownloaderResponseModifier.h>
#import <SDWebImage/SDWebImageDownloaderDecryptor.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImageDownloaderOperation.h>
#import <SDWebImage/NSData+ImageContentType.h>
#import <SDWebImage/SDImageCodersManager.h>
#import <SDWebImage/SDImageAWebPCoder.h>
#import "FFFAnimatedWebPCoder.h"
#import "FFFAnimatedAVIFCoder.h"
#import <SDWebImageSVGCoder/SDImageSVGCoder.h>
#import <SDWebImagePhotosPlugin/SDImagePhotosLoader.h>
#import <Photos/Photos.h>
#import <ImageIO/ImageIO.h>
#import <CommonCrypto/CommonDigest.h>

// In FFFastImageView.m.
FOUNDATION_EXTERN NSString *FFFErrorMessage(NSError *error);

static NSUInteger const FFFWebCacheSize = 50 * 1024 * 1024;

// The photo's own size in pixels, looked up by its identifier (the url after
// ph://), or zero.
static CGSize FFFLookUpPhotoPixelSize(NSURL *url)
{
    NSString *prefix = @"ph://";
    NSString *string = url.absoluteString;
    if (![string hasPrefix:prefix]) {
        return CGSizeZero;
    }
    PHAsset *asset = [PHAsset fetchAssetsWithLocalIdentifiers:@[[string substringFromIndex:prefix.length]] options:nil].firstObject;
    return asset ? CGSizeMake(asset.pixelWidth, asset.pixelHeight) : CGSizeZero;
}

static NSCache<NSString *, NSValue *> *FFFPhotoSizes(void)
{
    static NSCache *sizes;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        sizes = [NSCache new];
    });
    return sizes;
}

static CGSize FFFPhotoPixelSize(NSURL *url)
{
    NSString *key = url.absoluteString;
    NSValue *known = key ? [FFFPhotoSizes() objectForKey:key] : nil;
    if (known) {
        return known.CGSizeValue;
    }
    CGSize size = FFFLookUpPhotoPixelSize(url);
    if (key && size.width > 0 && size.height > 0) {
        [FFFPhotoSizes() setObject:[NSValue valueWithCGSize:size] forKey:key];
    }
    return size;
}

// An image in the app by its name (`uri: 'my_image'`), such as one in the
// app's asset catalog, as React Native's Image takes: RCTConvert makes a uri
// without a scheme a file in the app's resources, where such an image isn't a
// file. The name, or nil if the url is a file that exists or isn't in the
// app's resources.
static NSString *FFFBundleAssetName(NSURL *url)
{
    if (!url.isFileURL) {
        return nil;
    }
    NSString *resources = [NSBundle.mainBundle.resourcePath stringByAppendingString:@"/"];
    NSString *path = url.path;
    if (![path hasPrefix:resources] || path.length == resources.length ||
        [NSFileManager.defaultManager fileExistsAtPath:path]) {
        return nil;
    }
    return [path substringFromIndex:resources.length];
}

// Loads images in the app by name (FFFBundleAssetName) with UIImage
// imageNamed:, which finds them in the asset catalog (and image files in the
// app's resources, e.g. with @2x and @3x versions), as React Native's Image
// does.
@interface FFFBundleAssetLoader : NSObject <SDImageLoader>
@end

@implementation FFFBundleAssetLoader

+ (FFFBundleAssetLoader *)sharedLoader
{
    static FFFBundleAssetLoader *loader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        loader = [FFFBundleAssetLoader new];
    });
    return loader;
}

- (BOOL)canRequestImageForURL:(NSURL *)url
{
    return YES;
}

- (id<SDWebImageOperation>)requestImageWithURL:(NSURL *)url
                                        options:(SDWebImageOptions)options
                                        context:(SDWebImageContext *)context
                                       progress:(SDImageLoaderProgressBlock)progressBlock
                                      completed:(SDImageLoaderCompletedBlock)completedBlock
{
    NSString *name = FFFBundleAssetName(url);
    UIImage *image = name ? [UIImage imageNamed:name] : nil;
    if (completedBlock) {
        if (image) {
            completedBlock(image, nil, nil, YES);
        } else {
            NSString *message = [NSString stringWithFormat:@"No image named %@ in the app", name ?: url.path];
            completedBlock(nil, nil, [NSError errorWithDomain:SDWebImageErrorDomain code:SDWebImageErrorInvalidURL userInfo:@{NSLocalizedDescriptionKey: message}], YES);
        }
    }
    return nil;
}

- (BOOL)shouldBlockFailedURLWithURL:(NSURL *)url error:(NSError *)error
{
    return NO;
}

@end

// Loads photo library images (ph://<localIdentifier>) with
// SDWebImagePhotosPlugin's loader, its own instance, so the app's use of the
// plugin is left as it is. For a source it can't load (assets-library://),
// the load fails with `failure`.
@interface FFFPhotosLoader : NSObject <SDImageLoader>
@property (nonatomic, strong) SDImagePhotosLoader *plugin;
@property (nonatomic, copy) NSString *failure;
@end

@implementation FFFPhotosLoader

+ (FFFPhotosLoader *)photosLoader
{
    static FFFPhotosLoader *loader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        loader = [FFFPhotosLoader new];
        SDImagePhotosLoader *plugin = [SDImagePhotosLoader new];
        // One image per load, at full quality. By default the plugin first
        // sends a quick low quality one, which a view would show (and fade
        // in) before the one it asked for.
        plugin.imageRequestOptions.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
        loader.plugin = plugin;
    });
    return loader;
}

+ (FFFPhotosLoader *)assetsLibraryLoader
{
    static FFFPhotosLoader *loader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        loader = [FFFPhotosLoader new];
        loader.failure = @"assets-library:// urls aren't supported: use the photo's ph:// url (with SDWebImagePhotosPlugin)";
    });
    return loader;
}

- (BOOL)canRequestImageForURL:(NSURL *)url
{
    return YES;
}

- (id<SDWebImageOperation>)requestImageWithURL:(NSURL *)url
                                        options:(SDWebImageOptions)options
                                        context:(SDWebImageContext *)context
                                       progress:(SDImageLoaderProgressBlock)progressBlock
                                      completed:(SDImageLoaderCompletedBlock)completedBlock
{
    if (!self.plugin) {
        if (completedBlock) {
            NSError *error = [NSError errorWithDomain:SDWebImageErrorDomain code:SDWebImageErrorInvalidURL userInfo:@{NSLocalizedDescriptionKey: self.failure}];
            completedBlock(nil, nil, error, YES);
        }
        return nil;
    }
    return [self.plugin requestImageWithURL:url options:options context:context progress:progressBlock completed:^(UIImage *image, NSData *data, NSError *error, BOOL finished) {
        if (!image || !completedBlock) {
            if (completedBlock) {
                completedBlock(image, data, error, finished);
            }
            return;
        }
        // Looks up the photo's own size for onLoad here, off the main thread
        // (the image is decoded at about the view's size).
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            FFFPhotoPixelSize(url);
            dispatch_async(dispatch_get_main_queue(), ^{
                completedBlock(image, data, error, finished);
            });
        });
    }];
}

- (BOOL)shouldBlockFailedURLWithURL:(NSURL *)url error:(NSError *)error
{
    return self.plugin ? [self.plugin shouldBlockFailedURLWithURL:url error:error] : NO;
}

@end

// Downloads `cache: 'web'` images. The HTTP cache only stores a response whose
// body is an image: a page sent instead (e.g. a captive portal's, with status
// 200) would be served from there until it expired, and each load would fail.
// Removing it after a load failed (forgetResponseAfterError:) could still be
// in progress when the next load started. A page with an inline <svg> isn't
// an SVG image.
@interface FFFWebDownloaderOperation : SDWebImageDownloaderOperation
@end

// The key, in a stored response's userInfo, of the clear it came after (see
// clearWebURLCache).
static NSString *const FFFCacheTokenKey = @"FFFastImageCacheToken";

// A new value at each clearWebURLCache (and one for the launch until then).
// Not the time: a change of the device's clock would move it.
static NSString *FFFWebURLCacheToken;

// When clearWebURLCache last ran, in seconds since the device started, or 0.
static NSTimeInterval FFFWebURLCacheClearedAt;

// How long after a clear loads check the response they'd get: the removal
// takes about 10 ms, longer on a busy device. Each check is a cache lookup.
static const NSTimeInterval FFFWebURLCacheClearCheck = 5;

static NSString *FFFCurrentWebURLCacheToken(void)
{
    @synchronized ([FFFastImageSource class]) {
        if (!FFFWebURLCacheToken) {
            FFFWebURLCacheToken = NSUUID.UUID.UUIDString;
        }
        return FFFWebURLCacheToken;
    }
}

@implementation FFFWebDownloaderOperation

// Whether data is an SVG document: its first element (after an XML
// declaration, comments or a doctype) is <svg>, as on Android
// (FastImageSvg.looksLikeSvg). SDWebImage takes data that starts with '<' and
// has an <svg> element anywhere for SVG, such as a page with an icon.
static BOOL FFFHasPrefixAt(NSString *text, NSUInteger i, NSString *prefix)
{
    return text.length - i >= prefix.length && [text compare:prefix options:0 range:NSMakeRange(i, prefix.length)] == NSOrderedSame;
}

// The index after the end marker from i, or NSNotFound if it isn't there.
static NSUInteger FFFSkipPast(NSString *text, NSUInteger i, NSString *end)
{
    NSRange found = [text rangeOfString:end options:0 range:NSMakeRange(i, text.length - i)];
    return found.location == NSNotFound ? NSNotFound : NSMaxRange(found);
}

static BOOL FFFLooksLikeSVG(NSData *data)
{
    // The markup is ASCII: Latin-1 reads any bytes (a UTF-8 character cut off
    // at the end too).
    NSData *head = [data subdataWithRange:NSMakeRange(0, MIN(data.length, (NSUInteger)1024))];
    NSString *text = [[[NSString alloc] initWithData:head encoding:NSISOLatin1StringEncoding] lowercaseString];
    NSCharacterSet *space = NSCharacterSet.whitespaceAndNewlineCharacterSet;
    // A UTF-8 byte order mark, as Latin-1.
    NSUInteger i = FFFHasPrefixAt(text, 0, @"\u00EF\u00BB\u00BF") ? 3 : 0;
    while (i < text.length) {
        if ([space characterIsMember:[text characterAtIndex:i]]) {
            i++;
        } else if (FFFHasPrefixAt(text, i, @"<?")) {
            i = FFFSkipPast(text, i, @"?>");
        } else if (FFFHasPrefixAt(text, i, @"<!--")) {
            i = FFFSkipPast(text, i, @"-->");
        } else if (FFFHasPrefixAt(text, i, @"<!")) {
            // A doctype, whose internal subset ([...]) can have '>'s.
            NSRange rest = NSMakeRange(i, text.length - i);
            NSUInteger subset = [text rangeOfString:@"[" options:0 range:rest].location;
            NSUInteger close = [text rangeOfString:@">" options:0 range:rest].location;
            if (subset != NSNotFound && subset < close) {
                i = FFFSkipPast(text, subset, @"]");
            }
            if (i != NSNotFound) {
                i = FFFSkipPast(text, i, @">");
            }
        } else {
            return FFFHasPrefixAt(text, i, @"<svg");
        }
        if (i == NSNotFound) {
            return NO;
        }
    }
    return NO;
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
 willCacheResponse:(NSCachedURLResponse *)proposedResponse
 completionHandler:(void (^)(NSCachedURLResponse *cachedResponse))completionHandler
{
    if (![FFFastImageSource isImageData:proposedResponse.data]) {
        completionHandler(nil);
        return;
    }
    // The clear it came after (see clearWebURLCache).
    NSMutableDictionary *userInfo = [proposedResponse.userInfo mutableCopy] ?: [NSMutableDictionary dictionary];
    userInfo[FFFCacheTokenKey] = FFFCurrentWebURLCacheToken();
    NSCachedURLResponse *response = [[NSCachedURLResponse alloc] initWithResponse:proposedResponse.response
                                                                             data:proposedResponse.data
                                                                         userInfo:userInfo
                                                                    storagePolicy:proposedResponse.storagePolicy];
    [super URLSession:session dataTask:dataTask willCacheResponse:response completionHandler:completionHandler];
}

@end

// Reads data uris: a downloader of their own, so they don't wait for a slot
// behind downloads (SDWebImage's shared downloader runs 6 at a time), without
// an HTTP cache, and a data uri that isn't an image isn't kept in the manager's
// failed urls (the whole uri, for the app's life).
@interface FFFDataUriDownloader : SDWebImageDownloader
@end

@implementation FFFDataUriDownloader

+ (instancetype)sharedDownloader
{
    static FFFDataUriDownloader *downloader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        SDWebImageDownloaderConfig *config = [SDWebImageDownloaderConfig new];
        NSURLSessionConfiguration *session = [NSURLSessionConfiguration ephemeralSessionConfiguration];
        session.URLCache = nil;
        config.sessionConfiguration = session;
        config.maxConcurrentDownloads = 8;
        downloader = [[FFFDataUriDownloader alloc] initWithConfig:config];
    });
    return downloader;
}

- (BOOL)shouldBlockFailedURLWithURL:(NSURL *)url error:(NSError *)error
{
    return NO;
}

- (BOOL)shouldBlockFailedURLWithURL:(NSURL *)url error:(NSError *)error options:(SDWebImageOptions)options context:(SDWebImageContext *)context
{
    return NO;
}

@end

@implementation FFFastImageSource

+ (void)initialize
{
    if (self != [FFFastImageSource class]) {
        return;
    }
    // Animated WebP: SDWebImage's own coders only decode a WebP's first frame
    // (with ImageIO), so libwebp's coder decodes animated ones (still ones
    // keep ImageIO's). Not if the app has registered a WebP coder (libwebp's,
    // or ImageIO's animated one), which is its choice.
    BOOL hasWebPCoder = NO;
    for (id<SDImageCoder> registered in SDImageCodersManager.sharedManager.coders) {
        if ([registered isKindOfClass:[SDImageWebPCoder class]] || [registered isKindOfClass:[SDImageAWebPCoder class]]) {
            hasWebPCoder = YES;
            break;
        }
    }
    if (!hasWebPCoder) {
        [SDImageCodersManager.sharedManager addCoder:FFFAnimatedWebPCoder.sharedCoder];
    }

    // Animated AVIF: likewise, SDWebImage's own coders only decode an AVIF's
    // first frame, so ImageIO's animated decoding does (iOS 16 and later).
    // Not if the app has registered libavif's coder (SDWebImageAVIFCoder).
    Class avifCoderClass = NSClassFromString(@"SDImageAVIFCoder");
    BOOL hasAVIFCoder = NO;
    for (id<SDImageCoder> registered in SDImageCodersManager.sharedManager.coders) {
        if (avifCoderClass && [registered isKindOfClass:avifCoderClass]) {
            hasAVIFCoder = YES;
            break;
        }
    }
    if (!hasAVIFCoder) {
        [SDImageCodersManager.sharedManager addCoder:FFFAnimatedAVIFCoder.sharedCoder];
    }

    // SVG (SDWebImageSVGCoder): registered with SDWebImage's coders, as the
    // pod's setup does (unless the app has already): SDWebImage then picks it
    // for SVG data, including for FastImage's animated and downsampled image
    // classes. Giving the coder per load instead (SDWebImageContextImageCoder)
    // would make it the only coder for everything in that load.
    for (id<SDImageCoder> registered in SDImageCodersManager.sharedManager.coders) {
        if ([registered isKindOfClass:[SDImageSVGCoder class]]) {
            return;
        }
    }
    [SDImageCodersManager.sharedManager addCoder:SDImageSVGCoder.sharedCoder];
}

- (instancetype)initWithURL:(NSURL *)url
                   priority:(FFFPriority)priority
                    headers:(NSDictionary *)headers
               cacheControl:(FFFCacheControl)cacheControl
{
    self = [super init];
    if (self) {
        _url = url;
        _priority = priority;
        _headers = headers;
        _cacheControl = cacheControl;
        _memoryCache = YES;
        _diskCache = YES;
    }
    return self;
}

- (SDWebImageCacheKeyFilter *)cacheKeyFilter
{
    NSString* cacheKey = _cacheKey;
    // A data uri can be hundreds of kilobytes, and SDWebImage parses its
    // cache keys as urls: a hash of it instead.
    if (cacheKey.length == 0 && [self isDataUri]) {
        cacheKey = [self dataUriKey];
    }
    // `cache: 'web'` follows the HTTP cache, which is keyed by url.
    if (cacheKey.length == 0 || self.cacheControl == FFFCacheControlWeb) {
        return nil;
    }
    return [SDWebImageCacheKeyFilter cacheKeyFilterWithBlock: ^NSString* _Nullable (NSURL* _Nonnull url) {
        return cacheKey;
    }];
}

- (SDWebImageOptions)cacheOptions
{
    switch (self.cacheControl) {
        case FFFCacheControlWeb:
            // Without the disk cache, nor the HTTP cache: without this option
            // SDWebImage's requests neither read it nor store their responses
            // there.
            return self.diskCache ? SDWebImageRefreshCached : 0;
        case FFFCacheControlCacheOnly:
            return SDWebImageFromCacheOnly;
        case FFFCacheControlImmutable:
            return 0;
    }
    return 0;
}

- (NSString *)errorMessage:(NSError *)error
{
    return FFFErrorMessage(error);
}

- (BOOL)isPhotoLibrary
{
    return [_url.scheme isEqualToString:@"ph"];
}

- (BOOL)isDataUri
{
    NSString *scheme = _url.scheme;
    return scheme && [scheme caseInsensitiveCompare:@"data"] == NSOrderedSame;
}

// A data uri's data is the app's own, so `cache` doesn't apply to it (it's
// never downloaded: `cacheOnly` would never load it, and `web`'s HTTP cache
// would keep it on disk), and it isn't kept in the disk cache.
- (FFFCacheControl)cacheControl
{
    return [self isDataUri] ? FFFCacheControlImmutable : _cacheControl;
}

- (BOOL)diskCache
{
    return _diskCache && ![self isDataUri];
}

// A data uri's cache key: a SHA-256 of the uri, worked out once per uri (a
// source is made again for every prop change and mount).
- (NSString *)dataUriKey
{
    static NSCache<NSString *, NSString *> *keys;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        keys = [NSCache new];
        keys.countLimit = 200;
    });
    NSString *uri = _url.absoluteString;
    NSString *key = [keys objectForKey:uri];
    if (key) {
        return key;
    }
    NSData *data = [uri dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *hex = [NSMutableString stringWithString:@"fastimage-data-uri:"];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
        [hex appendFormat:@"%02x", digest[i]];
    }
    [keys setObject:hex forKey:uri];
    return hex;
}

- (CGSize)photoPixelSize
{
    return [self isPhotoLibrary] ? FFFPhotoPixelSize(_url) : CGSizeZero;
}

- (id<SDImageLoader>)imageLoader
{
    if ([self isPhotoLibrary]) {
        return [FFFPhotosLoader photosLoader];
    }
    if ([_url.scheme isEqualToString:@"assets-library"]) {
        return [FFFPhotosLoader assetsLibraryLoader];
    }
    if (FFFBundleAssetName(_url)) {
        return [FFFBundleAssetLoader sharedLoader];
    }
    if ([self isDataUri]) {
        return [FFFDataUriDownloader sharedDownloader];
    }
    if (self.cacheControl != FFFCacheControlWeb) {
        return nil;
    }
    static SDWebImageDownloader *downloader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // As SDWebImage's shared downloader is set up, with the HTTP cache.
        SDWebImageDownloaderConfig *config = [SDWebImageDownloader.sharedDownloader.config copy];
        NSURLSessionConfiguration *session = [(config.sessionConfiguration ?: NSURLSessionConfiguration.defaultSessionConfiguration) copy];
        session.URLCache = [FFFastImageSource webURLCache];
        config.sessionConfiguration = session;
        // Unless the app set its own operation class.
        if (!config.operationClass || config.operationClass == [SDWebImageDownloaderOperation class]) {
            config.operationClass = [FFFWebDownloaderOperation class];
        }
        downloader = [[SDWebImageDownloader alloc] initWithConfig:config];
        // The shared downloader's response modifier and decryptor, when it
        // has them (as they are at each download). Its request modifier
        // wouldn't apply anyway: each load's own (for its headers) replaces
        // it. Headers set with setValue:forHTTPHeaderField: can't be read
        // back, so web images don't get those.
        downloader.responseModifier = [SDWebImageDownloaderResponseModifier responseModifierWithBlock:^NSURLResponse * _Nullable(NSURLResponse * _Nonnull response) {
            id<SDWebImageDownloaderResponseModifier> shared = SDWebImageDownloader.sharedDownloader.responseModifier;
            return shared ? [shared modifiedResponseWithResponse:response] : response;
        }];
        downloader.decryptor = [SDWebImageDownloaderDecryptor decryptorWithBlock:^NSData * _Nullable(NSData * _Nonnull data, NSURLResponse * _Nullable response) {
            id<SDWebImageDownloaderDecryptor> shared = SDWebImageDownloader.sharedDownloader.decryptor;
            return shared ? [shared decryptedDataWithData:data response:response] : data;
        }];
    });
    return downloader;
}

- (void)forgetResponseAfterError:(NSError *)error
{
    if (self.cacheControl != FFFCacheControlWeb || !_url) {
        return;
    }
    if (![error.domain isEqualToString:SDWebImageErrorDomain] || error.code != SDWebImageErrorBadImageData) {
        return;
    }
    [[FFFastImageSource webURLCache] removeCachedResponseForRequest:[NSURLRequest requestWithURL:_url]];
}

+ (BOOL)isImageData:(NSData *)data
{
    SDImageFormat format = [NSData sd_imageFormatForImageData:data];
    if (format == SDImageFormatSVG) {
        return FFFLooksLikeSVG(data);
    }
    if (format != SDImageFormatUndefined) {
        return YES;
    }
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (!source) {
        return NO;
    }
    BOOL image = CGImageSourceGetType(source) != NULL && CGImageSourceGetCount(source) > 0;
    CFRelease(source);
    return image;
}

+ (NSURLCache *)webURLCache
{
    static NSURLCache *cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSString *name = @"fast-image-http-cache";
        NSURL *caches = [NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
        cache = [[NSURLCache alloc] initWithMemoryCapacity:0
                                              diskCapacity:FFFWebCacheSize
                                              directoryURL:[caches URLByAppendingPathComponent:name]];
    });
    return cache;
}

+ (void)clearWebURLCache
{
    @synchronized (self) {
        FFFWebURLCacheToken = NSUUID.UUID.UUIDString;
        FFFWebURLCacheClearedAt = NSProcessInfo.processInfo.systemUptime;
    }
    [self.webURLCache removeAllCachedResponses];
}

// Whether the HTTP cache's response to the request was stored before the last
// clearWebURLCache (or has no token: stored by an app's own operation class),
// in the few seconds after it.
+ (BOOL)isCachedBeforeClear:(NSURLRequest *)request
{
    NSString *token;
    NSTimeInterval clearedAt;
    @synchronized (self) {
        token = FFFWebURLCacheToken;
        clearedAt = FFFWebURLCacheClearedAt;
    }
    if (clearedAt == 0 || NSProcessInfo.processInfo.systemUptime - clearedAt > FFFWebURLCacheClearCheck) {
        return NO;
    }
    NSCachedURLResponse *cached = [self.webURLCache cachedResponseForRequest:request];
    return cached && ![cached.userInfo[FFFCacheTokenKey] isEqual:token];
}

- (SDWebImageDownloaderRequestModifier *)requestModifier
{
    NSDictionary* headers = _headers;
    BOOL web = self.cacheControl == FFFCacheControlWeb;
    return [SDWebImageDownloaderRequestModifier requestModifierWithBlock: ^NSURLRequest* _Nullable (NSURLRequest* _Nonnull request) {
        NSMutableURLRequest* mutableRequest = [request mutableCopy];
        for (NSString* header in headers) {
            NSString* value = headers[header];
            [mutableRequest setValue: value forHTTPHeaderField: header];
        }
        if (web && [FFFastImageSource isCachedBeforeClear:mutableRequest]) {
            mutableRequest.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
        }
        return [mutableRequest copy];
    }];
}

@end
