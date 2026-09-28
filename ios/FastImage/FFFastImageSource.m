#import "FFFastImageSource.h"
#import <SDWebImage/SDWebImageDownloader.h>
#import <SDWebImage/SDWebImageDownloaderResponseModifier.h>
#import <SDWebImage/SDWebImageDownloaderDecryptor.h>

static NSUInteger const FFFWebCacheSize = 50 * 1024 * 1024;

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
