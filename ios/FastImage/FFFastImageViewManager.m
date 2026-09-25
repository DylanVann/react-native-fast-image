#import "FFFastImageViewManager.h"
#import "FFFastImageView.h"

#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImagePrefetcher.h>

@implementation FFFastImageViewManager

RCT_EXPORT_MODULE(FastImageView)

- (FFFastImageView*)view {
  return [[FFFastImageView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(source, FFFastImageSource)
RCT_EXPORT_VIEW_PROPERTY(defaultSource, UIImage)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, RCTResizeMode)
RCT_EXPORT_VIEW_PROPERTY(loopCount, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadStart, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadEnd, RCTDirectEventBlock)
RCT_REMAP_VIEW_PROPERTY(tintColor, imageColor, UIColor)

// The error's description, with the HTTP status code when there is one.
static NSString *FFFErrorMessage(NSError *error)
{
    NSNumber *statusCode = error.userInfo[SDWebImageErrorDownloadStatusCodeKey];
    if (statusCode) {
        return [NSString stringWithFormat:@"%@, status code: %@", error.localizedDescription, statusCode];
    }
    return error.localizedDescription ?: @"Failed to load the image";
}

// Resolves with a result per source, in order, once all have loaded or failed:
// { ok, width, height } or { ok: false, error }. Never rejects.
RCT_EXPORT_METHOD(preload:(nonnull NSArray<FFFastImageSource *> *)sources
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    NSMutableArray *results = [NSMutableArray arrayWithCapacity:sources.count];
    dispatch_group_t group = dispatch_group_create();
    // With the prefetcher's options (low priority), but one source at a time
    // (not SDWebImagePrefetcher), to get each source's result and to send its
    // headers with its own request only.
    SDWebImageOptions options = [SDWebImagePrefetcher sharedImagePrefetcher].options;

    [sources enumerateObjectsUsingBlock:^(FFFastImageSource * _Nonnull source, NSUInteger idx, BOOL * _Nonnull stop) {
        if (!source.url) {
            // An empty, missing or null uri (JS sends null sources as {}).
            [results addObject:@{@"ok": @NO, @"error": @"Invalid source: no uri"}];
            return;
        }
        [results addObject:[NSNull null]];
        dispatch_group_enter(group);
        [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                    options:options
                                                    context:@{SDWebImageContextDownloadRequestModifier: source.requestModifier}
                                                   progress:nil
                                                  completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
            if (!finished) {
                return;
            }
            NSDictionary *result = image
                ? @{@"ok": @YES, @"width": @(image.size.width), @"height": @(image.size.height)}
                : @{@"ok": @NO, @"error": FFFErrorMessage(error)};
            @synchronized (results) {
                results[idx] = result;
            }
            dispatch_group_leave(group);
        }];
    }];

    dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        resolve(results);
    });
}

RCT_EXPORT_METHOD(clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    [SDImageCache.sharedImageCache clearMemory];
    resolve(NULL);
}

RCT_EXPORT_METHOD(clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    [SDImageCache.sharedImageCache clearDiskOnCompletion:^(){
        resolve(NULL);
    }];
}

@end
