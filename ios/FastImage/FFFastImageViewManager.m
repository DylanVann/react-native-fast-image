#import "FFFastImageViewManager.h"
#import "FFFastImageView.h"

#import <SDWebImage/SDWebImagePrefetcher.h>
#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import <React/RCTLog.h>
#import <SDWebImage/SDWebImage.h>
#import <SDWebImagePhotosPlugin/SDImagePhotosLoader.h>

@interface FFFastImageViewManager()

@property (nonatomic, strong) SDWebImageManager* manager;

@end

@implementation FFFastImageViewManager

RCT_EXPORT_MODULE(FastImageView)

- (instancetype)init {
    self = [super init];
    self.manager = [[SDWebImageManager alloc] initWithCache:SDImageCache.sharedImageCache loader:SDImagePhotosLoader.sharedLoader];
    return self;
}

- (FFFastImageView*)view {
  return [[FFFastImageView alloc] initWithManager:self.manager];
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

RCT_EXPORT_METHOD(forceRefreshImage:(nonnull NSNumber*) reactTag)
{
    [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *,UIView *> *viewRegistry) {
        UIView* view = viewRegistry[reactTag];
        if (!view || ![view isKindOfClass:[FFFastImageView class]]) {
            RCTLogError(@"Cannot find NativeView with tag #%@", reactTag);
            return;
        }
        [(FFFastImageView*)view reloadImage];
    }];
}

RCT_EXPORT_METHOD(forceRefreshImage:(nonnull NSNumber*) reactTag)
{
    [self.bridge.uiManager addUIBlock:^(RCTUIManager *uiManager, NSDictionary<NSNumber *,UIView *> *viewRegistry) {
        UIView* view = viewRegistry[reactTag];
        if (!view || ![view isKindOfClass:[FFFastImageView class]]) {
            RCTLogError(@"Cannot find NativeView with tag #%@", reactTag);
            return;
        }
        [(FFFastImageView*)view reloadImage];
    }];
}

@end

