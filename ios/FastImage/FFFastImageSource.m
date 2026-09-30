#import "FFFastImageSource.h"
#import <SDWebImage/SDWebImageDownloader.h>
#import <SDWebImage/SDWebImageDownloaderResponseModifier.h>
#import <SDWebImage/SDWebImageDownloaderDecryptor.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImageDownloaderOperation.h>
#import <SDWebImage/NSData+ImageContentType.h>
#import <objc/message.h>

static NSUInteger const FFFWebCacheSize = 50 * 1024 * 1024;

// The photo's own size in pixels, looked up by its identifier (the url after
// ph://), or zero. Through the runtime, as the Photos framework is only there
// when the app links it (with SDWebImagePhotosPlugin). Kept once looked up.
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
// SDWebImagePhotosPlugin's loader when the app has it (the pod): FastImage
// finds it at runtime, so it doesn't depend on it or on the Photos framework.
// Its own instance, so the app's use of the plugin is left as it is. Without
// the plugin, or for a source it can't load (assets-library://), the load
// fails with `failure`.
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
// in progress when the next load started.
@interface FFFWebDownloaderOperation : SDWebImageDownloaderOperation
@end

@implementation FFFWebDownloaderOperation

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
 willCacheResponse:(NSCachedURLResponse *)proposedResponse
 completionHandler:(void (^)(NSCachedURLResponse *cachedResponse))completionHandler
{
    if ([NSData sd_imageFormatForImageData:proposedResponse.data] == SDImageFormatUndefined) {
        completionHandler(nil);
        return;
    }
    [super URLSession:session dataTask:dataTask willCacheResponse:proposedResponse completionHandler:completionHandler];
}

@end

@implementation FFFastImageSource

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
