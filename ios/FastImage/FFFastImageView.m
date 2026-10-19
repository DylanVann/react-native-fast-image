#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>
#import <React/RCTUtils.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDImageTransformer.h>
#import <SDWebImage/SDImageCodersManager.h>
#import "FFFDownsampledImage.h"
#import "FFFThumbHash.h"
#import "FFFBoxBlur.h"

@interface FFFastImageView ()

@property(nonatomic, assign) BOOL hasCompleted;
@property(nonatomic, assign) BOOL hasErrored;
// Whether the latest change of props requires the image to be reloaded
@property(nonatomic, assign) BOOL needsReload;

@property(nonatomic, strong) NSDictionary* onLoadEvent;
@property(nonatomic, strong) NSDictionary* onErrorEvent;
// The image before tinting and blurring, kept while either is applied so they
// can be changed or removed. nil when neither is (super.image is the image).
@property(nonatomic, strong) UIImage* originalImage;
// Counts images set, so a blur that finishes can tell if it's still current.
@property(nonatomic, assign) NSUInteger imageCount;
// The view's size when the image showing was blurred.
@property(nonatomic, assign) CGSize blurredForSize;
// The blurred image showing (untinted), so a tint change can re-show it.
@property(nonatomic, strong) UIImage* blurredImage;
// The image being blurred fades in once it's blurred (transition).
@property(nonatomic, assign) BOOL fadesBlurredImage;
// The image being blurred is the first loaded one the view shows: until it's
// blurred, the view shows no loaded image (nothing, or the placeholder prop).
@property(nonatomic, assign) BOOL blursOverNothing;
// Whether the current load was already restarted after the app came back
// from the background (see downloadImage:).
@property(nonatomic, assign) BOOL retriedAfterBackground;
// Waits for the app to be active again, to restart a load.
@property(nonatomic, strong) id activeObserver;
// Whether the view shows an image that loaded (not the placeholder prop or
// nothing). A new source then keeps it until the new image has loaded (see
// reloadImage).
@property(nonatomic, assign) BOOL showsLoadedImage;
// downsample, or several sources: a load waits for the view's size (see
// didSetProps).
@property(nonatomic, assign) BOOL waitsForSize;
// The `source` prop. With several `sources`, _source is the one picked for
// the view's size instead.
@property(nonatomic, strong) FFFastImageSource* propSource;
// Several sources: the next load switches to another one for a new view
// size, and the one after it is loading. It's the same picture at another
// size, so it doesn't fade in.
@property(nonatomic, assign) BOOL switchesSource;
@property(nonatomic, assign) BOOL loadsSwitchedSource;
// The size (in pixels) the image showing or loading was decoded for, and
// whether it covers it; zero for a full-size image.
@property(nonatomic, assign) CGSize decodedBox;
@property(nonatomic, assign) BOOL decodedCover;
// Counts loads, so a quiet reload's completion can tell if it's still current.
@property(nonatomic, assign) NSUInteger loadCount;
// The frame the view was laid out at (the box the image fits in), and how far
// objectPosition moves the view from it (see updatePosition).
@property(nonatomic, assign) CGRect box;
@property(nonatomic, assign) CGPoint positionOffset;
// The view's own mask, which clips it to the box while it's moved, when React
// Native gives it none (the view doesn't clip: overflow visible).
@property(nonatomic, strong) CALayer* ownMask;
// The picked source's placeholder (its ThumbHash or blurDataUri) decoded, and
// the string, or nil: it shows instead of the placeholder prop (see
// shownPlaceholder).
@property(nonatomic, strong) UIImage* hashImage;
@property(nonatomic, copy) NSString* hashImageKey;
// Whether the view shows its placeholder (the placeholder prop or the
// source's), and whether that's the source's (hashImage).
@property(nonatomic, assign) BOOL showsPlaceholder;
@property(nonatomic, assign) BOOL showsHash;
// dynamicRangeLimit switched between HDR and SDR: the image is decoded again,
// quietly (see reloadForDynamicRange).
@property(nonatomic, assign) BOOL needsDynamicRangeReload;

@end

// When the app last went to the background (CACurrentMediaTime), or 0.
static CFTimeInterval FFFEnteredBackgroundAt = 0;

static UIImage* FFFBlurredImage(UIImage* image, CGFloat scale, CGFloat radius, BOOL downscale);

@implementation FFFastImageView

+ (void) initialize {
    if (self != [FFFastImageView class]) {
        return;
    }
    FFFApplyCacheLimits();
    [[NSNotificationCenter defaultCenter] addObserverForName: UIApplicationDidEnterBackgroundNotification
                                                      object: nil
                                                       queue: [NSOperationQueue mainQueue]
                                                  usingBlock: ^(NSNotification* notification) {
        FFFEnteredBackgroundAt = CACurrentMediaTime();
    }];
}

- (id) init {
    self = [super init];
    // objectFit cover (FFFObjectFitCover, 0).
    self.contentMode = UIViewContentModeScaleAspectFill;
    self.clipsToBounds = YES;
    _objectPositionX = 0.5;
    _objectPositionY = 0.5;
    // The tint (tintColor) stays as it is while an alert or sheet is shown,
    // rather than dimming like the system's controls.
    self.tintAdjustmentMode = UIViewTintAdjustmentModeNormal;
    _loopCount = -1;
    // Images are decoded at about the size they're shown at unless
    // downsample is false, as on Android.
    _downsample = YES;
    return self;
}

- (void) setImageRendering: (NSString*)imageRendering {
    _imageRendering = [imageRendering copy];
    if ([imageRendering isEqualToString: @"smooth"]) {
        // Trilinear: drawn smaller from mipmaps, so a large image drawn much
        // smaller is smoothed instead of aliased (#445). The mipmaps take
        // about a third more memory than the decoded image.
        self.layer.minificationFilter = kCAFilterTrilinear;
        self.layer.magnificationFilter = kCAFilterLinear;
    } else if ([imageRendering isEqualToString: @"pixelated"]) {
        // Nearest neighbor: sharp pixels, e.g. for pixel art (#926).
        self.layer.minificationFilter = kCAFilterNearest;
        self.layer.magnificationFilter = kCAFilterNearest;
    } else {
        self.layer.minificationFilter = kCAFilterLinear;
        self.layer.magnificationFilter = kCAFilterLinear;
    }
}

- (void) setLoopCount: (NSInteger)loopCount {
    if (_loopCount == loopCount) {
        return;
    }
    _loopCount = loopCount;
    // SDAnimatedImageView uses animationRepeatCount (0 is forever) instead of
    // the file's loop count when shouldCustomLoopCount is set, for the next
    // image it shows.
    self.shouldCustomLoopCount = loopCount >= 0;
    if (loopCount >= 0) {
        self.animationRepeatCount = loopCount;
    } else if (self.player && [self.image conformsToProtocol: @protocol(SDAnimatedImage)]) {
        self.player.totalLoopCount = [(id<SDAnimatedImage>) self.image animatedImageLoopCount];
    }
    // Apply it to the image that's showing, and play it again (unless it's
    // paused: then it waits on the first frame).
    if (self.player) {
        [self.player seekToFrameAtIndex: 0 loopCount: 0];
        if (!_paused) {
            [self startAnimating];
        }
    }
}

// Whether a loaded image fades in (the `transition` prop). Over a loaded
// image (a new source) only with betweenImages: otherwise it replaces it at
// once, as Android's image libraries fade an image in from nothing and never
// between images. Then as SDWebImage's transitions and those libraries
// decide: from the memory cache it shows at once (skipOnCacheHit 'memory',
// the default), and from the disk cache too with 'all'. Downloads, local
// files and bundled images fade.
- (BOOL) fadesImageFromCache: (SDImageCacheType)cacheType {
    if (self.transitionDuration <= 0 || self.loadsSwitchedSource ||
        ([self displaysLoadedImage] && !self.transitionBetweenImages)) {
        return NO;
    }
    NSString* skip = self.transitionSkipOnCacheHit;
    if ([skip isEqualToString: @"none"]) {
        return YES;
    }
    if (cacheType == SDImageCacheTypeMemory) {
        return NO;
    }
    // SDWebImage also keeps local files and bundled images in its disk cache,
    // so with 'all' they usually only fade the first time.
    return !(cacheType == SDImageCacheTypeDisk && [skip isEqualToString: @"all"]);
}

// Whether the view shows a loaded image now: a loaded image that's still
// being blurred isn't showing yet.
- (BOOL) displaysLoadedImage {
    return self.showsLoadedImage && !self.blursOverNothing;
}

// Shows a loaded image, fading it in over what the view shows if `fade`. A
// blurred image shows, and fades in, once it's blurred.
- (void) showLoadedImage: (UIImage*)image fade: (BOOL)fade {
    if ([self blurs: image]) {
        self.blursOverNothing = ![self displaysLoadedImage];
        self.fadesBlurredImage = fade;
        self.image = image;
        return;
    }
    self.blursOverNothing = NO;
    self.fadesBlurredImage = NO;
    if (fade) {
        [self fadeIn: ^{
            self.image = image;
        }];
    } else {
        self.image = image;
    }
}

// Makes the change (showing another image), fading it in over what the view
// showed.
- (void) fadeIn: (void (^)(void))change {
    if (!super.image || !self.layer.presentationLayer) {
        // Nothing to cross-dissolve from: the view shows no image, or isn't
        // on screen yet (e.g. a new view whose image loads as it mounts),
        // where a cross-dissolve has nothing drawn to start from and shows
        // the image at once. Fade the view in instead.
        change();
        CABasicAnimation* fadeIn = [CABasicAnimation animationWithKeyPath: @"opacity"];
        fadeIn.fromValue = @0;
        fadeIn.duration = self.transitionDuration / 1000;
        [self.layer addAnimation: fadeIn forKey: @"FFFFadeIn"];
        return;
    }
    // On the view it's in, which doesn't move, with the change itself not
    // animated: objectPosition moves this view for the new image
    // (updatePosition), which in a transition of this view was animated while
    // its mask moved at once. The old image stays where it was while the new
    // one fades in where it goes.
    UIView* container = self.superview ?: self;
    [UIView transitionWithView: container
                      duration: self.transitionDuration / 1000
                       options: UIViewAnimationOptionTransitionCrossDissolve | UIViewAnimationOptionAllowUserInteraction
                    animations: ^{
                        [UIView performWithoutAnimation: change];
                    }
                    completion: nil];
}

- (void) setPaused: (BOOL)paused {
    if (_paused == paused) {
        return;
    }
    _paused = paused;
    // SDAnimatedImageView starts an animated image when it's shown, and again
    // when the view comes back on screen, unless autoPlayAnimatedImage is off.
    // Stopping keeps the frame it's on (resetFrameIndexWhenStopped is off).
    self.autoPlayAnimatedImage = !paused;
    if (paused) {
        [self stopAnimating];
    } else {
        [self startAnimating];
    }
}

- (void) setObjectFit: (FFFObjectFit)objectFit {
    if (_objectFit != objectFit) {
        _objectFit = objectFit;
        [self updateContentMode];
        // The blur is made for the size the image is shown at: show it again.
        if ([self blurs: self.originalImage]) {
            [self setImage: self.originalImage];
        }
    }
}

// The content mode for objectFit. `scale-down` scales an image larger than
// the view down to fit, and shows a smaller one at its own size
// (UIViewContentModeCenter alone would show large images at full size,
// cropped), so it depends on the image and the view's size. `none` is the
// image at its own size, centered, whatever its size (cropped by the view).
- (void) updateContentMode {
    UIViewContentMode contentMode;
    switch (_objectFit) {
        case FFFObjectFitContain:
            contentMode = UIViewContentModeScaleAspectFit;
            break;
        case FFFObjectFitFill:
            contentMode = UIViewContentModeScaleToFill;
            break;
        case FFFObjectFitNone:
            // A source's placeholder stands for an image whose size isn't
            // known yet: as with contain, here and for scale-down.
            contentMode = self.showsHash ? UIViewContentModeScaleAspectFit : UIViewContentModeCenter;
            break;
        case FFFObjectFitScaleDown: {
            CGSize imageSize = super.image.size;
            CGSize viewSize = self.bounds.size;
            contentMode = self.showsHash || imageSize.width > viewSize.width || imageSize.height > viewSize.height
                ? UIViewContentModeScaleAspectFit
                : UIViewContentModeCenter;
            break;
        }
        case FFFObjectFitCover:
        default:
            contentMode = UIViewContentModeScaleAspectFill;
            break;
    }
    if (self.contentMode != contentMode) {
        self.contentMode = contentMode;
    }
    [self updatePosition];
}

- (void) setObjectPositionX: (CGFloat)objectPositionX {
    _objectPositionX = objectPositionX;
    [self updatePosition];
}

- (void) setObjectPositionXOffset: (CGFloat)objectPositionXOffset {
    _objectPositionXOffset = objectPositionXOffset;
    [self updatePosition];
}

- (void) setObjectPositionY: (CGFloat)objectPositionY {
    _objectPositionY = objectPositionY;
    [self updatePosition];
}

- (void) setObjectPositionYOffset: (CGFloat)objectPositionYOffset {
    _objectPositionYOffset = objectPositionYOffset;
    [self updatePosition];
}

// The frame React Native lays the view out at: the box the image fits in. The
// view itself is moved from it by objectPosition (see updatePosition).
- (void) setFrame: (CGRect)frame {
    self.box = frame;
    [super setFrame: CGRectOffset(frame, self.positionOffset.x, self.positionOffset.y)];
}

// objectPosition: where the image is in the view, as CSS places it. The
// content mode centers the image, so the view moves by the difference,
// keeping its size: React Native's mask for its rounded corners (made for its
// bounds) only has to move back (see updateMask). Not moved, as most images
// are, the view clips to its bounds as before.
- (void) updatePosition {
    CGPoint offset = [self imageOffset];
    if (!CGPointEqualToPoint(offset, self.positionOffset)) {
        self.positionOffset = offset;
        [super setFrame: CGRectOffset(self.box, offset.x, offset.y)];
    }
    [self updateMask];
}

// How far objectPosition moves the image from the center: on each axis its
// left or top edge is at (view - image) * fraction + offset, where the
// content mode centers it at (view - image) / 2. Nothing for fill, which
// fills the view.
- (CGPoint) imageOffset {
    CGSize view = self.box.size;
    CGSize size = super.image.size;
    if (size.width <= 0 || size.height <= 0 || view.width <= 0 || view.height <= 0) {
        return CGPointZero;
    }
    CGFloat scale;
    switch (self.contentMode) {
        case UIViewContentModeScaleAspectFill:
            scale = MAX(view.width / size.width, view.height / size.height);
            break;
        case UIViewContentModeScaleAspectFit:
            scale = MIN(view.width / size.width, view.height / size.height);
            break;
        case UIViewContentModeCenter:
            scale = 1;
            break;
        default:
            return CGPointZero;
    }
    CGFloat x = (view.width - size.width * scale) * (_objectPositionX - 0.5) + _objectPositionXOffset;
    CGFloat y = (view.height - size.height * scale) * (_objectPositionY - 0.5) + _objectPositionYOffset;
    return CGPointMake(isfinite(x) ? x : 0, isfinite(y) ? y : 0);
}

- (void) updateMask {
    CGPoint offset = self.positionOffset;
    BOOL moved = offset.x != 0 || offset.y != 0;
    // Moved, the view's bounds aren't the box: the mask clips it.
    self.clipsToBounds = !moved;
    CALayer* mask = self.layer.mask;
    if (!moved && (!mask || CGPointEqualToPoint(mask.frame.origin, CGPointZero)) && mask != self.ownMask) {
        return;
    }
    [CATransaction begin];
    [CATransaction setDisableActions: YES];
    if (mask && mask != self.ownMask) {
        // React Native's (the box with its rounded corners, in the view's
        // bounds): back on the box.
        CGRect frame = mask.frame;
        frame.origin = CGPointMake(-offset.x, -offset.y);
        mask.frame = frame;
    } else if (moved) {
        if (!self.ownMask) {
            self.ownMask = [CALayer layer];
            self.ownMask.backgroundColor = [UIColor blackColor].CGColor;
        }
        self.ownMask.frame = CGRectMake(-offset.x, -offset.y, self.box.size.width, self.box.size.height);
        self.layer.mask = self.ownMask;
    } else if (mask) {
        self.layer.mask = nil;
    }
    [CATransaction commit];
}

- (void) layoutSubviews {
    [super layoutSubviews];
    [self updateContentMode];
    [self blurAgainIfResized];
    if (self.waitsForSize) {
        // An image in the memory cache shows in this frame. Others start
        // loading from didSetProps's block, after layout, in the order the
        // views got their props: UIKit lays views out in its own order (in a
        // grid, the last one first), and downloads start in the order they're
        // asked for, so a screen's first images would load last.
        if ([self hasSize] && [self loadsDuringLayout]) {
            [self reloadImage];
        }
    } else if (![self switchSourceIfResized]) {
        [self reloadIfResized];
    }
}

- (void) setImageColor: (UIColor*)imageColor {
    _imageColor = imageColor;
    // A blurred image is a still image: show it with the new tint, without
    // blurring it again.
    if ([self blurs: self.originalImage]) {
        if (self.blurredImage) {
            [self showImage: self.blurredImage];
        }
        return;
    }
    // Re-apply to the original image, so the tint can change or be removed.
    UIImage* image = self.originalImage ?: super.image;
    if (image) {
        // SDAnimatedImageView ignores the image it already shows, which would
        // keep an animated image's frames as they were tinted.
        super.image = nil;
        [self setImage: image];
    }
}

- (void) setImage: (UIImage*)image {
    self.imageCount++;
    self.showsHash = image != nil && image == self.hashImage;
    self.showsPlaceholder = self.showsHash || (image != nil && image == _placeholder);
    if ([_imageRendering isEqualToString: @"pixelated"]) {
        // A source's placeholder is a blurred preview, scaled up smoothly
        // (pixelated is for the image).
        self.layer.magnificationFilter = self.showsHash ? kCAFilterLinear : kCAFilterNearest;
    }
    if ([self blurs: image]) {
        self.originalImage = image;
        self.blurredImage = nil;
        [self blurImage: image];
        return;
    }
    // Kept to tint it again.
    self.originalImage = image && self.imageColor ? image : nil;
    self.blurredImage = nil;
    self.blursOverNothing = NO;
    // The blur was removed before it was ready: the fade it was waiting for
    // happens now.
    if (self.fadesBlurredImage) {
        self.fadesBlurredImage = NO;
        [self fadeIn: ^{
            [self showImage: image];
        }];
    } else {
        [self showImage: image];
    }
}

// A vector image drawn into a bitmap, with its size in points, at a scale
// that's sharp at the size the view shows it (or its own size before the view
// has one).
- (UIImage*) rasterizedImage: (UIImage*)image {
    CGSize size = image.size;
    if (size.width <= 0 || size.height <= 0) {
        return image;
    }
    CGSize view = self.bounds.size;
    CGFloat shown = MAX(1, MAX(view.width / size.width, view.height / size.height));
    UIGraphicsImageRendererFormat* format = [UIGraphicsImageRendererFormat preferredFormat];
    format.scale = (self.window.screen.scale ?: [UIScreen mainScreen].scale) * shown;
    format.opaque = NO;
    UIGraphicsImageRenderer* renderer = [[UIGraphicsImageRenderer alloc] initWithSize: size format: format];
    return [renderer imageWithActions: ^(UIGraphicsImageRendererContext* context) {
        [image drawInRect: CGRectMake(0, 0, size.width, size.height)];
    }];
}

// Shows the image, tinted as React Native's Image does it: UIKit draws a
// template image in the view's tintColor, so no tinted copy of the image is
// made. SDAnimatedImageView draws the frames of an animated image itself,
// without the tint, so each frame is tinted as it's decoded (source-in, as the
// template is).
- (void) showImage: (UIImage*)image {
    UIColor* tint = image ? self.imageColor : nil;
    BOOL animated = [image conformsToProtocol: @protocol(SDAnimatedImage)] && [(id<SDAnimatedImage>)image animatedImageFrameCount] > 1;
    self.tintColor = tint;
    self.animationTransformer = tint && animated ? [SDImageTintTransformer transformerWithColor: tint] : nil;
    if (tint && animated) {
        BOOL changed = super.image != image;
        super.image = image;
        // Shows the first frame tinted now, also while paused (the player
        // only draws frames as it plays; until then the view draws the
        // untinted image).
        if (changed) {
            [self.player seekToFrameAtIndex: 0 loopCount: 0];
        }
    } else {
        if (tint) {
            if (!image.CGImage) {
                // A vector image (an SVG), which UIKit doesn't draw as a
                // template: drawn into a bitmap at the size it's shown at.
                image = [self rasterizedImage: image];
            }
            image = [image imageWithRenderingMode: UIImageRenderingModeAlwaysTemplate];
        }
        super.image = image;
    }
    [self updateContentMode];
}

- (void) setBlurRadius: (CGFloat)blurRadius {
    if (_blurRadius == blurRadius) {
        return;
    }
    _blurRadius = blurRadius;
    // Re-apply to the original image, so the blur can change or be removed.
    UIImage* image = self.originalImage ?: super.image;
    if (image) {
        [self setImage: image];
    }
}

// Whether the image is blurred: a loaded image, not the placeholder prop (as
// with React Native's Image, and on Android).
- (BOOL) blurs: (UIImage*)image {
    return _blurRadius > 0 && image && image != _placeholder && image != self.hashImage;
}

// Blurs the image off the main thread, and shows it (tinted as any image) unless
// another image was set meanwhile. Until then the view keeps showing what it
// showed: never the image without the blur. An animated image shows its first
// frame.
- (void) blurImage: (UIImage*)image {
    // Not laid out yet (an image from the memory cache is set before the
    // view's first layout): it's blurred for its size once it has one
    // (blurAgainIfResized), instead of twice.
    if (![self hasSize]) {
        self.blurredForSize = CGSizeZero;
        return;
    }
    CGFloat screenScale = self.window.screen.scale ?: [UIScreen mainScreen].scale;
    // How many pixels on screen a pixel of the image takes.
    CGFloat shownScale = [self shownScale: image] * screenScale / image.scale;
    // Blurred at the size it's shown at (a blurred image needs no more
    // detail), or at its own size if it's shown larger.
    CGFloat scale = MIN(shownScale, 1);
    // The radius in pixels of the image that's blurred.
    CGFloat radius = _blurRadius * screenScale * scale / shownScale;
    // Pixelated images are drawn larger without smoothing, so a smaller copy
    // would show its pixels.
    BOOL downscale = ![_imageRendering isEqualToString: @"pixelated"];
    NSUInteger count = self.imageCount;
    self.blurredForSize = self.bounds.size;
    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        UIImage* blurred = FFFBlurredImage(image, scale, radius, downscale);
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf showBlurredImage: blurred count: count];
        });
    });
}

- (void) showBlurredImage: (UIImage*)image count: (NSUInteger)count {
    if (self.imageCount == count) {
        self.blurredImage = image;
        self.blursOverNothing = NO;
        if (self.fadesBlurredImage) {
            self.fadesBlurredImage = NO;
            [self fadeIn: ^{
                [self showImage: image];
            }];
        } else {
            [self showImage: image];
        }
    }
}

// Points on screen per point of the image, for the view's size and
// objectFit, or 1 before the view has a size.
- (CGFloat) shownScale: (UIImage*)image {
    CGSize size = image.size;
    CGSize view = self.bounds.size;
    if (size.width <= 0 || size.height <= 0 || view.width <= 0 || view.height <= 0) {
        return 1;
    }
    CGFloat x = view.width / size.width;
    CGFloat y = view.height / size.height;
    switch (_objectFit) {
        case FFFObjectFitCover:
            return MAX(x, y);
        case FFFObjectFitContain:
            return MIN(x, y);
        case FFFObjectFitFill:
            return sqrt(x * y);
        case FFFObjectFitScaleDown:
            return MIN(MIN(x, y), 1);
        default:
            return 1;
    }
}

// The view's size changed a lot (by more than a fifth either way) since the
// image was blurred, which was for the size it was shown at then: blur it
// again for the new size.
- (void) blurAgainIfResized {
    if (![self blurs: self.originalImage] || ![self hasSize]) {
        return;
    }
    CGSize view = self.bounds.size;
    CGSize blurred = self.blurredForSize;
    if (blurred.width > 0 && blurred.height > 0 &&
        view.width <= blurred.width * 1.2 && blurred.width <= view.width * 1.2 &&
        view.height <= blurred.height * 1.2 && blurred.height <= view.height * 1.2) {
        return;
    }
    [self setImage: self.originalImage];
}

// The image (its first frame, for an animated image) drawn at scale times its
// size in pixels, and blurred as React Native's Image blurs on iOS: three box
// blurs, close to a Gaussian blur, with the box size worked out from the
// radius (in pixels) as the SVG spec describes and halved, as React Native
// does. A large box blurs a copy 2, 4 or 8 times smaller instead, with a box
// that much smaller, of at least 11 pixels: away from the edges that matches
// blurring at full size within a few levels of 255 (about as much as a
// slightly different radius changes it), for a quarter to a sixty-fourth of
// the work. It keeps the image's size in points.
static UIImage* FFFBlurredImage(UIImage* image, CGFloat scale, CGFloat radius, BOOL downscale)
{
    if (image.size.width <= 0 || image.size.height <= 0) {
        return image;
    }
    // Blurred in standard range (the bitmap below has 8 bits per channel): an
    // HDR image (dynamicRangeLimit) tone mapped to it, rather than its
    // highlights clipped.
    if (@available(iOS 17.0, tvOS 17.0, *)) {
        if (image.isHighDynamicRange) {
            image = [image imageRestrictedToStandardDynamicRange];
        }
    }
    double fullWidth = MAX(1, round(image.size.width * image.scale * scale));
    double fullHeight = MAX(1, round(image.size.height * image.scale * scale));
    // At most the image's larger side (a larger box looks the same, and an
    // absurd radius would overflow).
    double box = MIN(floor((radius * 3 * sqrt(2 * M_PI) / 4 + 0.5) / 2), MAX(fullWidth, fullHeight));
    double factor = !downscale ? 1 : box >= 88 ? 8 : box >= 44 ? 4 : box >= 22 ? 2 : 1;
    size_t width = MAX(1, (size_t) round(fullWidth / factor));
    size_t height = MAX(1, (size_t) round(fullHeight / factor));
    // Odd, so it's centered.
    uint32_t boxSize = factor == 1 ? (uint32_t) box | 1 : (uint32_t) round((box / factor - 1) / 2) * 2 + 1;
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(NULL, width, height, 8, 0, colorSpace,
                                                 (CGBitmapInfo)kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Host);
    CGColorSpaceRelease(colorSpace);
    if (!context) {
        return image;
    }
    // Drawn as UIKit draws (top-left origin), so it follows the image's
    // orientation.
    CGContextTranslateCTM(context, 0, height);
    CGContextScaleCTM(context, 1, -1);
    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    UIGraphicsPushContext(context);
    [image drawInRect: CGRectMake(0, 0, width, height)];
    UIGraphicsPopContext();

    FFFBoxBlur(context, boxSize);

    CGImageRef cgImage = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    if (!cgImage) {
        return image;
    }
    // The same size in points, also when it's smaller.
    UIImage* blurred = [UIImage imageWithCGImage: cgImage scale: width / image.size.width orientation: UIImageOrientationUp];
    CGImageRelease(cgImage);
    return blurred;
}

// The error's description, with the HTTP status code when there is one (as on
// Android): SDWebImage keeps the code out of the description. Also for preload
// results.
NSString *FFFErrorMessage(NSError *error)
{
    NSNumber *statusCode = error.userInfo[SDWebImageErrorDownloadStatusCodeKey];
    if (statusCode) {
        return [NSString stringWithFormat: @"%@, status code: %@", error.localizedDescription, statusCode];
    }
    return error.localizedDescription ?: @"Failed to load the image";
}

- (void) sendOnError: (nullable NSString*)message {
    self.hasErrored = YES;
    self.onErrorEvent = @{ @"error": message ?: @"Failed to load the image" };
    if (self.onFastImageError) {
        self.onFastImageError(self.onErrorEvent);
    }
}

- (void) sendOnLoad: (UIImage*)image {
    // The full image's size, also when it was decoded smaller.
    // A photo library image's own size (it's decoded at about the view's
    // size), looked up when it loaded.
    CGSize size = [_source isPhotoLibrary] ? [_source photoPixelSize] : [FFFDownsampledImage sourceSizeOfImage: image];
    if (CGSizeEqualToSize(size, CGSizeZero)) {
        size = image.size;
    }
    self.onLoadEvent = @{
            @"width": [NSNumber numberWithDouble: size.width],
            @"height": [NSNumber numberWithDouble: size.height]
    };
    if (self.onFastImageLoad) {
        self.onFastImageLoad(self.onLoadEvent);
    }
}

// onLoadEnd's event: the load's result, as onLoad or onError sent it (ok: its
// size, or not ok: the error).
- (NSDictionary*) loadEndEvent: (BOOL)ok {
    NSMutableDictionary* event = [NSMutableDictionary dictionaryWithDictionary: (ok ? self.onLoadEvent : self.onErrorEvent) ?: @{}];
    event[@"ok"] = @(ok);
    return event;
}

- (void) setSource: (FFFastImageSource*)source {
    if (self.propSource != source) {
        self.propSource = source;
        if (![self picksSource]) {
            _source = source;
        }
        _needsReload = YES;
    }
}

- (void) setSources: (NSArray<FFFastImageSource*>*)sources {
    if (_sources != sources) {
        _sources = [sources copy];
        if (![self picksSource]) {
            _source = self.propSource;
        }
        _needsReload = YES;
    }
}

// Whether the view picks one of several sources for its size.
- (BOOL) picksSource {
    return _sources.count > 1;
}

// Of several sources, the one whose size in pixels is closest to the view's
// (by pixel count), or the largest while the view has no size (e.g. one sized
// from onLoad).
- (FFFastImageSource*) sourceForSize {
    CGFloat scale = self.window.screen.scale ?: [UIScreen mainScreen].scale;
    CGFloat viewPixels = self.bounds.size.width * self.bounds.size.height * scale * scale;
    FFFastImageSource* best = nil;
    CGFloat bestFit = CGFLOAT_MAX;
    for (FFFastImageSource* source in _sources) {
        CGFloat fit = viewPixels > 0 ? ABS(1 - source.pixelCount / viewPixels) : -source.pixelCount;
        if (!best || fit < bestFit) {
            best = source;
            bestFit = fit;
        }
    }
    return best;
}

// Several sources: another one fits the view's new size better. Loads it,
// keeping the image showing until then, without a fade (see switchesSource).
- (BOOL) switchSourceIfResized {
    if (![self picksSource] || _needsReload || ![self hasSize] || [self sourceForSize] == _source) {
        return NO;
    }
    self.switchesSource = YES;
    [self reloadImage];
    return YES;
}

- (void) setRecyclingKey: (NSString*)recyclingKey {
    if (_recyclingKey == recyclingKey || [_recyclingKey isEqualToString: recyclingKey]) {
        return;
    }
    BOOL changed = _recyclingKey != nil;
    _recyclingKey = [recyclingKey copy];
    if (changed) {
        // The view shows other content now: don't keep the current image
        // while the next one loads (reloadImage clears it), even if the
        // source is the same, nor a fade from it.
        self.showsLoadedImage = NO;
        [self.layer removeAllAnimations];
        [self.superview.layer removeAnimationForKey: kCATransition];
        _needsReload = YES;
    }
}

- (void) setDynamicRangeLimit: (NSString*)dynamicRangeLimit {
    if (_dynamicRangeLimit == dynamicRangeLimit || [_dynamicRangeLimit isEqualToString: dynamicRangeLimit]) {
        return;
    }
    BOOL decodedToHDR = [self decodesToHDR];
    _dynamicRangeLimit = [dynamicRangeLimit copy];
    if (@available(iOS 17.0, tvOS 17.0, *)) {
        // Constrained: the highlights brighter than SDR white, but not as
        // bright as the display can go, as Apple suggests for images among
        // other content.
        self.preferredImageDynamicRange = [_dynamicRangeLimit isEqualToString: @"no-limit"] ? UIImageDynamicRangeHigh
            : [_dynamicRangeLimit isEqualToString: @"constrained"] ? UIImageDynamicRangeConstrainedHigh
            : [_dynamicRangeLimit isEqualToString: @"standard"] ? UIImageDynamicRangeStandard
            : UIImageDynamicRangeUnspecified;
    }
    // Decoded again only to switch between HDR and SDR.
    if ([self decodesToHDR] != decodedToHDR) {
        self.needsDynamicRangeReload = YES;
    }
}

// Whether HDR images are decoded to HDR (dynamicRangeLimit constrained or
// no-limit), rather than to SDR, their standard range version.
- (BOOL) decodesToHDR {
    return [_dynamicRangeLimit isEqualToString: @"constrained"] || [_dynamicRangeLimit isEqualToString: @"no-limit"];
}

- (void) setPlaceholder: (UIImage*)placeholder {
    if (_placeholder != placeholder) {
        _placeholder = placeholder;
        _needsReload = YES;
    }
}

- (void) setSourcePlaceholders: (NSArray<NSString*>*)sourcePlaceholders {
    _sourcePlaceholders = [sourcePlaceholders copy];
    [self updateHashImage];
}

// What shows while the image loads and if it fails: the picked source's
// placeholder (its ThumbHash or blurDataUri), or the placeholder prop.
- (UIImage*) shownPlaceholder {
    return self.hashImage ?: _placeholder;
}

// The picked source's ThumbHash or blurDataUri, or nil.
- (NSString*) pickedSourcePlaceholder {
    NSUInteger index = 0;
    if ([self picksSource]) {
        index = _source ? [_sources indexOfObjectIdenticalTo: _source] : NSNotFound;
    }
    NSString* hash = index < _sourcePlaceholders.count ? _sourcePlaceholders[index] : nil;
    return hash.length > 0 ? hash : nil;
}

// Decodes the picked source's placeholder. A view showing the previous
// placeholder shows the new one at once, without loading the image again.
- (void) updateHashImage {
    NSString* hash = [self pickedSourcePlaceholder];
    if (hash == self.hashImageKey || [hash isEqualToString: self.hashImageKey]) {
        return;
    }
    UIImage* previous = [self shownPlaceholder];
    BOOL showing = self.showsPlaceholder;
    self.hashImageKey = hash;
    self.hashImage = [FFFThumbHash imageForPlaceholder: hash];
    UIImage* placeholder = [self shownPlaceholder];
    if (showing && placeholder != previous) {
        [self setImage: placeholder];
    }
}

- (void) didSetProps {
    if (_needsReload) {
        // With downsample on, the image is decoded for the view's size, and
        // with several sources one is picked for it, so a view that hasn't
        // been laid out yet loads once it has. Props and layout are applied
        // in the same update, so that's here, just after it, or before the
        // next frame (layoutSubviews) for an image in the memory cache. A
        // view that still has no size then (e.g. one sized from onLoad) loads
        // at full size, or the largest source.
        if (([self downsamples] || [self picksSource]) && ![self hasSize]) {
            if (!self.waitsForSize) {
                self.waitsForSize = YES;
                __weak typeof(self) weakSelf = self;
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (weakSelf.waitsForSize) {
                        [weakSelf reloadImage];
                    }
                });
            }
            return;
        }
        [self reloadImage];
    } else if (self.needsDynamicRangeReload) {
        [self reloadForDynamicRange];
    } else {
        [self reloadIfResized];
    }
}

// The same image decoded again for a dynamicRangeLimit between HDR and SDR,
// as a resize is (reloadIfResized): without events once it has loaded, and
// the image showing stays if the load fails. A display setting shouldn't
// look like a new load.
- (void) reloadForDynamicRange {
    self.needsDynamicRangeReload = NO;
    // Nothing to load, it failed, or it waits for the view's size: the next
    // load decodes as asked.
    if (!_source || self.hasErrored || self.waitsForSize) {
        return;
    }
    // A data uri is decoded at once, with its events (see reloadImage).
    if ([[_source.url absoluteString] hasPrefix: @"data:image"]) {
        [self reloadImage];
        return;
    }
    SDWebImageOptions options = [self loadOptions];
    if (self.showsLoadedImage) {
        options |= SDWebImageDelayPlaceholder;
    }
    [self downloadImage: _source options: options context: [self loadContext] events: !self.hasCompleted];
}

// Whether images are decoded at about the view's size (downsample, and always
// for photo library images, which are large and usually shown small: Photos
// makes them at the size asked for). Not for `none`, which shows it at its own
// size.
- (BOOL) downsamples {
    if (_objectFit == FFFObjectFitNone) {
        return NO;
    }
    return [_source isPhotoLibrary] || _downsample;
}

// Whether the view has been laid out with an area. One that's 0 wide or tall
// (e.g. sized from onLoad) has no size to decode the image for.
- (BOOL) hasSize {
    return self.bounds.size.width > 0 && self.bounds.size.height > 0;
}

// The size in pixels to decode the image for, or zero for full size.
- (CGSize) decodeBox {
    if (![self downsamples] || ![self hasSize]) {
        return CGSizeZero;
    }
    CGFloat scale = self.window.screen.scale ?: [UIScreen mainScreen].scale;
    CGSize size = self.bounds.size;
    return CGSizeMake(ceil(size.width * scale), ceil(size.height * scale));
}

// Whether the image has to cover the box, rather than fit in it.
- (BOOL) decodeCovers {
    return _objectFit == FFFObjectFitCover || _objectFit == FFFObjectFitFill;
}

// The view grew (by more than a fifth, as React Native's Image reloads), or
// now needs a covering or full-size image: loads the image again for its
// size, keeping the current one until then. It comes from the disk cache
// (the downloaded file is kept there whatever size it's decoded at).
- (void) reloadIfResized {
    if (!_source || _needsReload || self.hasErrored || CGSizeEqualToSize(self.decodedBox, CGSizeZero)) {
        return;
    }
    // Already at full size (it's no larger than the view it was decoded for).
    UIImage* image = self.originalImage ?: super.image;
    if (self.hasCompleted && CGSizeEqualToSize(image.size, [FFFDownsampledImage sourceSizeOfImage: image])) {
        return;
    }
    CGSize box = [self decodeBox];
    BOOL cover = [self decodeCovers];
    if ([self downsamples]) {
        if (![self hasSize]) {
            return;
        }
        BOOL grew = box.width > self.decodedBox.width * 1.2 || box.height > self.decodedBox.height * 1.2;
        if (!grew && (self.decodedCover || !cover)) {
            return;
        }
    }
    SDWebImageOptions options = [self loadOptions];
    if (self.showsLoadedImage) {
        options |= SDWebImageDelayPlaceholder;
    }
    // Without events once it has loaded: it's the same image. If it's still
    // loading, it restarts for the new size, and sends its events as usual.
    BOOL events = !self.hasCompleted;
    [self downloadImage: _source options: options context: [self loadContext] events: events];
}

- (void) reloadImage {
    _needsReload = NO;
    self.needsDynamicRangeReload = NO;
    self.waitsForSize = NO;
    self.loadsSwitchedSource = self.switchesSource;
    self.switchesSource = NO;
    if ([self picksSource]) {
        _source = [self sourceForSize];
    }
    [self updateHashImage];
    self.decodedBox = CGSizeZero;
    // The previous load, if it's still running, is for a source the view no
    // longer shows: cancel it (a new download would, but a data uri or no
    // source doesn't start one), and ignore what it still sends (SDWebImage
    // completes a cancelled load with an error; see downloadImage:).
    self.loadCount++;
    [self sd_cancelLatestImageLoad];

    if (_source) {
        // Load base64 images.
        NSString* url = [_source.url absoluteString];
        if (url && [url hasPrefix: @"data:image"]) {
            if (self.onFastImageLoadStart) {
                self.onFastImageLoadStart(@{});
            }
            // Use SDWebImage API to support external format like WebP images
            // (as sd_imageWithData does), decoded to HDR or SDR as a
            // download is (see contextForSource).
            UIImage* image = [[SDImageCodersManager sharedManager] decodedImageWithData: [NSData dataWithContentsOfURL: _source.url] options: @{
                SDImageCoderDecodeScaleFactor: @1,
                SDImageCoderDecodeToHDR: @([self decodesToHDR]),
            }];
            if (!image) {
                // Not decodable: fail like a remote image, showing the
                // placeholder.
                [self setImage: [self shownPlaceholder]];
                self.showsLoadedImage = NO;
                [self sendOnError: @"Failed to decode the image"];
                if (self.onFastImageLoadEnd) {
                    self.onFastImageLoadEnd([self loadEndEvent: NO]);
                }
                return;
            }
            [self showLoadedImage: image fade: [self fadesImageFromCache: SDImageCacheTypeNone]];
            if (self.onFastImageProgress) {
                self.onFastImageProgress(@{
                        @"loaded": @(1),
                        @"total": @(1),
                        @"progress": @(1)
                });
            }
            self.hasCompleted = YES;
            self.showsLoadedImage = YES;
            [self sendOnLoad: image];

            if (self.onFastImageLoadEnd) {
                self.onFastImageLoadEnd([self loadEndEvent: YES]);
            }
            return;
        }

        SDWebImageOptions options = [self loadOptions];

        // Keep showing the loaded image until the new one has loaded, instead
        // of clearing it to the placeholder prop (or nothing) while it loads,
        // which flashed (#747). The placeholder prop shows if the new image
        // fails. As React Native's Image does; a `key` that changes starts from
        // blank instead.
        if (self.showsLoadedImage) {
            options |= SDWebImageDelayPlaceholder;
        }

        if (self.onFastImageLoadStart) {
            self.onFastImageLoadStart(@{});
        }
        self.hasCompleted = NO;
        self.hasErrored = NO;
        self.retriedAfterBackground = NO;
        [self stopWaitingForActive];

        [self downloadImage: _source options: options context: [self loadContext] events: YES];
    } else if ([self shownPlaceholder]) {
        [self setImage: [self shownPlaceholder]];
        self.showsLoadedImage = NO;
    }
}

- (SDWebImageOptions) loadOptions {
    SDWebImageOptions options = SDWebImageRetryFailed | SDWebImageHandleCookies;
    switch (_source.priority) {
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

    return options | [_source cacheOptions];
}

// Headers, and the size to decode at (see FFFDownsampledImage), which it
// records as decodedBox.
- (SDWebImageContext*) loadContext {
    CGSize box = [self decodeBox];
    self.decodedBox = box;
    self.decodedCover = [self decodeCovers];
    return [self contextForSource: _source box: box cover: self.decodedCover];
}

// Whether the view loads as it's laid out, so its image shows in this frame:
// one in the memory cache, where SDWebImage finds it as the load starts, or one
// that isn't downloaded (no source, which shows the placeholder prop, or a data
// uri). Also when that can't be told (an app's own image cache), as before.
- (BOOL) loadsDuringLayout {
    FFFastImageSource* source = [self picksSource] ? [self sourceForSize] : _source;
    if (!source.url || [source.url.scheme isEqualToString: @"data"]) {
        return YES;
    }
    if (!source.memoryCache) {
        return NO;
    }
    SDWebImageManager* manager = [SDWebImageManager sharedManager];
    if (![manager.imageCache isKindOfClass: [SDImageCache class]]) {
        return YES;
    }
    CGSize box = [self decodeBox];
    SDWebImageContext* context = [self contextForSource: source box: box cover: [self decodeCovers]];
    NSString* key = [manager cacheKeyForURL: source.url context: context];
    return [(SDImageCache*) manager.imageCache imageFromMemoryCacheForKey: key] != nil;
}

- (SDWebImageContext*) contextForSource: (FFFastImageSource*)source box: (CGSize)box cover: (BOOL)cover {
    SDWebImageMutableContext* context = [NSMutableDictionary dictionary];
    context[SDWebImageContextDownloadRequestModifier] = source.requestModifier;
    context[SDWebImageContextImageLoader] = source.imageLoader;
    context[SDWebImageContextCacheKeyFilter] = source.cacheKeyFilter;
    if (@available(iOS 17.0, tvOS 17.0, *)) {
        // An HDR image (e.g. a photo with a gain map) decoded to HDR, or to
        // SDR, its standard range version.
        context[SDWebImageContextImageDecodeToHDR] = @([self decodesToHDR]);
    }
    if (CGSizeEqualToSize(box, CGSizeZero)) {
        [FFFDownsampledImage addFullSizeToContext: context];
        [self applyCacheOptions: context source: source fullSize: YES];
        [FFFDownsampledImage forgetUnusableImageForURL: source.url context: context];
        return context;
    }
    [FFFDownsampledImage addToContext: context box: box cover: cover];
    if ([source isPhotoLibrary]) {
        // Photos makes the photo at the size asked for, with no file
        // downloaded: SDWebImage would keep this smaller copy on disk as the
        // photo's original, and a larger view would get it from there.
        context[SDWebImageContextOriginalStoreCacheType] = @(SDImageCacheTypeNone);
        context[SDWebImageContextOriginalQueryCacheType] = @(SDImageCacheTypeNone);
    }
    [self applyCacheOptions: context source: source fullSize: NO];
    [FFFDownsampledImage forgetUnusableImageForURL: source.url context: context];
    return context;
}

// The source's memoryCache and diskCache: which caches the image is looked up
// in and kept in. fullSize: the image is decoded at its own size, rather than
// smaller (addToContext keeps those in memory only, as the disk cache has the
// downloaded file).
- (void) applyCacheOptions: (SDWebImageMutableContext*)context source: (FFFastImageSource*)source fullSize: (BOOL)fullSize {
    if (!source.diskCache) {
        // Neither the downloaded file (the original, for a smaller decode)
        // nor the decoded image is read from or written to the disk cache. A
        // `web` one isn't kept in memory either, as on Android: it's
        // downloaded every time it loads.
        SDImageCacheType memory = source.memoryCache && source.cacheControl != FFFCacheControlWeb
            ? SDImageCacheTypeMemory
            : SDImageCacheTypeNone;
        context[SDWebImageContextStoreCacheType] = @(memory);
        context[SDWebImageContextQueryCacheType] = @(memory);
        context[SDWebImageContextOriginalStoreCacheType] = @(SDImageCacheTypeNone);
        context[SDWebImageContextOriginalQueryCacheType] = @(SDImageCacheTypeNone);
        return;
    }
    if (!source.memoryCache) {
        // Only on disk, also when it comes from there. A smaller copy is
        // only kept in memory, so it isn't kept (the downloaded file is still
        // on disk).
        context[SDWebImageContextStoreCacheType] = @(fullSize ? SDImageCacheTypeDisk : SDImageCacheTypeNone);
    }
}

// events: NO for a quiet reload at a new size (see reloadIfResized), which
// sends no events and keeps the current image if it fails.
- (void) downloadImage: (FFFastImageSource*)source options: (SDWebImageOptions)options context: (SDWebImageContext*)context events: (BOOL)events {
    __weak typeof(self) weakSelf = self; // Always use a weak reference to self in blocks
    NSUInteger load = ++self.loadCount;
    // Most images have no onProgress, so only ask SDWebImage for progress when
    // there's a handler as the load starts. A handler added while loading is
    // used from the next load.
    SDImageLoaderProgressBlock progress = nil;
    if (events && self.trackProgress && self.onFastImageProgress) {
        progress = ^(NSInteger receivedSize, NSInteger expectedSize, NSURL* _Nullable targetURL) {
            // Without a Content-Length the total is unknown (-1 or 0), and a
            // percentage can't be worked out from it, so don't send those.
            if (expectedSize <= 0) {
                return;
            }
            // SDWebImage calls this on its download queue, while React Native
            // sets onFastImageProgress (and deallocates the view) on the main
            // queue. Read and call it there, so it can't change or be released
            // in between (EXC_BAD_ACCESS).
            dispatch_async(dispatch_get_main_queue(), ^{
                // Sent before the load was cancelled (the source changed) but
                // run after: it's not the current load's progress.
                if (weakSelf.loadCount != load) {
                    return;
                }
                RCTDirectEventBlock onProgress = weakSelf.onFastImageProgress;
                if (onProgress) {
                    onProgress(@{
                            @"loaded": @(receivedSize),
                            @"total": @(expectedSize),
                            @"progress": @(MAX(0.0, MIN(1.0, (double)receivedSize / expectedSize)))
                    });
                }
            });
        };
    }
    CFTimeInterval startedAt = CACurrentMediaTime();
    NSURL* url = source.url;
    if (!events) {
        // Only this load's image: SDWebImage would clear the view (to the
        // placeholder) if it fails, and a cancelled load can still complete.
        SDSetImageBlock setImage = ^(UIImage* _Nullable image, NSData* _Nullable data, SDImageCacheType cacheType, NSURL* _Nullable imageURL) {
            if (image && weakSelf.loadCount == load) {
                weakSelf.image = image;
            }
        };
        [self sd_internalSetImageWithURL: url
                        placeholderImage: nil
                                 options: options
                                 context: context
                           setImageBlock: setImage
                                progress: nil
                               completed: ^(UIImage* _Nullable image, NSData* _Nullable data, NSError* _Nullable error, SDImageCacheType cacheType, BOOL finished, NSURL* _Nullable imageURL) {
            if (error) {
                [source forgetResponseAfterError: error];
            }
            if (error && weakSelf.loadCount == load) {
                // Keeps the image it has, without trying again on every
                // layout (e.g. while offline).
                weakSelf.decodedBox = CGSizeZero;
            }
        }];
        return;
    }
    // Like SDAnimatedImageView's sd_setImageWithURL, which sets the image
    // class to SDAnimatedImage (loadContext sets it). Only while this is the
    // current load: SDWebImage sets the placeholder when a load it cancelled
    // completes, which could replace a newer image.
    UIImage* placeholder = [self shownPlaceholder];
    SDSetImageBlock setImage = ^(UIImage* _Nullable image, NSData* _Nullable data, SDImageCacheType cacheType, NSURL* _Nullable imageURL) {
        if (weakSelf.loadCount != load) {
            return;
        }
        // The loaded image, not the placeholder prop (shown while it loads, or
        // if it fails).
        BOOL loaded = image && image != placeholder;
        [weakSelf showLoadedImage: image fade: loaded && [weakSelf fadesImageFromCache: cacheType]];
    };
    [self sd_internalSetImageWithURL: url
                    placeholderImage: placeholder
                             options: options
                             context: context
                       setImageBlock: setImage
                            progress: progress
                           completed: ^(UIImage* _Nullable image,
                    NSData* _Nullable data,
                    NSError* _Nullable error,
                    SDImageCacheType cacheType,
                    BOOL finished,
                    NSURL* _Nullable imageURL) {
                if (error) {
                    [source forgetResponseAfterError: error];
                }
                // Replaced by another load (a new source, or the same one
                // restarted for a new size), which sends the events. This
                // one was cancelled, which SDWebImage reports as an error.
                if (weakSelf.loadCount != load) {
                    return;
                }
                // cacheOnly: SDWebImage completes the load of an image that
                // isn't cached with neither an image nor an error.
                if (!error && !image) {
                    error = [NSError errorWithDomain: @"FastImage"
                                                code: 0
                                            userInfo: @{NSLocalizedDescriptionKey: @"Not in the cache"}];
                }
                // The download was running when the app went to the
                // background, and failed: iOS suspends it there, and its
                // timeout keeps counting, so it times out as the app comes
                // back (NSURLErrorTimedOut), or loses its connection. Load it
                // again once the app is active, as Android does (#758).
                if (error && [error.domain isEqualToString: NSURLErrorDomain] &&
                    FFFEnteredBackgroundAt > startedAt && !weakSelf.retriedAfterBackground &&
                    weakSelf.source == source) {
                    weakSelf.retriedAfterBackground = YES;
                    [weakSelf downloadWhenActive: source options: options context: context];
                    return;
                }
                if (error) {
                    // SDWebImage shows the placeholder the load started with
                    // (the placeholder prop, a source's, or nothing): the
                    // current one if the source's changed since.
                    UIImage* current = [weakSelf shownPlaceholder];
                    if (current != placeholder) {
                        [weakSelf setImage: current];
                    }
                    weakSelf.showsLoadedImage = NO;
                    [weakSelf sendOnError: [source errorMessage: error]];
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd([weakSelf loadEndEvent: NO]);
                    }
                } else {
                    weakSelf.hasCompleted = YES;
                    weakSelf.showsLoadedImage = YES;
                    [weakSelf sendOnLoad: image];
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd([weakSelf loadEndEvent: YES]);
                    }
                }
            }];
}

// Downloads the source now if the app is active, or once it is (unless
// another load started meanwhile).
- (void) downloadWhenActive: (FFFastImageSource*)source options: (SDWebImageOptions)options context: (SDWebImageContext*)context {
    // nil in app extensions, which don't get these notifications.
    UIApplication* application = RCTSharedApplication();
    if (!application || application.applicationState == UIApplicationStateActive) {
        [self downloadImage: source options: options context: context events: YES];
        return;
    }
    [self stopWaitingForActive];
    __weak typeof(self) weakSelf = self;
    self.activeObserver = [[NSNotificationCenter defaultCenter] addObserverForName: UIApplicationDidBecomeActiveNotification
                                                                            object: nil
                                                                             queue: [NSOperationQueue mainQueue]
                                                                        usingBlock: ^(NSNotification* notification) {
        [weakSelf stopWaitingForActive];
        if (weakSelf.source == source) {
            [weakSelf downloadImage: source options: options context: context events: YES];
        }
    }];
}

- (void) stopWaitingForActive {
    if (self.activeObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver: self.activeObserver];
        self.activeObserver = nil;
    }
}

- (void) stop {
    self.onFastImageLoadStart = nil;
    self.onFastImageProgress = nil;
    self.onFastImageLoad = nil;
    self.onFastImageError = nil;
    self.onFastImageLoadEnd = nil;
    // As a new load does (see reloadImage): a completion still on its way is
    // ignored, and a load waiting for the view's size doesn't start.
    self.loadCount++;
    self.waitsForSize = NO;
    [self stopWaitingForActive];
    [self sd_cancelLatestImageLoad];
}

- (void) dealloc {
    [self stopWaitingForActive];
    [self sd_cancelLatestImageLoad];
}

@end
