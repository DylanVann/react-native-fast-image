#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>
#import <React/RCTUtils.h>

@interface FFFastImageView ()

@property(nonatomic, assign) BOOL hasSentOnLoadStart;
@property(nonatomic, assign) BOOL hasCompleted;
@property(nonatomic, assign) BOOL hasErrored;
// Whether the latest change of props requires the image to be reloaded
@property(nonatomic, assign) BOOL needsReload;

@property(nonatomic, strong) NSDictionary* onLoadEvent;
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
    _loopCount = -1;
    return self;
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
    // Apply it to the image that's showing, and play it again.
    if (self.player) {
        [self.player seekToFrameAtIndex: 0 loopCount: 0];
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
}

- (void) setOnFastImageLoadEnd: (RCTDirectEventBlock)onFastImageLoadEnd {
    _onFastImageLoadEnd = onFastImageLoadEnd;
    if (self.hasCompleted && _onFastImageLoadEnd) {
        _onFastImageLoadEnd(@{});
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
        _onFastImageError(@{});
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
        [self setImage: image];
    }
}

- (UIImage*) makeImage: (UIImage*)image withTint: (UIColor*)color {
    // FIX: Prevent crash on zero/invalid image dimensions
    if (!image || image.size.width <= 0 || image.size.height <= 0) {
        return image;
    }

    UIImage* templateImage = [image imageWithRenderingMode: UIImageRenderingModeAlwaysTemplate];
    CGRect rect = CGRectMake(0, 0, image.size.width, image.size.height);
    UIImage* newImage;
    if (@available(iOS 10.0, tvOS 10.0, *)) {
        // UIGraphicsBeginImageContextWithOptions is deprecated since iOS 17.
        // Keep the source image's scale and a standard-range (8-bit) bitmap,
        // matching what it produced.
        UIGraphicsImageRendererFormat* format = [[UIGraphicsImageRendererFormat alloc] init];
        format.scale = image.scale;
        format.opaque = NO;
        if (@available(iOS 12.0, tvOS 12.0, *)) {
            format.preferredRange = UIGraphicsImageRendererFormatRangeStandard;
        } else {
            format.prefersExtendedRange = NO;
        }
        UIGraphicsImageRenderer* renderer = [[UIGraphicsImageRenderer alloc] initWithSize: image.size format: format];
        newImage = [renderer imageWithActions: ^(UIGraphicsImageRendererContext* context) {
            [color set];
            [templateImage drawInRect: rect];
        }];
    } else {
        // iOS/tvOS 9. Remove this branch once the minimum is iOS 10+.
        UIGraphicsBeginImageContextWithOptions(image.size, NO, image.scale);
        [color set];
        [templateImage drawInRect: rect];
        newImage = UIGraphicsGetImageFromCurrentImageContext();
        UIGraphicsEndImageContext();
    }
    return newImage;
}

- (void) setImage: (UIImage*)image {
    if (self.imageColor != nil) {
        self.untintedImage = image;
        super.image = [self makeImage: image withTint: self.imageColor];
    } else {
        self.untintedImage = nil;
        super.image = image;
    }
    [self updateContentMode];
}

- (void) sendOnLoad: (UIImage*)image {
    self.onLoadEvent = @{
            @"width": [NSNumber numberWithDouble: image.size.width],
            @"height": [NSNumber numberWithDouble: image.size.height]
    };
    if (self.onFastImageLoad) {
        self.onFastImageLoad(self.onLoadEvent);
    }
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
        [self reloadImage];
    }
}

- (void) reloadImage {
    _needsReload = NO;

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
                self.hasErrored = YES;
                if (self.onFastImageError) {
                    self.onFastImageError(@{});
                }
                if (self.onFastImageLoadEnd) {
                    self.onFastImageLoadEnd(@{});
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
                self.onFastImageLoadEnd(@{});
            }
            return;
        }

        // Set headers.
        SDWebImageContext* context = @{SDWebImageContextDownloadRequestModifier: _source.requestModifier};

        // Set priority.
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

        switch (_source.cacheControl) {
            case FFFCacheControlWeb:
                options |= SDWebImageRefreshCached;
                break;
            case FFFCacheControlCacheOnly:
                options |= SDWebImageFromCacheOnly;
                break;
            case FFFCacheControlImmutable:
                break;
        }

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

        [self downloadImage: _source options: options context: context];
    } else if (_defaultSource) {
        [self setImage: _defaultSource];
        self.showsLoadedImage = NO;
    }
}

- (void) downloadImage: (FFFastImageSource*)source options: (SDWebImageOptions)options context: (SDWebImageContext*)context {
    __weak typeof(self) weakSelf = self; // Always use a weak reference to self in blocks
    // Most images have no onProgress, so only ask SDWebImage for progress when
    // there's a handler as the load starts. A handler added while loading is
    // used from the next load.
    SDImageLoaderProgressBlock progress = nil;
    if (self.onFastImageProgress) {
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
    [self sd_setImageWithURL: _source.url
            placeholderImage: _defaultSource
                     options: options
                     context: context
                    progress: progress
                   completed: ^(UIImage* _Nullable image,
                    NSError* _Nullable error,
                    SDImageCacheType cacheType,
                    NSURL* _Nullable imageURL) {
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
                    weakSelf.hasErrored = YES;
                    if (weakSelf.onFastImageError) {
                        weakSelf.onFastImageError(@{});
                    }
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd(@{});
                    }
                } else {
                    weakSelf.hasCompleted = YES;
                    weakSelf.showsLoadedImage = YES;
                    [weakSelf sendOnLoad: image];
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd(@{});
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
        [self downloadImage: source options: options context: context];
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
            [weakSelf downloadImage: source options: options context: context];
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
