#import <Photos/Photos.h>
#import <React/RCTBridgeModule.h>

// Example apps only: the photo library's photos, for the photo library
// (ph://) regression cases.
@interface ExamplePhotos : NSObject <RCTBridgeModule>
@end

@implementation ExamplePhotos

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

// The library's photos, newest first: their ids (the part after ph://),
// sizes in pixels and uniform types (e.g. public.jpeg, com.compuserve.gif),
// and whether the app has access to them.
RCT_EXPORT_METHOD(photos : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
    PHFetchOptions *options = [PHFetchOptions new];
    options.sortDescriptors = @[ [NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO] ];
    PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];
    NSMutableArray *photos = [NSMutableArray array];
    [assets enumerateObjectsUsingBlock:^(PHAsset *asset, NSUInteger index, BOOL *stop) {
        NSString *type = [asset respondsToSelector:NSSelectorFromString(@"uniformTypeIdentifier")]
            ? [asset valueForKey:@"uniformTypeIdentifier"]
            : nil;
        [photos addObject:@{
            @"id" : asset.localIdentifier,
            @"width" : @(asset.pixelWidth),
            @"height" : @(asset.pixelHeight),
            @"type" : type ?: @"",
        }];
    }];
    resolve(@{
        @"authorized" : @([PHPhotoLibrary authorizationStatus] == PHAuthorizationStatusAuthorized),
        @"photos" : photos,
    });
}

@end
