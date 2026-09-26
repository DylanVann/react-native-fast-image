#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <SDWebImage/SDWebImageDownloaderRequestModifier.h>
#import <SDWebImage/SDWebImageCacheKeyFilter.h>

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

- (instancetype)initWithURL:(NSURL *)url
                   priority:(FFFPriority)priority
                    headers:(NSDictionary *)headers
               cacheControl:(FFFCacheControl)cacheControl;

// Adds this source's headers to its image requests.
- (SDWebImageDownloaderRequestModifier *)requestModifier;

// Caches the image under cacheKey, or nil without one.
- (SDWebImageCacheKeyFilter *)cacheKeyFilter;

@end
