#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>
#import <React/RCTUtils.h>
#import <SDWebImage/SDWebImageError.h>
#import <SDWebImage/SDImageTransformer.h>
#import "FFFDownsampledImage.h"

@interface FFFastImageView ()

@property(nonatomic, assign) BOOL hasSentOnLoadStart;
@property(nonatomic, assign) BOOL hasCompleted;
@property(nonatomic, assign) BOOL hasErrored;
// Whether the latest change of props requires the image to be reloaded
@property(nonatomic, assign) BOOL needsReload;

@property(nonatomic, strong) NSDictionary* onLoadEvent;
@property(nonatomic, strong) NSDictionary* onErrorEvent;
// The image before tinting, kept while a tint is applied so the tint can be
// changed or removed. nil when there's no tint (super.image is untinted).
@property(nonatomic, strong) UIImage* untintedImage;
// Whether the current load was already restarted after the app came back
// from the background (see downloadImage:).
@property(nonatomic, assign) BOOL retriedAfterBackground;
// Waits for the app to be active again, to restart a load.
@property(nonatomic, strong) id activeObserver;
// Whether the view shows an image that loaded (not defaultSource or nothing).
// A new source then keeps it until the new image has loaded (see reloadImage).
@property(nonatomic, assign) BOOL showsLoadedImage;
// downsample: a load waits for the view's size (see didSetProps).
@property(nonatomic, assign) BOOL waitsForSize;
// The size (in pixels) the image showing or loading was decoded for, and
// whether it covers it; zero for a full-size image.
@property(nonatomic, assign) CGSize decodedBox;
@property(nonatomic, assign) BOOL decodedCover;
// Counts loads, so a quiet reload's completion can tell if it's still current.
@property(nonatomic, assign) NSUInteger loadCount;

@end

// When the app last went to the background (CACurrentMediaTime), or 0.
static CFTimeInterval FFFEnteredBackgroundAt = 0;

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
        _resizeMode = resizeMode;
        [self updateContentMode];
    }
}

// The content mode for resizeMode. `center` scales an image larger than the
// view down to fit, as React Native's Image and Android do (#866); only a
// smaller one is shown at its own size. UIViewContentModeCenter alone showed
// large images at full size, cropped. So it depends on the image and the
// view's size.
- (void) updateContentMode {
    UIViewContentMode contentMode = (UIViewContentMode) _resizeMode;
    if (_resizeMode == RCTResizeModeCenter) {
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
    if (self.waitsForSize) {
        if ([self hasSize]) {
            [self reloadImage];
        }
    } else {
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
    // Re-apply to the untinted image, so the tint can change or be removed.
    UIImage* image = self.untintedImage ?: super.image;
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
    // Tinted as React Native's Image does it: UIKit draws a template image in
    // the view's tintColor, so no tinted copy of the image is made.
    // SDAnimatedImageView draws the frames of an animated image itself,
    // without the tint, so each frame is tinted as it's decoded (source-in,
    // as the template is), or, before SDWebImage 5.20, the first frame shows.
    UIColor* tint = image ? self.imageColor : nil;
    BOOL animated = [image conformsToProtocol: @protocol(SDAnimatedImage)] && [(id<SDAnimatedImage>)image animatedImageFrameCount] > 1;
    self.untintedImage = tint ? image : nil;
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
    } else if (tint) {
        if (animated) {
            image = [UIImage imageWithCGImage: image.CGImage scale: image.scale orientation: image.imageOrientation];
        }
        super.image = [image imageWithRenderingMode: UIImageRenderingModeAlwaysTemplate];
    } else {
        super.image = image;
    }
    [self updateContentMode];
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
    CGSize size = [FFFDownsampledImage sourceSizeOfImage: image];
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
    if (_source != source) {
        _source = source;
        _needsReload = YES;
    }
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
        // source is the same.
        self.showsLoadedImage = NO;
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
        // With downsample on, the image is decoded for the view's size, so
        // a view that hasn't been laid out yet loads once it has. Props and
        // layout are applied in the same update, so that's before the next
        // frame (in layoutSubviews). A view that still has no size then
        // (e.g. one sized from onLoad) loads at full size.
        if ([self downsamples] && ![self hasSize]) {
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

// Whether images are decoded at about the view's size (downsample).
// Not for `repeat`, which tiles the image at its own size, or SDWebImage
// before 5.19.
- (BOOL) downsamples {
    return _downsample && _resizeMode != RCTResizeModeRepeat && [FFFDownsampledImage isSupported];
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
    UIImage* image = self.untintedImage ?: super.image;
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
            [self setImage: image];
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
    SDWebImageMutableContext* context = [NSMutableDictionary dictionary];
    context[SDWebImageContextDownloadRequestModifier] = _source.requestModifier;
    context[SDWebImageContextImageLoader] = _source.imageLoader;
    context[SDWebImageContextCacheKeyFilter] = _source.cacheKeyFilter;
    CGSize box = [self decodeBox];
    self.decodedBox = box;
    self.decodedCover = [self decodeCovers];
    if (CGSizeEqualToSize(box, CGSizeZero)) {
        context[SDWebImageContextAnimatedImageClass] = [SDAnimatedImage class];
        if (!_source.memoryCache) {
            // Only on disk, also when it comes from there.
            context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeDisk);
        }
        return context;
    }
    NSString* key = _source.cacheKeyFilter ? _source.cacheKey : _source.url.absoluteString;
    [FFFDownsampledImage addToContext: context forKey: key box: box cover: self.decodedCover];
    if (!_source.memoryCache) {
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
    if (events && self.onFastImageProgress) {
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
    NSURL* url = context[SDWebImageContextImageThumbnailPixelSize] ? [FFFDownsampledImage loadURLForURL: source.url] : source.url;
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
    SDSetImageBlock setImage = ^(UIImage* _Nullable image, NSData* _Nullable data, SDImageCacheType cacheType, NSURL* _Nullable imageURL) {
        if (weakSelf.loadCount == load) {
            weakSelf.image = image;
        }
    };
    [self sd_internalSetImageWithURL: url
                    placeholderImage: _defaultSource
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
                    [weakSelf sendOnError: FFFErrorMessage(error)];
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
