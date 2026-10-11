#import "FFFastImageViewManager.h"
#import "FFFastImageView.h"
#import "FFFDownsampledImage.h"

#import <stdatomic.h>

#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImagePrefetcher.h>

// configureCache's limits, by their names in JS. Each is set in the app's
// Info.plist (FastImageMaxDiskSize, ...) or changed at runtime, which is saved
// (FastImage.maxDiskSize, ...) and wins until it's reset with null.
static NSArray<NSString *> *FFFCacheLimitNames(void)
{
    return @[@"maxDiskSize", @"maxDiskAge", @"maxMemorySize"];
}

static NSString *FFFSavedCacheLimitKey(NSString *name)
{
    return [@"FastImage." stringByAppendingString:name];
}

// A limit's value: the one saved by configureCache, or the app's Info.plist's,
// or nil for SDWebImage's default.
static NSNumber *FFFCacheLimit(NSString *name)
{
    id saved = [NSUserDefaults.standardUserDefaults objectForKey:FFFSavedCacheLimitKey(name)];
    if ([saved isKindOfClass:NSNumber.class]) {
        return saved;
    }
    NSString *infoKey = [NSString stringWithFormat:@"FastImage%@%@",
                         [name substringToIndex:1].uppercaseString, [name substringFromIndex:1]];
    id info = [NSBundle.mainBundle objectForInfoDictionaryKey:infoKey];
    if ([info isKindOfClass:NSNumber.class]) {
        return info;
    }
    if ([info isKindOfClass:NSString.class]) {
        return @([info doubleValue]);
    }
    return nil;
}

// Sets a limit in SDWebImage's cache config: 0 for no limit, nil for
// SDWebImage's default. maxDiskAge counts from when an image was last used
// (SDWebImage's default from 5.21; before, from when it was stored).
static void FFFSetCacheLimit(SDImageCacheConfig *config, NSString *name, NSNumber *value)
{
    double limit = MAX(value.doubleValue, 0);
    if ([name isEqualToString:@"maxDiskSize"]) {
        config.maxDiskSize = limit;
    } else if ([name isEqualToString:@"maxMemorySize"]) {
        config.maxMemoryCost = limit;
    } else if (value) {
        // SDWebImage never expires images with a negative age (with 0 it
        // would remove them all).
        config.maxDiskAge = limit > 0 ? limit : -1;
        config.diskCacheExpireType = SDImageCacheConfigExpireTypeAccessDate;
    } else {
        config.maxDiskAge = 60 * 60 * 24 * 7;
    }
}

// The bytes of the files in a folder.
static unsigned long long FFFFolderSize(NSString *path)
{
    unsigned long long size = 0;
    NSDirectoryEnumerator<NSURL *> *files = [NSFileManager.defaultManager enumeratorAtURL:[NSURL fileURLWithPath:path isDirectory:YES]
                                                                includingPropertiesForKeys:@[NSURLFileSizeKey]
                                                                                   options:0
                                                                              errorHandler:nil];
    for (NSURL *file in files) {
        NSNumber *fileSize;
        [file getResourceValue:&fileSize forKey:NSURLFileSizeKey error:nil];
        size += fileSize.unsignedLongLongValue;
    }
    return size;
}

@class FFFQueuedLoad;

// Preloads waiting to start, in the order they were added, and those
// loading, across all preload calls. Like SDWebImagePrefetcher, at most
// maxConcurrentPrefetchCount load at a time, so a long list doesn't queue
// hundreds of operations ahead of the images the app is showing. Only used on
// the main queue (SDWebImageManager calls its completion blocks there).
static NSMutableArray<FFFQueuedLoad *> *FFFPendingPreloads;
static NSMutableArray<FFFQueuedLoad *> *FFFRunningPreloads;
// clearDiskCache calls so far, and those that haven't cleared yet, counted
// on the UIManager queue when they're called: React Native calls this
// module's methods there (RCTViewManager's methodQueue), one at a time in
// the order JS made them, so a preload or getCachePath that notes FFFClears
// there (clearsBefore) knows which clears were called before it. Nothing in
// FFFPendingPreloads starts while a clear is waiting: one called after it
// would otherwise load from or into the disk cache the clear then empties.
static atomic_ulong FFFClears;
static atomic_ulong FFFPendingClears;
// clearDiskCache calls that have resolved, counted on FFFCacheQueue after
// each resolves, so in the order they were called.
static atomic_ulong FFFClearsDone;
// Loads cancelled by a clear before a clear called before them had
// resolved, waiting to resolve after it (FFFResolveParked). Only used on the
// main queue.
static NSMutableArray<FFFQueuedLoad *> *FFFParked;
// How long a clear waits for the loads it cancelled to report back (see
// cancelForClear:). One cancelled before SDWebImage's check reports back at
// once. One past it is storing its image: a downloaded image's file is
// written once on SDImageCache's serial queue (see FFFPreloadContext), where
// it's queued before the clear's delete anyway, and an image that comes
// without its data (a still photo from the photo library, or for a preload
// an image in the app by name) is encoded first, which takes a moment for a
// large photo. A loader or cache of the app's own that doesn't report a
// cancelled load back would otherwise hold the clear, and every preload,
// getCachePath, writeToCache and configureCache after it, for good. After
// this the clear goes ahead, and the loads that still haven't reported back
// resolve with its error and free their slots.
static const NSTimeInterval FFFClearWait = 3;

// Where getCachePath looks in the disk cache, writeToCache stores files,
// configureCache measures the disk cache and clearDiskCache empties it: one
// at a time, in the order they were called.
// SDImageCache's own queue is private, and calls go through other queues
// before they get to it, so they can't be ordered with a clear there.
static dispatch_queue_t FFFCacheQueue(void)
{
    static dispatch_queue_t queue;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        dispatch_queue_attr_t attributes = dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0);
        queue = dispatch_queue_create("com.dylanvann.fastimage.cache", attributes);
    });
    return queue;
}

static NSDictionary *FFFFailure(NSString *error)
{
    return @{@"ok": @NO, @"error": error};
}

static NSDictionary *FFFFile(NSString *path)
{
    return @{@"ok": @YES, @"path": path};
}

static NSDictionary *FFFCancelled(void)
{
    return FFFFailure(@"Cancelled by clearDiskCache");
}

static void FFFStartPendingPreloads(void);

// A preload of a source, or a getCachePath download, waiting in
// FFFPendingPreloads, then loading. Only used on the main queue.
@interface FFFQueuedLoad : NSObject

// FFFClears when it was called.
@property (nonatomic, readonly) NSUInteger clearsBefore;
@property (nonatomic, copy, readonly) void (^resolve)(NSDictionary *result);

// loaded gets SDWebImage's result, and calls finish: with the load's.
- (instancetype)initWithSource:(FFFastImageSource *)source
                       options:(SDWebImageOptions)options
                       context:(SDWebImageContext *)context
                  clearsBefore:(NSUInteger)clearsBefore
                        loaded:(void (^)(FFFQueuedLoad *load, UIImage *image, NSError *error))loaded
                       resolve:(void (^)(NSDictionary *result))resolve;
- (BOOL)clearedSince;
// Loads it with SDWebImageManager, in a slot of FFFRunningPreloads.
- (void)start;
- (void)cancelForClear:(dispatch_group_t)clearing;
- (void)stopWaitingForClear:(dispatch_group_t)clearing;
- (void)finish:(NSDictionary *)result;

@end

@implementation FFFQueuedLoad {
    FFFastImageSource *_source;
    SDWebImageOptions _options;
    SDWebImageContext *_context;
    void (^_loaded)(FFFQueuedLoad *load, UIImage *image, NSError *error);
    // Its SDWebImage load until it finishes, which a clear cancels.
    SDWebImageCombinedOperation *_operation;
    // The clear that cancelled it while it was loading, which waits until
    // it has finished (for up to FFFClearWait).
    dispatch_group_t _clearing;
    BOOL _finished;
}

+ (void)initialize
{
    if (self == [FFFQueuedLoad class]) {
        FFFPendingPreloads = [NSMutableArray array];
        FFFRunningPreloads = [NSMutableArray array];
        FFFParked = [NSMutableArray array];
    }
}

- (instancetype)initWithSource:(FFFastImageSource *)source
                       options:(SDWebImageOptions)options
                       context:(SDWebImageContext *)context
                  clearsBefore:(NSUInteger)clearsBefore
                        loaded:(void (^)(FFFQueuedLoad *load, UIImage *image, NSError *error))loaded
                       resolve:(void (^)(NSDictionary *result))resolve
{
    if ((self = [super init])) {
        _source = source;
        _options = options;
        _context = context;
        _clearsBefore = clearsBefore;
        _loaded = loaded;
        _resolve = resolve;
    }
    return self;
}

- (BOOL)clearedSince
{
    return atomic_load(&FFFClears) != _clearsBefore;
}

- (void)start
{
    FFFastImageSource *source = _source;
    // Once: SDWebImage calls this once with finished set (a progressive load
    // calls it more, without), and again for a load cancelled while its
    // download is decoded.
    __block BOOL loaded = NO;
    SDWebImageCombinedOperation *operation = [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                                                       options:_options
                                                                                       context:_context
                                                                                      progress:nil
                                                                                     completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
        if (!finished || loaded) {
            return;
        }
        loaded = YES;
        if (error) {
            [source forgetResponseAfterError:error];
        }
        self->_loaded(self, image, error);
    }];
    // SDWebImage reports an image in the memory cache from inside the call,
    // so the load can be finished already.
    if (!_finished) {
        _operation = operation;
    }
}

// Cancels its SDWebImage load (a download that a view shares goes on for the
// view), and holds clearing until it has finished, for up to FFFClearWait.
// SDWebImage checks once whether a load was cancelled, when its download or
// disk cache lookup is done: a load cancelled before that reports back at
// once, without waiting for its download (SDWebImage calls back a cancelled
// load), and one past it is storing its image, and reports back once the
// file is written (SDWebImageWaitStoreCache, see FFFPreloadOptions), so
// before the clear deletes it.
- (void)cancelForClear:(dispatch_group_t)clearing
{
    // Unless an earlier clear already waits for it.
    if (_finished || _clearing) {
        return;
    }
    _clearing = clearing;
    dispatch_group_enter(clearing);
    [_operation cancel];
}

// After clearing stopped waiting for it (FFFClearWait): if it still hasn't
// reported back, it resolves with the clear's error now, and frees its slot.
// If it reports back later, that's ignored.
- (void)stopWaitingForClear:(dispatch_group_t)clearing
{
    if (!_finished && _clearing == clearing) {
        [self finish:FFFCancelled()];
    }
}

// Its result, which frees its slot. Only the first counts: the load's own,
// or that of a clear that cancelled it. If a clear was called since the load
// was, the result is the clear's, also when the load finished just before
// the clear cancelled it: the clear removes what it stored. A load called
// after a clear resolves after that clear, as the calls were made: one that
// a later clear cancels before the earlier one has resolved waits for it in
// FFFParked.
- (void)finish:(NSDictionary *)result
{
    if (_finished) {
        return;
    }
    _finished = YES;
    _operation = nil;
    [FFFRunningPreloads removeObjectIdenticalTo:self];
    if (![self clearedSince]) {
        _resolve(result);
    } else if (atomic_load(&FFFClearsDone) < _clearsBefore) {
        [FFFParked addObject:self];
    } else {
        _resolve(FFFCancelled());
    }
    // So the clear waiting for it resolves after it.
    if (_clearing) {
        dispatch_group_leave(_clearing);
    }
    FFFStartPendingPreloads();
}

@end

@implementation FFFastImageViewManager

RCT_EXPORT_MODULE(FastImageView)

// The app's cache limits (saved or in its Info.plist), before FastImage loads
// any image: this class is used first, to create the views and for preload.
+ (void)initialize
{
    if (self != [FFFastImageViewManager class]) {
        return;
    }
    SDImageCacheConfig *config = SDImageCache.sharedImageCache.config;
    for (NSString *name in FFFCacheLimitNames()) {
        NSNumber *value = FFFCacheLimit(name);
        if (value) {
            FFFSetCacheLimit(config, name, value);
        }
    }
}

- (FFFastImageView*)view {
  return [[FFFastImageView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(source, FFFastImageSource)
RCT_EXPORT_VIEW_PROPERTY(sources, FFFastImageSourceArray)
RCT_EXPORT_VIEW_PROPERTY(defaultSource, UIImage)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, FFFResizeMode)
RCT_EXPORT_VIEW_PROPERTY(recyclingKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(loopCount, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(imageRendering, NSString)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)
RCT_EXPORT_VIEW_PROPERTY(transitionDuration, double)
RCT_EXPORT_VIEW_PROPERTY(transitionBetweenImages, BOOL)
RCT_EXPORT_VIEW_PROPERTY(transitionSkipOnCacheHit, NSString)
RCT_EXPORT_VIEW_PROPERTY(downsample, BOOL)
RCT_EXPORT_VIEW_PROPERTY(blurRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(trackProgress, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadStart, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadEnd, RCTDirectEventBlock)
RCT_REMAP_VIEW_PROPERTY(tintColor, imageColor, UIColor)

// A preload's context: the source's headers and cache key, and the image
// class views use, so a view of the same url can share its download (see
// FFFDownsampledImage).
static SDWebImageMutableContext *FFFPreloadContext(FFFastImageSource *source)
{
    SDWebImageMutableContext *context = [NSMutableDictionary dictionary];
    context[SDWebImageContextDownloadRequestModifier] = source.requestModifier;
    context[SDWebImageContextImageLoader] = source.imageLoader;
    context[SDWebImageContextCacheKeyFilter] = source.cacheKeyFilter;
    [FFFDownsampledImage addFullSizeToContext:context];
    // Stored once. Without a transformer, SDWebImage's original image is the
    // same file under the same key, which it would store again (and encode
    // again, for an image without its data) once the first store is done
    // (SDWebImageWaitStoreCache): after the delete of a clear that stopped
    // waiting for the load (FFFClearWait).
    context[SDWebImageContextOriginalStoreCacheType] = @(SDImageCacheTypeNone);
    return context;
}

// A preload's options: the prefetcher's (low priority), with the source's own
// priority instead if it has one (as on Android), and its `cache` (#406). One
// source at a time, not SDWebImagePrefetcher, to get each source's result and
// to send its headers with its own request only. Failed urls are tried again,
// as views do (SDWebImage otherwise fails a url that failed before, e.g. with
// data that isn't an image, without a request until the app is relaunched,
// #394). It completes once its image is stored, its file written to the
// disk cache too (SDWebImageWaitStoreCache), so a preload doesn't resolve
// while that's still going on, and a clear that cancels it can wait for it
// (see cancelForClear:). An image that comes without its data (a still
// photo from the photo library, an image in the app by name) is encoded
// before it's written, which for a large photo is most of its preload's
// time.
static SDWebImageOptions FFFPreloadOptions(FFFastImageSource *source)
{
    SDWebImageOptions options = [SDWebImagePrefetcher sharedImagePrefetcher].options | SDWebImageRetryFailed | SDWebImageWaitStoreCache;
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

// The key a source's image is in SDWebImage's cache under: its cacheKey
// (without needing a uri), or its url as a view converts it. `web` images
// ignore cacheKey. nil without either.
static NSString *FFFDiskCacheKey(FFFastImageSource *source)
{
    if (source.cacheKey.length > 0 && source.cacheControl != FFFCacheControlWeb) {
        return source.cacheKey;
    }
    if (!source.url) {
        return nil;
    }
    return [SDWebImageManager.sharedManager cacheKeyForURL:source.url context:FFFPreloadContext(source)];
}

static NSUInteger FFFPreloadLimit(void)
{
    NSUInteger limit = [SDWebImagePrefetcher sharedImagePrefetcher].maxConcurrentPrefetchCount;
    return MAX(limit, (NSUInteger)1);
}

// Starts pending preloads while there's room and no clear is waiting. A
// completion block calls it again, sometimes from inside start (a memory
// cache hit completes synchronously on the main queue). That's fine: a load
// is in FFFRunningPreloads before it starts, so the inner call starts what
// fits, and the outer loop sees what it started when it checks again.
static void FFFStartPendingPreloads(void)
{
    while (atomic_load(&FFFPendingClears) == 0 && FFFRunningPreloads.count < FFFPreloadLimit() && FFFPendingPreloads.count > 0) {
        FFFQueuedLoad *load = FFFPendingPreloads.firstObject;
        [FFFPendingPreloads removeObjectAtIndex:0];
        [FFFRunningPreloads addObject:load];
        [load start];
    }
}

// Adds a load to FFFPendingPreloads, or cancels it if a clear was called
// since: getCachePath queues its download after its lookup, which can be
// after the clear has cancelled the loads called before it. Then call
// FFFStartPendingPreloads.
static void FFFQueue(FFFQueuedLoad *load)
{
    if ([load clearedSince]) {
        [load finish:FFFCancelled()];
    } else {
        [FFFPendingPreloads addObject:load];
    }
}

// Cancels the preloads and getCachePath downloads called before the latest
// clear, waiting or loading (local images too: SDWebImage stores them in its
// disk cache as well), which resolve with the clear's error. clearing waits
// for those loading to finish, for up to FFFClearWait (see cancelForClear:).
static void FFFCancelLoads(dispatch_group_t clearing)
{
    for (FFFQueuedLoad *load in [FFFPendingPreloads copy]) {
        if ([load clearedSince]) {
            [FFFPendingPreloads removeObjectIdenticalTo:load];
            [load finish:FFFCancelled()];
        }
    }
    for (FFFQueuedLoad *load in [FFFRunningPreloads copy]) {
        if ([load clearedSince]) {
            [load cancelForClear:clearing];
        }
    }
}

// After clearing stopped waiting at FFFClearWait: the loads it cancelled that
// haven't reported back resolve with its error, and free their slots.
static void FFFStopWaitingForLoads(dispatch_group_t clearing)
{
    for (FFFQueuedLoad *load in [FFFRunningPreloads copy]) {
        [load stopWaitingForClear:clearing];
    }
}

// Resolves the parked loads whose clears before them have resolved. On the
// main queue, after a clear has resolved.
static void FFFResolveParked(void)
{
    NSUInteger done = atomic_load(&FFFClearsDone);
    for (FFFQueuedLoad *load in [FFFParked copy]) {
        if (load.clearsBefore <= done) {
            [FFFParked removeObjectIdenticalTo:load];
            load.resolve(FFFCancelled());
        }
    }
}

// The path of the file cached under key, or nil if it isn't on disk. Waits
// for SDImageCache's queue: on FFFCacheQueue.
static NSString *FFFCachedFile(NSString *key)
{
    SDImageCache *cache = SDImageCache.sharedImageCache;
    return [cache diskImageDataExistsWithKey:key] ? [cache cachePathForKey:key] : nil;
}

// Resolves with a result per source, in order, once each has loaded and been
// stored (see FFFPreloadOptions) or failed: { ok, width, height } or
// { ok: false, error }. Never rejects. A source with memoryCache false is only
// stored on disk, without decoding it (its size comes from the header).
RCT_EXPORT_METHOD(preload:(nonnull NSArray<FFFastImageSource *> *)sources
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    // This runs on the UIManager queue, where calls arrive in the order JS
    // made them (see FFFClears); the queue state is only touched on the main
    // queue.
    NSUInteger clearsBefore = atomic_load(&FFFClears);
    dispatch_async(dispatch_get_main_queue(), ^{
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
                [results addObject:FFFFailure(@"Invalid source: no uri")];
                finishOne();
                return;
            }
            [results addObject:[NSNull null]];
            SDWebImageOptions options = FFFPreloadOptions(source);
            SDWebImageMutableContext *context = FFFPreloadContext(source);
            // It looks in the memory cache first, for the full-size image.
            [FFFDownsampledImage forgetSmallerFullSizeImageForURL:source.url context:context];
            if (!source.memoryCache) {
                // Not decoded (only its header is read, for the size), and not
                // kept in memory, also when it comes from the disk cache.
                options |= SDWebImageAvoidDecodeImage;
                context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
            }
            FFFQueue([[FFFQueuedLoad alloc] initWithSource:source options:options context:[context copy] clearsBefore:clearsBefore loaded:^(FFFQueuedLoad *load, UIImage *image, NSError *error) {
                [load finish:image
                    ? @{@"ok": @YES, @"width": @(image.size.width), @"height": @(image.size.height)}
                    : FFFFailure([source errorMessage:error])];
            } resolve:^(NSDictionary *result) {
                results[idx] = result;
                finishOne();
            }]);
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
// `cacheOnly`, or a cacheKey without a uri, it doesn't download. A local
// file is its own path.
RCT_EXPORT_METHOD(getCachePath:(FFFastImageSource *)source
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    if (!source.url) {
        NSString *key = FFFDiskCacheKey(source);
        if (!key) {
            resolve(FFFFailure(@"Invalid source: no uri or cacheKey"));
            return;
        }
        dispatch_async(FFFCacheQueue(), ^{
            NSString *path = FFFCachedFile(key);
            resolve(path ? FFFFile(path) : FFFFailure(@"Not in the disk cache"));
        });
        return;
    }
    if (source.url.isFileURL) {
        BOOL exists = [NSFileManager.defaultManager fileExistsAtPath:source.url.path];
        resolve(exists ? FFFFile(source.url.path) : FFFFailure(@"No file at this uri"));
        return;
    }
    NSString *key = FFFDiskCacheKey(source);
    // Noted where calls arrive in the order JS made them (see FFFClears).
    NSUInteger clearsBefore = atomic_load(&FFFClears);
    dispatch_async(FFFCacheQueue(), ^{
        NSString *path = FFFCachedFile(key);
        if (path) {
            resolve(FFFFile(path));
            return;
        }
        if (source.cacheControl == FFFCacheControlCacheOnly) {
            resolve(FFFFailure(@"Not in the disk cache"));
            return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            // As a disk-only preload: not decoded, and not looked up in or
            // kept in memory (an image in memory may not be on disk). Like a
            // preload, it completes once the file is written, so it can look
            // for the file.
            SDWebImageOptions options = FFFPreloadOptions(source) | SDWebImageAvoidDecodeImage;
            SDWebImageMutableContext *context = FFFPreloadContext(source);
            context[SDWebImageContextQueryCacheType] = @(SDImageCacheTypeDisk);
            context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
            FFFQueue([[FFFQueuedLoad alloc] initWithSource:source options:options context:[context copy] clearsBefore:clearsBefore loaded:^(FFFQueuedLoad *load, UIImage *image, NSError *error) {
                if (!image) {
                    [load finish:FFFFailure([source errorMessage:error])];
                    return;
                }
                // The file is written by now. Looked for on SDImageCache's
                // queue, not on FFFCacheQueue, where a clear can be waiting
                // for this load to finish.
                SDImageCache *cache = SDImageCache.sharedImageCache;
                [cache diskImageExistsWithKey:key completion:^(BOOL exists) {
                    [load finish:exists ? FFFFile([cache cachePathForKey:key]) : FFFFailure(@"Not stored in the disk cache")];
                }];
            } resolve:resolve]);
            FFFStartPendingPreloads();
        });
    });
}

// Stores a local image file as the source's image in the disk cache, so views
// and preloads of the source load it without downloading it, and resolves
// with its cached file: { ok, path } or { ok: false, error }. Never rejects.
// It doesn't replace an image that's already cached (Glide can't on Android;
// a new image should get a new cacheKey), and doesn't store `web` sources
// (Android keeps them only in an HTTP cache).
RCT_EXPORT_METHOD(writeToCache:(FFFastImageSource *)source
                  file:(NSString *)file
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    if (source.cacheControl == FFFCacheControlWeb) {
        resolve(FFFFailure(@"Can't store cache: 'web' images (they're kept in an HTTP cache)"));
        return;
    }
    // A cacheKey is enough (the image doesn't need a url yet); otherwise a
    // remote url.
    NSString *scheme = source.url.scheme.lowercaseString;
    if (source.cacheKey.length == 0 && ![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
        resolve(FFFFailure(@"Invalid source: no remote uri or cacheKey"));
        return;
    }
    // A file:// url or a path.
    NSURL *fileURL = [RCTConvert NSURL:file];
    if (!fileURL.isFileURL) {
        resolve(FFFFailure(@"Not a local file"));
        return;
    }
    NSString *key = FFFDiskCacheKey(source);
    dispatch_async(FFFCacheQueue(), ^{
        SDImageCache *cache = SDImageCache.sharedImageCache;
        if ([cache diskImageDataExistsWithKey:key]) {
            resolve(FFFFailure(@"Already in the disk cache"));
            return;
        }
        NSData *data = [NSData dataWithContentsOfURL:fileURL];
        if (!data) {
            resolve(FFFFailure(@"Can't read the file"));
            return;
        }
        if (![FFFastImageSource isImageData:data]) {
            resolve(FFFFailure(@"Not an image"));
            return;
        }
        [cache storeImageDataToDisk:data forKey:key];
        // An image a view showed under this key before, which isn't on disk
        // anymore.
        [cache removeImageFromMemoryForKey:key];
        resolve(FFFFile([cache cachePathForKey:key]));
    });
}

// Changes cache limits at runtime and saves them, so they're used on the next
// launches too: a number (0 for no limit), or null to go back to the app's
// Info.plist or SDWebImage's default. A lower disk limit applies at once (what's
// over it is removed; the disk cache is trimmed to half of maxDiskSize when
// it's over), instead of when the app next goes to the background. Resolves
// with the limits in effect (0 for no limit), and diskSize: the bytes the disk
// cache uses now.
RCT_EXPORT_METHOD(configureCache:(NSDictionary *)limits
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(__unused RCTPromiseRejectBlock)reject)
{
    SDImageCache *cache = SDImageCache.sharedImageCache;
    SDImageCacheConfig *config = cache.config;
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSUInteger maxDiskSize = config.maxDiskSize;
    NSTimeInterval maxDiskAge = config.maxDiskAge;
    for (NSString *name in FFFCacheLimitNames()) {
        id value = limits[name];
        if (value == (id)kCFNull) {
            [defaults removeObjectForKey:FFFSavedCacheLimitKey(name)];
        } else if ([value isKindOfClass:NSNumber.class]) {
            [defaults setObject:value forKey:FFFSavedCacheLimitKey(name)];
        } else {
            // Not given: unchanged.
            continue;
        }
        FFFSetCacheLimit(config, name, FFFCacheLimit(name));
    }
    BOOL trim = config.maxDiskSize != maxDiskSize || config.maxDiskAge != maxDiskAge;
    // In order with clearDiskCache, and not on the disk cache's queue, which
    // image loads use.
    dispatch_async(FFFCacheQueue(), ^{
        if (trim) {
            // SDImageCache trims on its own queue, and always calls back on
            // the main queue (see clearDiskCache).
            dispatch_semaphore_t trimmed = dispatch_semaphore_create(0);
            [cache deleteOldFilesWithCompletionBlock:^{
                dispatch_semaphore_signal(trimmed);
            }];
            dispatch_semaphore_wait(trimmed, DISPATCH_TIME_FOREVER);
        }
        resolve(@{
            @"maxDiskSize": @(config.maxDiskSize),
            @"maxDiskAge": @(MAX(config.maxDiskAge, 0)),
            @"maxMemorySize": @(config.maxMemoryCost),
            @"diskSize": @(FFFFolderSize(cache.diskCachePath)),
        });
    });
}

RCT_EXPORT_METHOD(clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    [SDImageCache.sharedImageCache clearMemory];
    resolve(@{@"ok": @YES});
}

// On FFFCacheQueue, after the getCachePath lookups and writeToCache calls
// called before it, so a file writeToCache is storing isn't stored after the
// clear. First the preloads and getCachePath downloads called before it that
// are waiting or loading are cancelled (FFFCancelLoads), without waiting for
// their downloads, and it waits, for up to FFFClearWait, until those loading
// have finished, so they don't store their images after it. The loads called
// after it don't start until it's done (FFFPendingClears), and resolve after
// it also when a later clear cancels them (FFFParked).
RCT_EXPORT_METHOD(clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
    atomic_fetch_add(&FFFClears, 1);
    atomic_fetch_add(&FFFPendingClears, 1);
    dispatch_group_t cancelled = dispatch_group_create();
    dispatch_group_enter(cancelled);
    dispatch_async(dispatch_get_main_queue(), ^{
        FFFCancelLoads(cancelled);
        dispatch_group_leave(cancelled);
    });
    dispatch_async(FFFCacheQueue(), ^{
        BOOL waited = dispatch_group_wait(cancelled, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(FFFClearWait * NSEC_PER_SEC))) == 0;
        // And the HTTP cache of `cache: 'web'` images.
        [FFFastImageSource.webURLCache removeAllCachedResponses];
        // SDImageCache deletes on its own queue, and calls back on the main
        // queue. It always calls back, so this wait has no limit (nor has
        // configureCache's trim): it would only hang if the main thread did,
        // or if a disk cache class of the app's own never returned from its
        // delete, which would hold every disk cache call, views' too.
        dispatch_semaphore_t cleared = dispatch_semaphore_create(0);
        [SDImageCache.sharedImageCache clearDiskOnCompletion:^{
            dispatch_semaphore_signal(cleared);
        }];
        dispatch_semaphore_wait(cleared, DISPATCH_TIME_FOREVER);
        // Resolved here, before the calls queued after it on FFFCacheQueue
        // run and the preloads held for it start, so it resolves before them,
        // as the calls were made.
        resolve(@{@"ok": @YES});
        atomic_fetch_add(&FFFClearsDone, 1);
        atomic_fetch_sub(&FFFPendingClears, 1);
        dispatch_async(dispatch_get_main_queue(), ^{
            FFFResolveParked();
            if (!waited) {
                FFFStopWaitingForLoads(cancelled);
            }
            FFFStartPendingPreloads();
        });
    });
}

@end
