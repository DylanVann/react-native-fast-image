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
// The loaded image's own size in points, as each image loads (whatever events
// JS handles), for the view's layout.
@property (nonatomic, copy) void (^onImageSize)(CGSize size);
// Whether the style leaves a side open, which follows the loaded image (the
// autoSize prop), and the layout's size inside the view's padding and
// borders: an open side is 0 there until an image has loaded.
@property (nonatomic, assign) BOOL autoSize;
@property (nonatomic, assign) CGSize contentSize;
@property (nonatomic, assign) FFFObjectFit objectFit;
// The `source` prop: one source, or several (sizes of one image), of which
// the view loads the one whose size is closest to its own.
@property (nonatomic, copy) NSArray<FFFastImageSource *> *sources;
// The `placeholder` prop.
@property (nonatomic, strong) UIImage *placeholder;
// `placeholder` as a url (a source): loaded apart from the
// image, at a high priority (or only from the cache, with cache cacheOnly),
// it shows over the other placeholders once it has.
@property (nonatomic, strong) FFFastImageSource *placeholderSource;
// The sources' ThumbHashes or blurDataUris (data uris), by the source's index
// (an empty string for none): the picked source's shows instead of
// placeholder. Set apart from the sources, so a new one for the same image
// doesn't load it again.
@property (nonatomic, copy) NSArray<NSString *> *sourcePlaceholders;
// `placeholder` as a thumbhash or blurDataUri: shows for the sources without
// their own.
@property (nonatomic, copy) NSString *placeholderHash;
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
// The dynamicRangeLimit prop: standard, constrained or no-limit (nil when
// not set). With constrained and no-limit, HDR images are decoded to HDR and
// shown in HDR (iOS and tvOS 17+).
@property (nonatomic, copy) NSString *dynamicRangeLimit;
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

// Loads the image again, as a new source would (once the view has a size,
// when it needs one): the ref's reload().
- (void) reload;

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


