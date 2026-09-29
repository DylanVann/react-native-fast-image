#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <SDWebImage/SDWebImageDownloaderRequestModifier.h>
#import <SDWebImage/SDWebImageCacheKeyFilter.h>
#import <SDWebImage/SDWebImageDefine.h>
#import <SDWebImage/SDImageLoader.h>

typedef NS_ENUM(NSInteger, FFFPriority) {
    FFFPriorityLow,
    FFFPriorityNormal,
    FFFPriorityHigh
};

typedef NS_ENUM(NSInteger, FFFCacheControl) {
    FFFCacheControlImmutable,
    FFFCacheControlWeb,
    FFFCacheControlCacheOnly
};

// Object containing an image uri and metadata.
@interface FFFastImageSource : NSObject

// uri for image, or base64
@property (nonatomic) NSURL* url;
// priority for image request
@property (nonatomic) FFFPriority priority;
// whether the source set a priority (preload is low priority otherwise)
@property (nonatomic) BOOL hasPriority;
// headers for the image request
@property (nonatomic) NSDictionary *headers;
// cache control mode
@property (nonatomic) FFFCacheControl cacheControl;
// The key to cache the image under instead of its url, or nil.
@property (nonatomic, copy) NSString *cacheKey;
// Whether the decoded image is kept in the memory cache (`memoryCache`,
// default YES). Without it, it's only kept on disk: views don't leave it in
// memory, and preload doesn't decode it.
@property (nonatomic) BOOL memoryCache;

- (instancetype)initWithURL:(NSURL *)url
                   priority:(FFFPriority)priority
                    headers:(NSDictionary *)headers
               cacheControl:(FFFCacheControl)cacheControl;

// Adds this source's headers to its image requests.
- (SDWebImageDownloaderRequestModifier *)requestModifier;

// Caches the image under cacheKey, or nil without one.
- (SDWebImageCacheKeyFilter *)cacheKeyFilter;

// The load options for `cache`: web follows the HTTP cache, cacheOnly never
// downloads. For views and preload alike.
- (SDWebImageOptions)cacheOptions;

// The loader for `cache: 'web'` images, whose HTTP cache is their own (see
// webURLCache), or nil for SDWebImage's shared one.
- (id<SDImageLoader>)imageLoader;

// The HTTP cache of `cache: 'web'` images: their own rather than the app's
// shared NSURLCache, so clearDiskCache can empty it without the app's other
// responses. 50 MB, as on Android.
+ (NSURLCache *)webURLCache;

// After a load of this source failed: for a `cache: 'web'` image whose data
// isn't an image (e.g. a captive portal's HTML page), removes the response
// from the HTTP cache, which stored it as it downloaded. Otherwise the next
// loads would get it from there until it expires, and fail again.
- (void)forgetResponseAfterError:(NSError *)error;

@end
