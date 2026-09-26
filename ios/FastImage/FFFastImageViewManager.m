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
RCT_EXPORT_VIEW_PROPERTY(recyclingKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(loopCount, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(imageRendering, NSString)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)
RCT_EXPORT_VIEW_PROPERTY(downsample, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadStart, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadEnd, RCTDirectEventBlock)
RCT_REMAP_VIEW_PROPERTY(tintColor, imageColor, UIColor)

// Preloads waiting to start, in the order they were added, and the number
// loading, across all preload calls. Like SDWebImagePrefetcher, at most
// maxConcurrentPrefetchCount load at a time, so a long list doesn't queue
// hundreds of operations ahead of the images the app is showing. Only used on
// the main queue (SDWebImageManager calls its completion blocks there).
static NSMutableArray<dispatch_block_t> *FFFPendingPreloads;
static NSUInteger FFFPreloadsInFlight;

static NSUInteger FFFPreloadLimit(void)
{
    NSUInteger limit = [SDWebImagePrefetcher sharedImagePrefetcher].maxConcurrentPrefetchCount;
    return MAX(limit, (NSUInteger)1);
}

// Starts pending preloads while there's room. A completion block calls it
// again, sometimes from inside start() (a memory cache hit completes
// synchronously on the main queue). That's fine: the counters are shared and
// updated before each start(), so the inner call starts what fits, and the
// outer loop sees the updated counters when it checks again.
static void FFFStartPendingPreloads(void)
{
    while (FFFPreloadsInFlight < FFFPreloadLimit() && FFFPendingPreloads.count > 0) {
        dispatch_block_t start = FFFPendingPreloads.firstObject;
        [FFFPendingPreloads removeObjectAtIndex:0];
        FFFPreloadsInFlight++;
        start();
    }
}

// Resolves with a result per source, in order, once all have loaded or failed:
// { ok, width, height } or { ok: false, error }. Never rejects.
RCT_EXPORT_METHOD(preload:(nonnull NSArray<FFFastImageSource *> *)sources
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    // This runs on the UIManager queue; the queue state is only touched on
    // the main queue.
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!FFFPendingPreloads) {
            FFFPendingPreloads = [NSMutableArray array];
        }
        NSMutableArray *results = [NSMutableArray arrayWithCapacity:sources.count];
        // Sources of this call still to finish. It starts at the number of
        // sources, so the promise can't resolve before they've all been added.
        __block NSUInteger remaining = sources.count;
        void (^finishOne)(void) = ^{
            if (--remaining == 0) {
                resolve(results);
            }
        };
        // With the prefetcher's options (low priority), but one source at a
        // time (not SDWebImagePrefetcher), to get each source's result and to
        // send its headers with its own request only.
        SDWebImageOptions prefetcherOptions = [SDWebImagePrefetcher sharedImagePrefetcher].options;

        [sources enumerateObjectsUsingBlock:^(FFFastImageSource * _Nonnull source, NSUInteger idx, BOOL * _Nonnull stop) {
            if (!source.url) {
                // An empty, missing or null uri (JS sends null sources as {}).
                // It fails without taking a slot.
                [results addObject:@{@"ok": @NO, @"error": @"Invalid source: no uri"}];
                finishOne();
                return;
            }
            [results addObject:[NSNull null]];
            // A source's own priority replaces the prefetcher's, as on Android.
            SDWebImageOptions options = prefetcherOptions;
            if (source.hasPriority) {
                options &= ~(SDWebImageLowPriority | SDWebImageHighPriority);
                if (source.priority == FFFPriorityLow) {
                    options |= SDWebImageLowPriority;
                } else if (source.priority == FFFPriorityHigh) {
                    options |= SDWebImageHighPriority;
                }
            }
            [FFFPendingPreloads addObject:[^{
                // Once per slot: SDWebImage calls this once with finished set
                // (a progressive load calls it more, without).
                __block BOOL done = NO;
                [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                            options:options
                                                            context:@{SDWebImageContextDownloadRequestModifier: source.requestModifier}
                                                           progress:nil
                                                          completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
                    if (!finished || done) {
                        return;
                    }
                    done = YES;
                    results[idx] = image
                        ? @{@"ok": @YES, @"width": @(image.size.width), @"height": @(image.size.height)}
                        : @{@"ok": @NO, @"error": FFFErrorMessage(error)};
                    FFFPreloadsInFlight--;
                    finishOne();
                    FFFStartPendingPreloads();
                }];
            } copy]];
        }];

        if (sources.count == 0) {
            resolve(results);
            return;
        }
        FFFStartPendingPreloads();
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
