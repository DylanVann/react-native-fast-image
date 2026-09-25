#import "FFFastImageViewManager.h"
#import "FFFastImageView.h"
#import <React/RCTLog.h>

#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
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

RCT_EXPORT_METHOD(preload:(nonnull NSArray<FFFastImageSource *> *)sources)
{
    SDWebImagePrefetcher *prefetcher = [SDWebImagePrefetcher sharedImagePrefetcher];
    NSMutableArray *urls = [NSMutableArray arrayWithCapacity:sources.count];

    [sources enumerateObjectsUsingBlock:^(FFFastImageSource * _Nonnull source, NSUInteger idx, BOOL * _Nonnull stop) {
        // Skip sources without a url (an empty, missing or null uri). NSArray can't
        // hold nil, so adding one throws and crashes the app.
        if (!source.url) {
            // preload has no way to report errors, so log it.
            RCTLogWarn(@"FastImage.preload: skipping a source without a valid uri");
            return;
        }
        if (source.headers.count == 0) {
            [urls addObject:source.url];
            return;
        }
        // Send the headers with this source's request only (setting them on
        // the shared downloader sent them with every later request). The
        // prefetcher can't take headers per request in SDWebImage 5.11 (its
        // context is shared by all prefetches), so load it the way the
        // prefetcher does, with the same options.
        [[SDWebImageManager sharedManager] loadImageWithURL:source.url
                                                    options:prefetcher.options
                                                    context:@{SDWebImageContextDownloadRequestModifier: source.requestModifier}
                                                   progress:nil
                                                  completed:^(UIImage *image, NSData *data, NSError *error, SDImageCacheType cacheType, BOOL finished, NSURL *imageURL) {}];
    }];

    [prefetcher prefetchURLs:urls];
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
