#import "FFFastImageModule.h"
#import "FFFastImageView.h"
#import "RCTConvert+FFFastImage.h"

#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDWebImagePrefetcher.h>

@implementation FFFastImageModule

RCT_EXPORT_MODULE(FastImageModule)

// Resolves with a result per source, in order, once all have loaded or failed:
// { ok, width, height } or { ok: false, error }. Never rejects.
- (void)preload:(NSArray *)sources resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    NSMutableArray *results = [NSMutableArray arrayWithCapacity:sources.count];
    dispatch_group_t group = dispatch_group_create();
    // With the prefetcher's options (low priority), but one source at a time
    // (not SDWebImagePrefetcher), to get each source's result and to send its
    // headers with its own request only.
    SDWebImageOptions options = [SDWebImagePrefetcher sharedImagePrefetcher].options;

    [sources enumerateObjectsUsingBlock:^(id json, NSUInteger idx, BOOL *stop) {
        FFFastImageSource *source = [RCTConvert FFFastImageSource:json];
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
                : @{@"ok": @NO, @"error": [FFFastImageView messageForError:error]};
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

- (void)clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [SDImageCache.sharedImageCache clearMemory];
    resolve(nil);
}

- (void)clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [SDImageCache.sharedImageCache clearDiskOnCompletion:^() {
        resolve(nil);
    }];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeFastImageModuleSpecJSI>(params);
}

@end
