#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <SDWebImage/SDWebImagePrefetcher.h>

@interface FFFastImagePreloaderManager : RCTEventEmitter <RCTBridgeModule, SDWebImagePrefetcherDelegate>

@end
