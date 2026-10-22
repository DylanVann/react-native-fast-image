#import "RCTConvert+FFFastImage.h"
#import "FFFastImageSource.h"

@implementation RCTConvert (FFFastImage)

RCT_ENUM_CONVERTER(FFFObjectFit, (@{
                                    @"cover": @(FFFObjectFitCover),
                                    @"contain": @(FFFObjectFitContain),
                                    @"fill": @(FFFObjectFitFill),
                                    @"scale-down": @(FFFObjectFitScaleDown),
                                    @"none": @(FFFObjectFitNone),
                                    }), FFFObjectFitCover, integerValue);

RCT_ENUM_CONVERTER(FFFPriority, (@{
                                   @"low": @(FFFPriorityLow),
                                   @"normal": @(FFFPriorityNormal),
                                   @"high": @(FFFPriorityHigh),
                                   }), FFFPriorityNormal, integerValue);

RCT_ENUM_CONVERTER(FFFCacheControl, (@{
                                       @"immutable": @(FFFCacheControlImmutable),
                                       @"web": @(FFFCacheControlWeb),
                                       @"cacheOnly": @(FFFCacheControlCacheOnly),
                                       // React Native's ImageURISource value, which views
                                       // take. Its others (e.g. 'reload') are the default.
                                       @"only-if-cached": @(FFFCacheControlCacheOnly),
                                       }), FFFCacheControlImmutable, integerValue);

+ (FFFastImageSource *)FFFastImageSource:(id)json {
    // A null source (e.g. a null entry passed to preload).
    if (!json || json == (id)kCFNull) {
        return nil;
    }
    
    NSString *uriString = json[@"uri"];
    NSURL *uri = [self NSURL:uriString];
    
    FFFPriority priority = [self FFFPriority:json[@"priority"]];
    FFFCacheControl cacheControl = [self FFFCacheControl:json[@"cache"]];
    
    // Only the values that are strings: JS sends numbers and booleans as
    // strings (as fetch's Headers converts them, see src/headers.ts), and
    // `headers` that isn't an object, and other values (null, objects), are
    // left out, as on Android.
    NSMutableDictionary<NSString *, NSString *> *headers = nil;
    id headersJSON = json[@"headers"];
    if ([headersJSON isKindOfClass:[NSDictionary class]]) {
        headers = [NSMutableDictionary new];
        [headersJSON enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
            if ([key isKindOfClass:[NSString class]] && [value isKindOfClass:[NSString class]]) {
                headers[key] = value;
            }
        }];
    }
    
    FFFastImageSource *imageSource = [[FFFastImageSource alloc] initWithURL:uri priority:priority headers:headers cacheControl:cacheControl];
    id priorityJSON = json[@"priority"];
    imageSource.hasPriority = priorityJSON && priorityJSON != (id)kCFNull;
    NSString *cacheKey = [self NSString:json[@"cacheKey"]];
    imageSource.cacheKey = cacheKey.length > 0 ? cacheKey : nil;
    id memoryCache = json[@"memoryCache"];
    imageSource.memoryCache = memoryCache && memoryCache != (id)kCFNull ? [self BOOL:memoryCache] : YES;
    id diskCache = json[@"diskCache"];
    imageSource.diskCache = diskCache && diskCache != (id)kCFNull ? [self BOOL:diskCache] : YES;
    CGFloat scale = json[@"scale"] && json[@"scale"] != (id)kCFNull ? [self CGFloat:json[@"scale"]] : 1;
    imageSource.pixelCount = [self CGFloat:json[@"width"]] * [self CGFloat:json[@"height"]] * scale * scale;
    
    return imageSource;
}

RCT_ARRAY_CONVERTER(FFFastImageSource);

@end
