#import <UIKit/UIKit.h>

#import <SDWebImage/SDAnimatedImageView+WebCache.h>
#import <SDWebImage/SDWebImageDownloader.h>

#import <React/RCTComponent.h>

#import "FFFastImageSource.h"

// objectFit, as CSS's object-fit.
typedef NS_ENUM(NSInteger, FFFObjectFit) {
    FFFObjectFitCover,
    FFFObjectFitContain,
    FFFObjectFitFill,
    // The image at its own size, or scaled down to fit if it's larger.
    FFFObjectFitScaleDown,
    // The image at its own size, whatever its size (cropped by the view).
    FFFObjectFitNone,
};

@interface FFFastImageView : SDAnimatedImageView

@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadStart;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageProgress;
// Whether to send progress events (the image has an onProgress).
@property (nonatomic, assign) BOOL trackProgress;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageError;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoad;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadEnd;
@property (nonatomic, assign) FFFObjectFit objectFit;
@property (nonatomic, strong) FFFastImageSource *source;
// Several sources (2 or more) of the same image at different sizes: the view
// loads the one whose size is closest to its own.
@property (nonatomic, copy) NSArray<FFFastImageSource *> *sources;
@property (nonatomic, strong) UIImage *defaultSource;
// The `sourcePlaceholder` prop (one source), or `sourcePlaceholders` (several,
// by index, an empty string for none): the picked source's ThumbHash or
// blurDataUri (a data uri) shows instead of defaultSource. JS sends them apart
// from the sources, so a new one for the same image doesn't load it again.
@property (nonatomic, copy) NSString *sourcePlaceholder;
@property (nonatomic, copy) NSArray<NSString *> *sourcePlaceholders;
@property (nonatomic, strong) UIColor *imageColor;
// When it changes, the next image doesn't replace the current one: the view
// clears first (for views reused for other content, like list rows).
@property (nonatomic, copy) NSString *recyclingKey;
// How many times animated images play: -1 for the file's own loop count (the
// `loop` prop not set), 0 for forever, or a number of times.
@property (nonatomic, assign) NSInteger loopCount;
// How the image is filtered when drawn at another size: auto, smooth or
// pixelated.
@property (nonatomic, copy) NSString *imageRendering;
// Pauses animated images on the frame they're showing.
@property (nonatomic, assign) BOOL paused;
// The `transition` prop: how long a loaded image takes to fade in, in
// milliseconds (0 for no fade), whether it also fades over a loaded image
// (a new source), and which cache hits show at once (none, memory or all).
@property (nonatomic, assign) double transitionDuration;
@property (nonatomic, assign) BOOL transitionBetweenImages;
@property (nonatomic, copy) NSString *transitionSkipOnCacheHit;
// Decodes images at about the view's size instead of at full size.
@property (nonatomic, assign) BOOL downsample;
// Blurs the loaded image by this radius, in points (0 is no blur).
@property (nonatomic, assign) CGFloat blurRadius;
// objectPosition, as CSS computes it: on each axis the image's left or top
// edge is at (view - image) * fraction + offset, in points.
@property (nonatomic, assign) CGFloat objectPositionX;
@property (nonatomic, assign) CGFloat objectPositionXOffset;
@property (nonatomic, assign) CGFloat objectPositionY;
@property (nonatomic, assign) CGFloat objectPositionYOffset;

// After an update's props are set: loads the image if they changed it (once
// the view has a size, when it needs one).
- (void) didSetProps;

// Keeps the view's mask (React Native's, for its rounded corners) on the box
// the view was laid out at, while objectPosition moves the view: after React
// Native sets or removes it.
- (void) updateMask;

// Stops for good, before the view is discarded: cancels the load and sends no
// more events, also for a load that already finished and is on its way to the
// main queue.
- (void) stop;

@end

// An error's description, with the HTTP status code when there is one.
FOUNDATION_EXTERN NSString *FFFErrorMessage(NSError *error);

// Applies the app's cache limits (saved by configureCache, or in its
// Info.plist) to SDWebImage's cache, once, before FastImage loads an image
// (in FFFastImageModule.mm).
FOUNDATION_EXTERN void FFFApplyCacheLimits(void);


