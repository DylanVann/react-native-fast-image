#import "FFFastImageViewManager.h"
#import "FFFastImageView.h"

#import <SDWebImage/SDWebImagePrefetcher.h>

@implementation FFFastImageViewManager

RCT_EXPORT_MODULE(FastImageView)

- (FFFastImageView*)view {
  return [[FFFastImageView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(source, FFFastImageSource)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, RCTResizeMode)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadStart, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onFastImageLoadEnd, RCTDirectEventBlock)
RCT_REMAP_VIEW_PROPERTY(tintColor, imageColor, UIColor)

RCT_EXPORT_METHOD(preload:(nonnull NSArray<FFFastImageSource *> *)sources)
{
    NSMutableArray *urls = [NSMutableArray arrayWithCapacity:sources.count];

    [sources enumerateObjectsUsingBlock:^(FFFastImageSource * _Nonnull source, NSUInteger idx, BOOL * _Nonnull stop) {
        [source.headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString* header, BOOL *stop) {
            [[SDWebImageDownloader sharedDownloader] setValue:header forHTTPHeaderField:key];
        }];
        [urls setObject:source.url atIndexedSubscript:idx];
    }];

    [[SDWebImagePrefetcher sharedImagePrefetcher] prefetchURLs:urls];
}

// https://github.com/DylanVann/react-native-fast-image/pull/351/files
RCT_REMAP_METHOD(
  loadImage,
  loadImageWithSource: (nonnull FFFastImageSource *)source resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject
) {
  SDWebImageManager *imageManager = [SDWebImageManager sharedManager];
  NSString *cacheKey = [imageManager cacheKeyForURL:source.url];
  NSString *imagePath = [imageManager.imageCache cachePathForKey:cacheKey];

  // set headers
  [source.headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString* header, BOOL *stop) {
    [imageManager.imageLoader setValue:header forHTTPHeaderField:key];
  }];

  // set options
  SDWebImageOptions options = 0;
  options |= SDWebImageRetryFailed;
  switch (source.priority) {
    case FFFPriorityLow:
      options |= SDWebImageLowPriority;
      break;
    case FFFPriorityNormal:
      // Priority is normal by default.
      break;
    case FFFPriorityHigh:
      options |= SDWebImageHighPriority;
      break;
  }

  switch (source.cacheControl) {
    case FFFCacheControlWeb:
      options |= SDWebImageRefreshCached;
      break;
    case FFFCacheControlCacheOnly:
      options |= SDWebImageCacheMemoryOnly;
      break;
    case FFFCacheControlImmutable:
      break;
  }

  // load image
  [imageManager loadImageWithURL:source.url options:options progress:nil completed:^(UIImage * _Nullable image, NSData * _Nullable data, NSError * _Nullable error, SDImageCacheType cacheType, BOOL finished, NSURL * _Nullable imageURL) {
    if (error != nil) {
      reject(@"FastImage", @"Failed to load image", error);
      return;
    }

    // store image manually (since image manager may call the completion block before storing it in the disk cache)
    [imageManager.imageCache storeImage:image forKey:cacheKey completion:^{
      resolve(imagePath);
    }];
  }];
}

@end

