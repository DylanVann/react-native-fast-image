#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <SDWebImage/SDWebImagePrefetcher.h>
#import <SDWebImage/SDWebImageDownloader.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDImageCache.h>

@interface FFFastImagePreloaderManager : RCTEventEmitter <RCTBridgeModule, SDWebImagePrefetcherDelegate>

@end
