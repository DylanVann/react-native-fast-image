#import <SDWebImage/SDAnimatedImage.h>
#import <SDWebImage/SDWebImageDefine.h>

// An image decoded at about the size it's shown at (the `downsample`
// prop), instead of at full size. The view asks for it with SDWebImage's
// thumbnail context: the box to fill (the view's size in pixels), and
// preserveAspectRatio NO when the image has to cover the box (resizeMode
// cover or stretch) rather than fit in it (contain or center). SDWebImage's
// own thumbnail decoding can only fit, so this class works out the size from
// the image's header before it decodes, as React Native's Image does.
@interface FFFDownsampledImage : SDAnimatedImage

// Sets a load's context to decode the image for a box (in pixels) to cover
// or fit in.
+ (void) addToContext: (SDWebImageMutableContext*)context box: (CGSize)box cover: (BOOL)cover;

// Sets a load's context to decode the image at full size, through this class
// when it's supported. Every FastImage load uses it, so loads of the same url
// can share a download: SDWebImage's downloader decodes each load of a
// download with the first load's image class (and each with its own size),
// and SDWebImage's own thumbnail decoding can't cover a box.
+ (void) addFullSizeToContext: (SDWebImageMutableContext*)context;

// The size of the full image (in points, like UIImage's size) that an image
// loaded this way was decoded from, for onLoad, or zero for other images.
+ (CGSize) sourceSizeOfImage: (UIImage*)image;

// SDWebImage puts an image it decoded smaller from the disk cache, for a view
// that downsamples, into the memory cache under the full-size image's key too
// (SDWebImageManager writes what its original cache query finds back there),
// where a full-size load (a view that doesn't downsample, or a preload) would
// find it: a blurry image, or a preload's size. Drops it there, so that load
// decodes the file from the disk cache. Call it before a full-size load.
+ (void) forgetSmallerFullSizeImageForURL: (NSURL*)url context: (SDWebImageContext*)context;

// Whether this version of SDWebImage can decode through this class: it
// decodes static images through the animated image class since 5.19.
+ (BOOL) isSupported;

@end
