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
#import <objc/message.h>

// In FFFastImageView.m.
FOUNDATION_EXTERN NSString *FFFErrorMessage(NSError *error);

static NSUInteger const FFFWebCacheSize = 50 * 1024 * 1024;

// The photo's own size in pixels, looked up by its identifier (the url after
// ph://), or zero. Through the runtime, as the Photos framework is only there
// with SDWebImagePhotosPlugin (on iOS, always). Kept once looked up.
static CGSize FFFLookUpPhotoPixelSize(NSURL *url)
{
    Class assetClass = NSClassFromString(@"PHAsset");
    SEL fetch = NSSelectorFromString(@"fetchAssetsWithLocalIdentifiers:options:");
    NSString *prefix = @"ph://";
    NSString *string = url.absoluteString;
    if (!assetClass || ![assetClass respondsToSelector:fetch] || ![string hasPrefix:prefix]) {
        return CGSizeZero;
    }
    id (*fetchAssets)(id, SEL, NSArray *, id) = (void *)objc_msgSend;
    id result = fetchAssets(assetClass, fetch, @[[string substringFromIndex:prefix.length]], nil);
    id asset = [result respondsToSelector:@selector(firstObject)] ? [result firstObject] : nil;
    if (!asset) {
        return CGSizeZero;
    }
    return CGSizeMake([[asset valueForKey:@"pixelWidth"] doubleValue], [[asset valueForKey:@"pixelHeight"] doubleValue]);
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

// Loads photo library images (ph://<localIdentifier>) with
// SDWebImagePhotosPlugin's loader: a dependency on iOS (the podspec), found
// at runtime so that tvOS builds without it (an app can add it there). Its
// own instance, so the app's use of the plugin is left as it is. Without the
// plugin, or for a source it can't load (assets-library://), the load fails
// with `failure`.
@interface FFFPhotosLoader : NSObject <SDImageLoader>
@property (nonatomic, strong) id<SDImageLoader> plugin;
@property (nonatomic, copy) NSString *failure;
@end

@implementation FFFPhotosLoader

+ (FFFPhotosLoader *)photosLoader
{
    static FFFPhotosLoader *loader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        loader = [FFFPhotosLoader new];
        Class pluginClass = NSClassFromString(@"SDImagePhotosLoader");
        id<SDImageLoader> plugin = pluginClass ? [pluginClass new] : nil;
        if ([plugin conformsToProtocol:@protocol(SDImageLoader)]) {
            // One image per load, at full quality. By default the plugin
            // first sends a quick low quality one, which a view would show
            // (and fade in) before the one it asked for.
            // PHImageRequestOptionsDeliveryModeHighQualityFormat. Skipped if
            // a later version of the plugin renames these.
            NSObject *requestOptions = [(NSObject *)plugin respondsToSelector:NSSelectorFromString(@"imageRequestOptions")]
                ? [(NSObject *)plugin valueForKey:@"imageRequestOptions"]
                : nil;
            if ([requestOptions respondsToSelector:NSSelectorFromString(@"setDeliveryMode:")]) {
                [requestOptions setValue:@1 forKey:@"deliveryMode"];
            }
            loader.plugin = plugin;
        } else {
            loader.failure = @"Photo library images (ph://) need SDWebImagePhotosPlugin: add pod 'SDWebImagePhotosPlugin' to the app's Podfile";
        }
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
    SDImageFormat format = [NSData sd_imageFormatForImageData:proposedResponse.data];
    if (format == SDImageFormatUndefined || (format == SDImageFormatSVG && !FFFLooksLikeSVG(proposedResponse.data))) {
        completionHandler(nil);
        return;
    }
    [super URLSession:session dataTask:dataTask willCacheResponse:proposedResponse completionHandler:completionHandler];
}

@end

// SDWebImageSVGCoder's coder, when the app has the pod (SVG images): found at
// runtime, so FastImage doesn't depend on it. Nil otherwise.
static id<SDImageCoder> FFFSVGCoder;

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

    // SVG: registered with SDWebImage's coders, as the pod's setup does (unless
    // the app has already): SDWebImage then picks it for SVG data, including
    // for FastImage's animated and downsampled image classes. Giving the
    // coder per load instead (SDWebImageContextImageCoder) would make it the
    // only coder for everything in that load. So the app's own SDWebImage
    // use can decode SVG too, which is what the pod is for.
    Class coderClass = NSClassFromString(@"SDImageSVGCoder");
    SEL shared = NSSelectorFromString(@"sharedCoder");
    if (!coderClass || ![coderClass respondsToSelector:shared]) {
        return;
    }
    id coder = ((id (*)(id, SEL))objc_msgSend)(coderClass, shared);
    if (![coder conformsToProtocol:@protocol(SDImageCoder)]) {
        return;
    }
    FFFSVGCoder = coder;
    for (id<SDImageCoder> registered in SDImageCodersManager.sharedManager.coders) {
        if ([registered isKindOfClass:coderClass]) {
            return;
        }
    }
    [SDImageCodersManager.sharedManager addCoder:coder];
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
    }
    return self;
}

- (SDWebImageCacheKeyFilter *)cacheKeyFilter
{
    NSString* cacheKey = _cacheKey;
    // `cache: 'web'` follows the HTTP cache, which is keyed by url.
    if (cacheKey.length == 0 || _cacheControl == FFFCacheControlWeb) {
        return nil;
    }
    return [SDWebImageCacheKeyFilter cacheKeyFilterWithBlock: ^NSString* _Nullable (NSURL* _Nonnull url) {
        return cacheKey;
    }];
}

- (SDWebImageOptions)cacheOptions
{
    switch (_cacheControl) {
        case FFFCacheControlWeb:
            return SDWebImageRefreshCached;
        case FFFCacheControlCacheOnly:
            return SDWebImageFromCacheOnly;
        case FFFCacheControlImmutable:
            return 0;
    }
    return 0;
}

- (NSString *)errorMessage:(NSError *)error
{
    if (!FFFSVGCoder && [error.domain isEqualToString:SDWebImageErrorDomain] && error.code == SDWebImageErrorBadImageData &&
        [_url.path.lowercaseString hasSuffix:@".svg"]) {
        return @"SVG images need SDWebImageSVGCoder: add pod 'SDWebImageSVGCoder' to the app's Podfile";
    }
    return FFFErrorMessage(error);
}

- (BOOL)isPhotoLibrary
{
    return [_url.scheme isEqualToString:@"ph"];
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
    if (_cacheControl != FFFCacheControlWeb) {
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
    if (_cacheControl != FFFCacheControlWeb || !_url) {
        return;
    }
    if (![error.domain isEqualToString:SDWebImageErrorDomain] || error.code != SDWebImageErrorBadImageData) {
        return;
    }
    [[FFFastImageSource webURLCache] removeCachedResponseForRequest:[NSURLRequest requestWithURL:_url]];
}

+ (NSURLCache *)webURLCache
{
    static NSURLCache *cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSString *name = @"fast-image-http-cache";
        if (@available(iOS 13.0, tvOS 13.0, *)) {
            NSURL *caches = [NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
            cache = [[NSURLCache alloc] initWithMemoryCapacity:0
                                                  diskCapacity:FFFWebCacheSize
                                                  directoryURL:[caches URLByAppendingPathComponent:name]];
        } else {
            // In the app's caches directory.
            cache = [[NSURLCache alloc] initWithMemoryCapacity:0
                                                  diskCapacity:FFFWebCacheSize
                                                      diskPath:name];
        }
    });
    return cache;
}

- (SDWebImageDownloaderRequestModifier *)requestModifier
{
    NSDictionary* headers = _headers;
    return [SDWebImageDownloaderRequestModifier requestModifierWithBlock: ^NSURLRequest* _Nullable (NSURLRequest* _Nonnull request) {
        NSMutableURLRequest* mutableRequest = [request mutableCopy];
        for (NSString* header in headers) {
            NSString* value = headers[header];
            [mutableRequest setValue: value forHTTPHeaderField: header];
        }
        return [mutableRequest copy];
    }];
}

@end
