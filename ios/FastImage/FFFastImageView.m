#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>
#import <React/RCTUtils.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDImageTransformer.h>
#import "FFFDownsampledImage.h"
#import <Accelerate/Accelerate.h>

@interface FFFastImageView ()

@property(nonatomic, assign) BOOL hasSentOnLoadStart;
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
// The view's size when the image showing was tiled (resizeMode repeat).
@property(nonatomic, assign) CGSize tiledForSize;
// The blurred image showing (untinted), so a tint change can re-show it.
@property(nonatomic, strong) UIImage* blurredImage;
// The image being blurred fades in once it's blurred (transition).
@property(nonatomic, assign) BOOL fadesBlurredImage;
// The image being blurred is the first loaded one the view shows: until it's
// blurred, the view shows no loaded image (nothing, or defaultSource).
@property(nonatomic, assign) BOOL blursOverNothing;
// Whether the current load was already restarted after the app came back
// from the background (see downloadImage:).
@property(nonatomic, assign) BOOL retriedAfterBackground;
// Waits for the app to be active again, to restart a load.
@property(nonatomic, strong) id activeObserver;
// Whether the view shows an image that loaded (not defaultSource or nothing).
// A new source then keeps it until the new image has loaded (see reloadImage).
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

@end

// When the app last went to the background (CACurrentMediaTime), or 0.
static CFTimeInterval FFFEnteredBackgroundAt = 0;

static UIImage* FFFBlurredImage(UIImage* image, CGFloat scale, CGFloat radius, BOOL downscale);

@implementation FFFastImageView

+ (void) initialize {
    if (self != [FFFastImageView class]) {
        return;
    }
    [[NSNotificationCenter defaultCenter] addObserverForName: UIApplicationDidEnterBackgroundNotification
                                                      object: nil
                                                       queue: [NSOperationQueue mainQueue]
                                                  usingBlock: ^(NSNotification* notification) {
        FFFEnteredBackgroundAt = CACurrentMediaTime();
    }];
}

- (id) init {
    self = [super init];
    self.resizeMode = RCTResizeModeCover;
    self.clipsToBounds = YES;
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
    [UIView transitionWithView: self
                      duration: self.transitionDuration / 1000
                       options: UIViewAnimationOptionTransitionCrossDissolve | UIViewAnimationOptionAllowUserInteraction
                    animations: change
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

- (void) setResizeMode: (RCTResizeMode)resizeMode {
    if (_resizeMode != resizeMode) {
        BOOL repeated = _resizeMode == RCTResizeModeRepeat;
        _resizeMode = resizeMode;
        [self updateContentMode];
        // The blur is made for the size the image is shown at, and repeat
        // shows the image tiled: show it again.
        UIImage* image = self.originalImage ?: super.image;
        if ([self blurs: self.originalImage] || ((repeated || resizeMode == RCTResizeModeRepeat) && image)) {
            [self setImage: image];
        }
    }
}

// The content mode for resizeMode. `center` scales an image larger than the
// view down to fit, as React Native's Image and Android do (#866); only a
// smaller one is shown at its own size. UIViewContentModeCenter alone showed
// large images at full size, cropped. So it depends on the image and the
// view's size.
- (void) updateContentMode {
    UIViewContentMode contentMode = (UIViewContentMode) _resizeMode;
    if (_resizeMode == RCTResizeModeRepeat) {
        // The tiled image (see tiledImage:) fills the view.
        contentMode = UIViewContentModeScaleToFill;
    } else if (_resizeMode == RCTResizeModeCenter) {
        CGSize imageSize = super.image.size;
        CGSize viewSize = self.bounds.size;
        if (imageSize.width > viewSize.width || imageSize.height > viewSize.height) {
            contentMode = UIViewContentModeScaleAspectFit;
        }
    }
    if (self.contentMode != contentMode) {
        self.contentMode = contentMode;
    }
}

- (void) layoutSubviews {
    [super layoutSubviews];
    [self updateContentMode];
    [self blurAgainIfResized];
    [self tileAgainIfResized];
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

- (void) setOnFastImageLoadEnd: (RCTDirectEventBlock)onFastImageLoadEnd {
    _onFastImageLoadEnd = onFastImageLoadEnd;
    if (self.hasCompleted && _onFastImageLoadEnd) {
        _onFastImageLoadEnd([self loadEndEvent: YES]);
    }
}

- (void) setOnFastImageLoad: (RCTDirectEventBlock)onFastImageLoad {
    _onFastImageLoad = onFastImageLoad;
    if (self.hasCompleted && _onFastImageLoad) {
        _onFastImageLoad(self.onLoadEvent);
    }
}

- (void) setOnFastImageError: (RCTDirectEventBlock)onFastImageError {
    _onFastImageError = onFastImageError;
    if (self.hasErrored && _onFastImageError) {
        _onFastImageError(self.onErrorEvent);
    }
}

- (void) setOnFastImageLoadStart: (RCTDirectEventBlock)onFastImageLoadStart {
    // Send it for a load that has already started. When a reload is pending
    // (e.g. source set in the same update), reloadImage sends it.
    if (_source && !_needsReload && !self.hasSentOnLoadStart && onFastImageLoadStart) {
        _onFastImageLoadStart = onFastImageLoadStart;
        onFastImageLoadStart(@{});
        self.hasSentOnLoadStart = YES;
    } else {
        _onFastImageLoadStart = onFastImageLoadStart;
        self.hasSentOnLoadStart = NO;
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

// Whether SDAnimatedImageView can tint the frames of an animated image as
// they're decoded (animationTransformer, SDWebImage 5.20+).
- (BOOL) tintsFrames {
    return [self respondsToSelector: @selector(setAnimationTransformer:)];
}

- (void) setImage: (UIImage*)image {
    self.imageCount++;
    if ([self blurs: image]) {
        self.originalImage = image;
        self.blurredImage = nil;
        [self blurImage: image];
        return;
    }
    // Kept to tint, or tile (resizeMode repeat), it again.
    self.originalImage = image && (self.imageColor || _resizeMode == RCTResizeModeRepeat) ? image : nil;
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
// template is), or, before SDWebImage 5.20, the first frame shows.
- (void) showImage: (UIImage*)image {
    UIColor* tint = image ? self.imageColor : nil;
    // resizeMode repeat tiles an animated image's first frame (tiledImage:).
    BOOL repeats = image && _resizeMode == RCTResizeModeRepeat;
    BOOL animated = !repeats && [image conformsToProtocol: @protocol(SDAnimatedImage)] && [(id<SDAnimatedImage>)image animatedImageFrameCount] > 1;
    self.tintColor = tint;
    if ([self tintsFrames]) {
        [self setValue: tint && animated ? [SDImageTintTransformer transformerWithColor: tint] : nil forKey: @"animationTransformer"];
    }
    if (tint && animated && [self tintsFrames]) {
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
            if (animated) {
                image = [UIImage imageWithCGImage: image.CGImage scale: image.scale orientation: image.imageOrientation];
            } else if (!image.CGImage && !repeats) {
                // A vector image (an SVG), which UIKit doesn't draw as a
                // template: drawn into a bitmap at the size it's shown at
                // (tiledImage: draws one for repeat).
                image = [self rasterizedImage: image];
            }
            image = [image imageWithRenderingMode: UIImageRenderingModeAlwaysTemplate];
        }
        if (repeats) {
            image = [self tiledImage: image];
            self.tiledForSize = self.bounds.size;
        }
        super.image = image;
    }
    [self updateContentMode];
}

// resizeMode repeat: the image repeated from the top-left at its own size in
// pixels (a scaled image, e.g. a bundled @3x one, at its size in points), an
// animated image's first frame, scaled down to fit the view if it's larger,
// as React Native's Image does (and Android here).
- (UIImage*) tiledImage: (UIImage*)image {
    if (!image.CGImage && image.size.width > 0 && image.size.height > 0) {
        // A vector image (an SVG): drawn at its own size in pixels (its width
        // and height), as Android tiles it and as any other image's size is.
        UIImage* vector = image;
        UIGraphicsImageRendererFormat* format = [UIGraphicsImageRendererFormat preferredFormat];
        format.scale = 1;
        format.opaque = NO;
        UIGraphicsImageRenderer* renderer = [[UIGraphicsImageRenderer alloc] initWithSize: vector.size format: format];
        image = [[renderer imageWithActions: ^(UIGraphicsImageRendererContext* context) {
            [vector drawInRect: CGRectMake(0, 0, vector.size.width, vector.size.height)];
        }] imageWithRenderingMode: vector.renderingMode];
    }
    CGImageRef cgImage = image.CGImage;
    if (!cgImage) {
        return image;
    }
    CGFloat scale = image.scale > 1 ? image.scale : (self.window.screen.scale ?: [UIScreen mainScreen].scale);
    CGSize size = CGSizeMake(image.size.width * image.scale / scale, image.size.height * image.scale / scale);
    CGSize view = self.bounds.size;
    if (view.width > 0 && view.height > 0 && (size.width > view.width || size.height > view.height)) {
        scale *= MAX(size.width / view.width, size.height / view.height);
    }
    UIImage* still = [[UIImage imageWithCGImage: cgImage scale: scale orientation: image.imageOrientation]
                      imageWithRenderingMode: image.renderingMode];
    return [still resizableImageWithCapInsets: UIEdgeInsetsZero resizingMode: UIImageResizingModeTile];
}

// The view's size changed since the image was tiled, which scales an image
// larger than the view down to fit it: tile it again.
- (void) tileAgainIfResized {
    if (_resizeMode != RCTResizeModeRepeat || CGSizeEqualToSize(self.bounds.size, self.tiledForSize)) {
        return;
    }
    UIImage* image = [self blurs: self.originalImage] ? self.blurredImage : self.originalImage;
    if (image) {
        [self showImage: image];
    }
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

// Whether the image is blurred: a loaded image, not defaultSource (as with
// React Native's Image, and on Android).
- (BOOL) blurs: (UIImage*)image {
    return _blurRadius > 0 && image && image != _defaultSource;
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
// resizeMode, or 1 before the view has a size.
- (CGFloat) shownScale: (UIImage*)image {
    CGSize size = image.size;
    CGSize view = self.bounds.size;
    if (size.width <= 0 || size.height <= 0 || view.width <= 0 || view.height <= 0) {
        return 1;
    }
    CGFloat x = view.width / size.width;
    CGFloat y = view.height / size.height;
    switch (_resizeMode) {
        case RCTResizeModeCover:
            return MAX(x, y);
        case RCTResizeModeContain:
            return MIN(x, y);
        case RCTResizeModeStretch:
            return sqrt(x * y);
        case RCTResizeModeCenter:
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
                                                 kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Host);
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

    if (boxSize > 1) {
        vImage_Buffer buffer = {
            .data = CGBitmapContextGetData(context),
            .height = height,
            .width = width,
            .rowBytes = CGBitmapContextGetBytesPerRow(context),
        };
        vImage_Buffer other = buffer;
        other.data = malloc(buffer.rowBytes * height);
        vImage_Error tempSize = vImageBoxConvolve_ARGB8888(&buffer, &other, NULL, 0, 0, boxSize, boxSize, NULL,
                                                           kvImageGetTempBufferSize | kvImageEdgeExtend);
        void* temp = tempSize > 0 ? malloc(tempSize) : NULL;
        if (other.data && temp) {
            vImageBoxConvolve_ARGB8888(&buffer, &other, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
            vImageBoxConvolve_ARGB8888(&other, &buffer, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
            vImageBoxConvolve_ARGB8888(&buffer, &other, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
            memcpy(buffer.data, other.data, buffer.rowBytes * height);
        }
        free(other.data);
        free(temp);
    }

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
        _needsReload = YES;
    }
}

- (void) setDefaultSource: (UIImage*)defaultSource {
    if (_defaultSource != defaultSource) {
        _defaultSource = defaultSource;
        _needsReload = YES;
    }
}

- (void) didSetProps: (NSArray<NSString*>*)changedProps {
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
    } else {
        [self reloadIfResized];
    }
}

// Whether images are decoded at about the view's size (downsample, from
// SDWebImage 5.19, and always for photo library images, which are large and
// usually shown small: Photos makes them at the size asked for, on any
// version). Not for `repeat`, which tiles the image at its own size.
- (BOOL) downsamples {
    if (_resizeMode == RCTResizeModeRepeat) {
        return NO;
    }
    return [_source isPhotoLibrary] || (_downsample && [FFFDownsampledImage isSupported]);
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
    return _resizeMode == RCTResizeModeCover || _resizeMode == RCTResizeModeStretch;
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
    self.waitsForSize = NO;
    self.loadsSwitchedSource = self.switchesSource;
    self.switchesSource = NO;
    if ([self picksSource]) {
        _source = [self sourceForSize];
    }
    self.decodedBox = CGSizeZero;
    // The previous load, if it's still running, is for a source the view no
    // longer shows: cancel it (a new download would, but a data uri or no
    // source doesn't start one), and ignore what it still sends (SDWebImage
    // completes a cancelled load with an error; see downloadImage:).
    self.loadCount++;
    [self sd_cancelCurrentImageLoad];

    if (_source) {
        // Load base64 images.
        NSString* url = [_source.url absoluteString];
        if (url && [url hasPrefix: @"data:image"]) {
            if (self.onFastImageLoadStart) {
                self.onFastImageLoadStart(@{});
                self.hasSentOnLoadStart = YES;
            } else {
                self.hasSentOnLoadStart = NO;
            }
            // Use SDWebImage API to support external format like WebP images
            UIImage* image = [UIImage sd_imageWithData: [NSData dataWithContentsOfURL: _source.url]];
            if (!image) {
                // Not decodable: fail like a remote image, showing defaultSource.
                [self setImage: _defaultSource];
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
                        @"total": @(1)
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
        // of clearing it to defaultSource (or nothing) while it loads, which
        // flashed (#747). defaultSource shows if the new image fails. As React
        // Native's Image does; a `key` that changes starts from blank instead.
        if (self.showsLoadedImage) {
            options |= SDWebImageDelayPlaceholder;
        }

        if (self.onFastImageLoadStart) {
            self.onFastImageLoadStart(@{});
            self.hasSentOnLoadStart = YES;
        } else {
            self.hasSentOnLoadStart = NO;
        }
        self.hasCompleted = NO;
        self.hasErrored = NO;
        self.retriedAfterBackground = NO;
        [self stopWaitingForActive];

        [self downloadImage: _source options: options context: [self loadContext] events: YES];
    } else if (_defaultSource) {
        [self setImage: _defaultSource];
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
// one in the memory cache, where SDWebImage finds it as the load starts, or
// one that isn't downloaded (no source, which shows defaultSource, or a data
// uri). Also when that can't be told (an app's own image cache, or an
// SDWebImage without cacheKeyForURL:context:), as before.
- (BOOL) loadsDuringLayout {
    FFFastImageSource* source = [self picksSource] ? [self sourceForSize] : _source;
    if (!source.url || [source.url.scheme isEqualToString: @"data"]) {
        return YES;
    }
    if (!source.memoryCache) {
        return NO;
    }
    SDWebImageManager* manager = [SDWebImageManager sharedManager];
    if (![manager.imageCache isKindOfClass: [SDImageCache class]] || ![manager respondsToSelector: @selector(cacheKeyForURL:context:)]) {
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
    if (CGSizeEqualToSize(box, CGSizeZero)) {
        [FFFDownsampledImage addFullSizeToContext: context];
        if (!source.memoryCache) {
            // Only on disk, also when it comes from there.
            context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
        }
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
    if (!source.memoryCache) {
        // The smaller copy is only kept in memory, so it isn't kept (the
        // downloaded file is still on disk).
        context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeNone);
    }
    return context;
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
                RCTDirectEventBlock onProgress = weakSelf.onFastImageProgress;
                if (onProgress) {
                    onProgress(@{
                            @"loaded": @(receivedSize),
                            @"total": @(expectedSize)
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
    UIImage* placeholder = _defaultSource;
    SDSetImageBlock setImage = ^(UIImage* _Nullable image, NSData* _Nullable data, SDImageCacheType cacheType, NSURL* _Nullable imageURL) {
        if (weakSelf.loadCount != load) {
            return;
        }
        // The loaded image, not defaultSource (shown while it loads, or if it
        // fails).
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
                    // SDWebImage shows the placeholder (defaultSource or nothing).
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

- (void) dealloc {
    [self stopWaitingForActive];
    [self sd_cancelCurrentImageLoad];
}

@end
