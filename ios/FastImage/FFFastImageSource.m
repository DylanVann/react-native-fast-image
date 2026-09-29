#import "FFFastImageSource.h"
#import <SDWebImage/SDWebImageDownloader.h>
#import <SDWebImage/SDWebImageDownloaderResponseModifier.h>
#import <SDWebImage/SDWebImageDownloaderDecryptor.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImageDownloaderOperation.h>
#import <SDWebImage/NSData+ImageContentType.h>

static NSUInteger const FFFWebCacheSize = 50 * 1024 * 1024;

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

- (id<SDImageLoader>)imageLoader
{
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
