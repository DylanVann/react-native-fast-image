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

// A preload's context: the source's headers and cache key.
static SDWebImageMutableContext *FFFPreloadContext(FFFastImageSource *source)
{
    SDWebImageMutableContext *context = [NSMutableDictionary dictionary];
    context[SDWebImageContextDownloadRequestModifier] = source.requestModifier;
    context[SDWebImageContextImageLoader] = source.imageLoader;
    context[SDWebImageContextCacheKeyFilter] = source.cacheKeyFilter;
    return context;
}

// A preload's options: the prefetcher's (low priority), with the source's own
// priority instead if it has one (as on Android), and its `cache` (#406). One
// source at a time, not SDWebImagePrefetcher, to get each source's result and
// to send its headers with its own request only. Failed urls are tried again,
// as views do (SDWebImage otherwise fails a url that failed before, e.g. with
// data that isn't an image, without a request until the app is relaunched,
// #394).
static SDWebImageOptions FFFPreloadOptions(FFFastImageSource *source)
{
    SDWebImageOptions options = [SDWebImagePrefetcher sharedImagePrefetcher].options | SDWebImageRetryFailed;
    if (source.hasPriority) {
        options &= ~(SDWebImageLowPriority | SDWebImageHighPriority);
        if (source.priority == FFFPriorityLow) {
            options |= SDWebImageLowPriority;
        } else if (source.priority == FFFPriorityHigh) {
            options |= SDWebImageHighPriority;
        }
    }
    return options | [source cacheOptions];
}

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
// { ok, width, height } or { ok: false, error }. Never rejects. A source with
// memoryCache false is only stored on disk, without decoding it (its size
// comes from the header).
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

        [sources enumerateObjectsUsingBlock:^(FFFastImageSource * _Nonnull source, NSUInteger idx, BOOL * _Nonnull stop) {
            if (!source.url) {
                // An empty, missing or null uri (JS sends null sources as {}).
                // It fails without taking a slot.
                [results addObject:@{@"ok": @NO, @"error": @"Invalid source: no uri"}];
                finishOne();
                return;
            }
            [results addObject:[NSNull null]];
            SDWebImageOptions options = FFFPreloadOptions(source);
            SDWebImageMutableContext *context = FFFPreloadContext(source);
            if (!source.memoryCache) {
                // Not decoded (only its header is read, for the size), and not
                // kept in memory, also when it comes from the disk cache.
                options |= SDWebImageAvoidDecodeImage;
                context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
            }
            [FFFPendingPreloads addObject:[^{
                // Once per slot: SDWebImage calls this once with finished set
                // (a progressive load calls it more, without).
                __block BOOL done = NO;
                [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                            options:options
                                                            context:[context copy]
                                                           progress:nil
                                                          completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
                    if (!finished || done) {
                        return;
                    }
                    done = YES;
                    if (error) {
                        [source forgetResponseAfterError:error];
                    }
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

// The source's downloaded file in the disk cache, downloading it first if it
// isn't there (without decoding it or keeping it in memory, and in the
// preloads' queue): { ok, path } or { ok: false, error }. Never rejects. With
// `cacheOnly` it doesn't download. A local file is its own path.
RCT_EXPORT_METHOD(getCachePath:(FFFastImageSource *)source
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    if (!source.url) {
        resolve(@{@"ok": @NO, @"error": @"Invalid source: no uri"});
        return;
    }
    if (source.url.isFileURL) {
        BOOL exists = [NSFileManager.defaultManager fileExistsAtPath:source.url.path];
        resolve(exists
            ? @{@"ok": @YES, @"path": source.url.path}
            : @{@"ok": @NO, @"error": @"No file at this uri"});
        return;
    }
    SDWebImageMutableContext *context = FFFPreloadContext(source);
    // The key SDWebImage stores it under (the cacheKey, or the converted url).
    NSString *key = [SDWebImageManager.sharedManager cacheKeyForURL:source.url context:context];
    SDImageCache *cache = SDImageCache.sharedImageCache;
    void (^resolveFromDisk)(NSString *) = ^(NSString *error) {
        [cache diskImageExistsWithKey:key completion:^(BOOL exists) {
            resolve(exists
                ? @{@"ok": @YES, @"path": [cache cachePathForKey:key]}
                : @{@"ok": @NO, @"error": error});
        }];
    };
    [cache diskImageExistsWithKey:key completion:^(BOOL exists) {
        // On the main queue, where the preloads' queue is used.
        if (exists) {
            resolve(@{@"ok": @YES, @"path": [cache cachePathForKey:key]});
            return;
        }
        if (source.cacheControl == FFFCacheControlCacheOnly) {
            resolve(@{@"ok": @NO, @"error": @"Not in the disk cache"});
            return;
        }
        if (!FFFPendingPreloads) {
            FFFPendingPreloads = [NSMutableArray array];
        }
        // As a disk-only preload: not decoded, and not looked up in or kept in
        // memory (an image in memory may not be on disk). It resolves once the
        // file is written.
        SDWebImageOptions options = FFFPreloadOptions(source) | SDWebImageAvoidDecodeImage | SDWebImageWaitStoreCache;
        context[SDWebImageContextQueryCacheType] = @(SDImageCacheTypeDisk);
        context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
        [FFFPendingPreloads addObject:[^{
            __block BOOL done = NO;
            [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                        options:options
                                                        context:[context copy]
                                                       progress:nil
                                                      completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
                if (!finished || done) {
                    return;
                }
                done = YES;
                FFFPreloadsInFlight--;
                FFFStartPendingPreloads();
                if (error) {
                    [source forgetResponseAfterError:error];
                }
                if (!image) {
                    resolve(@{@"ok": @NO, @"error": FFFErrorMessage(error)});
                    return;
                }
                resolveFromDisk(@"Not stored in the disk cache");
            }];
        } copy]];
        FFFStartPendingPreloads();
    }];
}

RCT_EXPORT_METHOD(clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    [SDImageCache.sharedImageCache clearMemory];
    resolve(NULL);
}

RCT_EXPORT_METHOD(clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    // And the HTTP cache of `cache: 'web'` images.
    [FFFastImageSource.webURLCache removeAllCachedResponses];
    [SDImageCache.sharedImageCache clearDiskOnCompletion:^(){
        resolve(NULL);
    }];
}

@end
