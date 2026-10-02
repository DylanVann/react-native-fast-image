#import "FFFastImageModule.h"
#import "RCTConvert+FFFastImage.h"
#import "FFFastImageView.h"
#import "FFFDownsampledImage.h"

#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDWebImagePrefetcher.h>
#import <SDWebImage/NSData+ImageContentType.h>

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

void FFFApplyCacheLimits(void)
{
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        SDImageCacheConfig *config = SDImageCache.sharedImageCache.config;
        for (NSString *name in FFFCacheLimitNames()) {
            NSNumber *value = FFFCacheLimit(name);
            if (value) {
                FFFSetCacheLimit(config, name, value);
            }
        }
    });
}

@implementation FFFastImageModule

RCT_EXPORT_MODULE(FastImageModule)

// The app's cache limits, before a preload (views apply them too).
+ (void)initialize
{
    if (self == [FFFastImageModule class]) {
        FFFApplyCacheLimits();
    }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeFastImageModuleSpecJSI>(params);
}


// Preloads waiting to start, in the order they were added, and the number
// loading, across all preload calls. Like SDWebImagePrefetcher, at most
// maxConcurrentPrefetchCount load at a time, so a long list doesn't queue
// hundreds of operations ahead of the images the app is showing. Only used on
// the main queue (SDWebImageManager calls its completion blocks there).
static NSMutableArray<dispatch_block_t> *FFFPendingPreloads;
static NSUInteger FFFPreloadsInFlight;

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

// Loads the source in the preloads' queue, then calls completed once with its
// image or error. Only on the main queue (SDWebImageManager calls its
// completion blocks there); call FFFStartPendingPreloads after adding loads.
static void FFFQueueLoad(FFFastImageSource *source,
                         SDWebImageOptions options,
                         SDWebImageContext *context,
                         void (^completed)(UIImage *image, NSError *error))
{
    if (!FFFPendingPreloads) {
        FFFPendingPreloads = [NSMutableArray array];
    }
    [FFFPendingPreloads addObject:[^{
        // Once per slot: SDWebImage calls this once with finished set (a
        // progressive load calls it more, without).
        __block BOOL done = NO;
        [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                    options:options
                                                    context:context
                                                   progress:nil
                                                  completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {
            if (!finished || done) {
                return;
            }
            done = YES;
            if (error) {
                [source forgetResponseAfterError:error];
            }
            FFFPreloadsInFlight--;
            completed(image, error);
            FFFStartPendingPreloads();
        }];
    } copy]];
}

// Calls found with the path of the file cached under key, or missing if it
// isn't on disk. On the main queue.
static void FFFFindCachedFile(NSString *key, void (^found)(NSString *path), dispatch_block_t missing)
{
    SDImageCache *cache = SDImageCache.sharedImageCache;
    [cache diskImageExistsWithKey:key completion:^(BOOL exists) {
        if (exists) {
            found([cache cachePathForKey:key]);
        } else {
            missing();
        }
    }];
}

static NSDictionary *FFFFailure(NSString *error)
{
    return @{@"ok": @NO, @"error": error};
}

static NSDictionary *FFFFile(NSString *path)
{
    return @{@"ok": @YES, @"path": path};
}

// Resolves with a result per source, in order, once all have loaded or failed:
// { ok, width, height } or { ok: false, error }. Never rejects. A source with
// memoryCache false is only stored on disk, without decoding it (its size
// comes from the header).
- (void)preload:(NSArray *)sourcesJSON
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(__unused RCTPromiseRejectBlock)reject
{
    NSArray<FFFastImageSource *> *sources = [RCTConvert FFFastImageSourceArray:sourcesJSON];
    // This runs on the module's queue; the queue state is only touched on
    // the main queue.
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
            if (!source.memoryCache) {
                // Not decoded (only its header is read, for the size), and not
                // kept in memory, also when it comes from the disk cache.
                options |= SDWebImageAvoidDecodeImage;
                context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
            }
            FFFQueueLoad(source, options, [context copy], ^(UIImage *image, NSError *error) {
                results[idx] = image
                    ? @{@"ok": @YES, @"width": @(image.size.width), @"height": @(image.size.height)}
                    : FFFFailure([source errorMessage:error]);
                finishOne();
            });
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
- (void)getCachePath:(NSDictionary *)sourceJSON
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(__unused RCTPromiseRejectBlock)reject
{
    FFFastImageSource *source = [RCTConvert FFFastImageSource:sourceJSON];
    if (!source.url) {
        NSString *key = FFFDiskCacheKey(source);
        if (!key) {
            resolve(FFFFailure(@"Invalid source: no uri or cacheKey"));
            return;
        }
        FFFFindCachedFile(key, ^(NSString *path) {
            resolve(FFFFile(path));
        }, ^{
            resolve(FFFFailure(@"Not in the disk cache"));
        });
        return;
    }
    if (source.url.isFileURL) {
        BOOL exists = [NSFileManager.defaultManager fileExistsAtPath:source.url.path];
        resolve(exists ? FFFFile(source.url.path) : FFFFailure(@"No file at this uri"));
        return;
    }
    NSString *key = FFFDiskCacheKey(source);
    void (^resolveFile)(NSString *) = ^(NSString *path) {
        resolve(FFFFile(path));
    };
    FFFFindCachedFile(key, resolveFile, ^{
        if (source.cacheControl == FFFCacheControlCacheOnly) {
            resolve(FFFFailure(@"Not in the disk cache"));
            return;
        }
        // As a disk-only preload: not decoded, and not looked up in or kept in
        // memory (an image in memory may not be on disk). It completes once
        // the file is written.
        SDWebImageOptions options = FFFPreloadOptions(source) | SDWebImageAvoidDecodeImage | SDWebImageWaitStoreCache;
        SDWebImageMutableContext *context = FFFPreloadContext(source);
        context[SDWebImageContextQueryCacheType] = @(SDImageCacheTypeDisk);
        context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
        FFFQueueLoad(source, options, [context copy], ^(UIImage *image, NSError *error) {
            if (!image) {
                resolve(FFFFailure([source errorMessage:error]));
                return;
            }
            FFFFindCachedFile(key, resolveFile, ^{
                resolve(FFFFailure(@"Not stored in the disk cache"));
            });
        });
        FFFStartPendingPreloads();
    });
}

// Stores a local image file as the source's image in the disk cache, so views
// and preloads of the source load it without downloading it, and resolves
// with its cached file: { ok, path } or { ok: false, error }. Never rejects.
// It doesn't replace an image that's already cached (Glide can't on Android;
// a new image should get a new cacheKey), and doesn't store `web` sources
// (Android keeps them only in an HTTP cache).
- (void)writeToCache:(NSDictionary *)sourceJSON
                file:(NSString *)file
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(__unused RCTPromiseRejectBlock)reject
{
    FFFastImageSource *source = [RCTConvert FFFastImageSource:sourceJSON];
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
    FFFFindCachedFile(key, ^(NSString *path) {
        resolve(FFFFailure(@"Already in the disk cache"));
    }, ^{
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSData *data = [NSData dataWithContentsOfURL:fileURL];
            if (!data) {
                resolve(FFFFailure(@"Can't read the file"));
                return;
            }
            if ([NSData sd_imageFormatForImageData:data] == SDImageFormatUndefined) {
                resolve(FFFFailure(@"Not an image"));
                return;
            }
            SDImageCache *cache = SDImageCache.sharedImageCache;
            [cache storeImageDataToDisk:data forKey:key];
            // An image a view showed under this key before, which isn't on
            // disk anymore.
            [cache removeImageFromMemoryForKey:key];
            resolve(FFFFile([cache cachePathForKey:key]));
        });
    });
}

// Changes cache limits at runtime and saves them, so they're used on the next
// launches too: a number (0 for no limit), or null to go back to the app's
// Info.plist or SDWebImage's default. A lower disk limit applies at once (what's
// over it is removed; the disk cache is trimmed to half of maxDiskSize when
// it's over), instead of when the app next goes to the background. Resolves
// with the limits in effect (0 for no limit), and diskSize: the bytes the disk
// cache uses now.
- (void)configureCache:(NSDictionary *)limits
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(__unused RCTPromiseRejectBlock)reject
{
    SDImageCache *cache = SDImageCache.sharedImageCache;
    SDImageCacheConfig *config = cache.config;
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSUInteger maxDiskSize = config.maxDiskSize;
    NSTimeInterval maxDiskAge = config.maxDiskAge;
    // The limits set to null, which arrive as a list (a TurboModule leaves
    // null values out of the dictionary).
    NSArray *reset = [limits[@"reset"] isKindOfClass:NSArray.class] ? limits[@"reset"] : @[];
    for (NSString *name in FFFCacheLimitNames()) {
        id value = limits[name];
        if (value == (id)kCFNull || [reset containsObject:name]) {
            [defaults removeObjectForKey:FFFSavedCacheLimitKey(name)];
        } else if ([value isKindOfClass:NSNumber.class]) {
            [defaults setObject:value forKey:FFFSavedCacheLimitKey(name)];
        } else {
            // Not given: unchanged.
            continue;
        }
        FFFSetCacheLimit(config, name, FFFCacheLimit(name));
    }
    void (^finish)(void) = ^{
        // Not on the disk cache's queue, which image loads use.
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
            resolve(@{
                @"maxDiskSize": @(config.maxDiskSize),
                @"maxDiskAge": @(MAX(config.maxDiskAge, 0)),
                @"maxMemorySize": @(config.maxMemoryCost),
                @"diskSize": @(FFFFolderSize(cache.diskCachePath)),
            });
        });
    };
    if (config.maxDiskSize != maxDiskSize || config.maxDiskAge != maxDiskAge) {
        [cache deleteOldFilesWithCompletionBlock:finish];
    } else {
        finish();
    }
}

- (void)clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
    [SDImageCache.sharedImageCache clearMemory];
    resolve(NULL);
}

- (void)clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
    // And the HTTP cache of `cache: 'web'` images.
    [FFFastImageSource.webURLCache removeAllCachedResponses];
    [SDImageCache.sharedImageCache clearDiskOnCompletion:^(){
        resolve(NULL);
    }];
}

@end
