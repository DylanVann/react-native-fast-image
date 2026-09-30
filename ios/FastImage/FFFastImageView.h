#import <UIKit/UIKit.h>

#import <SDWebImage/SDAnimatedImageView+WebCache.h>
#import <SDWebImage/SDWebImageDownloader.h>

#import <React/RCTComponent.h>
#import <React/RCTResizeMode.h>

#import "FFFastImageSource.h"

@interface FFFastImageView : SDAnimatedImageView

@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadStart;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageProgress;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageError;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoad;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadEnd;
@property (nonatomic, assign) RCTResizeMode resizeMode;
@property (nonatomic, strong) FFFastImageSource *source;
// Several sources (2 or more) of the same image at different sizes: the view
// loads the one whose size is closest to its own.
@property (nonatomic, copy) NSArray<FFFastImageSource *> *sources;
@property (nonatomic, strong) UIImage *defaultSource;
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

@end

// An error's description, with the HTTP status code when there is one.
FOUNDATION_EXTERN NSString *FFFErrorMessage(NSError *error);


