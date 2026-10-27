#import <SDWebImage/SDAnimatedImage.h>
#import <SDWebImage/SDWebImageDefine.h>

// Runs block (parsing or drawing an SVG) while no other thread of Fast
// Image's parses or draws one, and returns what it returns. Core Graphics draws antialiased translucent
// shapes wrongly when several threads draw them at once, even into separate
// bitmaps (FB25211753, confirmed by Apple on iOS 26 and 27:
// https://developer.apple.com/forums/thread/851778): on an iPhone 15 Pro
// Max, drawing a 200-shape SVG on 8 threads made 10-20% of the bitmaps come
// out with some shapes' edges jagged and in the wrong colors, and parsing an
// SVG while another one was drawn made some too. One at a time, all came out
// right. The main thread goes first, waiting for the drawing in progress at
// most.
FOUNDATION_EXTERN id FFFWithSVGLock(id (^block)(void));

// A vector image (an SVG) drawn into a bitmap at `scale` pixels per point,
// keeping its size in points, at most 16 megapixels, with 8 bits per channel;
// nil for an image with no size. Safe off the main thread; drawn under FFFWithSVGLock.
FOUNDATION_EXTERN UIImage* FFFDrawnVectorImage(UIImage* image, CGFloat scale);

// An image decoded at about the size it's shown at (the `downsample`
// prop), instead of at full size. The view asks for it with SDWebImage's
// thumbnail context: the box to fill (the view's size in pixels), and
// preserveAspectRatio NO when the image has to cover the box (objectFit
// cover or fill) rather than fit in it (contain or scale-down). SDWebImage's
// own thumbnail decoding can only fit, so this class works out the size from
// the image's header before it decodes, as React Native's Image does.
@interface FFFDownsampledImage : SDAnimatedImage

// Sets a load's context to decode the image for a box (in pixels) to cover
// or fit in. An SVG is drawn into a bitmap for it, with at most maxScale
// pixels per point if it's not zero (objectFit scale-down shows an image no
// larger than its own size).
+ (void) addToContext: (SDWebImageMutableContext*)context box: (CGSize)box cover: (BOOL)cover maxScale: (CGFloat)maxScale;

// Sets a load's context to decode the image at full size, through this
// class: an image over 64 megapixels at 16 megapixels unless `uncapped`.
// Every FastImage load uses it, so loads of the same url
// can share a download: SDWebImage's downloader decodes each load of a
// download with the first load's image class (and each with its own size),
// and SDWebImage's own thumbnail decoding can't cover a box.
+ (void) addFullSizeToContext: (SDWebImageMutableContext*)context uncapped: (BOOL)uncapped;

// The size of the full image (in points, like UIImage's size) that an image
// loaded this way was decoded from, for onLoad, or zero for other images.
+ (CGSize) sourceSizeOfImage: (UIImage*)image;

// Whether an image loaded this way is an SVG drawn into a bitmap for the box.
+ (BOOL) isDrawnForBox: (UIImage*)image;

// Whether an image loaded this way is at least the size a full-size load
// (not uncapped) decodes it at.
+ (BOOL) isFullSizeImage: (UIImage*)image;

// Whether an image loaded this way is smaller than a full-size load decodes it
// at, or NO for other images.
+ (BOOL) isSmallerThanFullSize: (UIImage*)image uncapped: (BOOL)uncapped;

// Drops the memory cache's image for a load (call it before the load) when
// the load can't use it, so it decodes the file from the disk cache:
// - for a full-size load (a view that doesn't downsample, or a preload), a
//   smaller image: SDWebImage puts an image it decoded smaller from the disk
//   cache under the full-size image's key too (SDWebImageManager 5.21.6 and
//   later writes what its original cache query finds back there; 5.21.5's
//   SDImageCache moved it to its own key), which would show blurry, or be a
//   preload's size. FastImage's own loads don't (addToContext's original
//   cache keeps only full-size images in memory), but other SDWebImage loads
//   in the app can.
// - one decoded the other way, to HDR or SDR (dynamicRangeLimit), since
//   SDWebImage's memory cache key is the same for both.
+ (void) forgetUnusableImageForURL: (NSURL*)url context: (SDWebImageContext*)context;

@end
