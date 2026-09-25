#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>
#import <SDWebImage/SDWebImageError.h>

@interface FFFastImageView ()

// Whether the source or default source changed since the last load.
@property (nonatomic, assign) BOOL needsReload;
// The image before tinting, kept while a tint is applied so the tint can be
// changed or removed. nil when there's no tint (super.image is untinted).
@property (nonatomic, strong, nullable) UIImage *untintedImage;

@end

@implementation FFFastImageView

- (instancetype)initWithFrame:(CGRect)frame {
    if (self = [super initWithFrame:frame]) {
        _resizeMode = FFFResizeModeCover;
        self.contentMode = UIViewContentModeScaleAspectFill;
        self.clipsToBounds = YES;
        _loopCount = -1;
        // Trilinear filtering (with mipmaps) smooths images drawn smaller than
        // their size, as React Native's Image does on the New Architecture.
        self.enableMinificationFilter = YES;
    }
    return self;
}

- (void)setLoopCount:(NSInteger)loopCount {
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
    } else if (self.player && [self.image conformsToProtocol:@protocol(SDAnimatedImage)]) {
        self.player.totalLoopCount = [(id<SDAnimatedImage>)self.image animatedImageLoopCount];
    }
    // Apply it to the image that's showing, and play it again.
    if (self.player) {
        [self.player seekToFrameAtIndex:0 loopCount:0];
        [self startAnimating];
    }
}

- (void)setResizeMode:(FFFResizeMode)resizeMode {
    _resizeMode = resizeMode;
    switch (resizeMode) {
        case FFFResizeModeContain:
            self.contentMode = UIViewContentModeScaleAspectFit;
            break;
        case FFFResizeModeStretch:
            self.contentMode = UIViewContentModeScaleToFill;
            break;
        case FFFResizeModeCenter:
            self.contentMode = UIViewContentModeCenter;
            break;
        case FFFResizeModeCover:
            self.contentMode = UIViewContentModeScaleAspectFill;
            break;
    }
}

- (void)setEnableMinificationFilter:(BOOL)enableMinificationFilter {
    _enableMinificationFilter = enableMinificationFilter;
    self.layer.minificationFilter = enableMinificationFilter ? kCAFilterTrilinear : kCAFilterLinear;
}

- (void)setImageColor:(UIColor *)imageColor {
    if (_imageColor == imageColor || [_imageColor isEqual:imageColor]) {
        return;
    }
    _imageColor = imageColor;
    // Re-apply to the untinted image, so the tint can change or be removed.
    UIImage *image = self.untintedImage ?: super.image;
    if (image) {
        [self setImage:image];
    }
}

- (UIImage *)makeImage:(UIImage *)image withTint:(UIColor *)color {
    // Nothing to draw (and the renderer can't draw a zero size).
    if (!image || image.size.width <= 0 || image.size.height <= 0) {
        return image;
    }

    UIImage *templateImage = [image imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate];
    CGRect rect = CGRectMake(0, 0, image.size.width, image.size.height);
    // Keep the source image's scale and a standard-range (8-bit) bitmap.
    UIGraphicsImageRendererFormat *format = [[UIGraphicsImageRendererFormat alloc] init];
    format.scale = image.scale;
    format.opaque = NO;
    format.preferredRange = UIGraphicsImageRendererFormatRangeStandard;
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:image.size format:format];
    return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        [color set];
        [templateImage drawInRect:rect];
    }];
}

- (void)setImage:(UIImage *)image {
    if (self.imageColor != nil) {
        self.untintedImage = image;
        super.image = [self makeImage:image withTint:self.imageColor];
    } else {
        self.untintedImage = nil;
        super.image = image;
    }
}

+ (NSString *)messageForError:(NSError *)error {
    NSNumber *statusCode = error.userInfo[SDWebImageErrorDownloadStatusCodeKey];
    if (statusCode) {
        return [NSString stringWithFormat:@"%@, status code: %@", error.localizedDescription, statusCode];
    }
    return error.localizedDescription ?: @"Failed to load the image";
}

- (void)setSource:(FFFastImageSource *)source {
    if (_source != source) {
        _source = source;
        _needsReload = YES;
    }
}

- (void)setDefaultSource:(UIImage *)defaultSource {
    if (_defaultSource != defaultSource) {
        _defaultSource = defaultSource;
        _needsReload = YES;
    }
}

- (void)reloadIfNeeded {
    if (_needsReload) {
        [self reloadImage];
    }
}

- (void)reset {
    [self sd_cancelCurrentImageLoad];
    _source = nil;
    _defaultSource = nil;
    _needsReload = NO;
    self.untintedImage = nil;
    super.image = nil;
}

- (void)reloadImage {
    _needsReload = NO;

    if (!_source) {
        [self sd_cancelCurrentImageLoad];
        [self setImage:_defaultSource];
        return;
    }

    id<FFFastImageViewDelegate> delegate = self.delegate;
    if (!_source.url) {
        // An empty, missing or null uri: fail, showing defaultSource.
        [self sd_cancelCurrentImageLoad];
        [self setImage:_defaultSource];
        [delegate fastImageView:self didFailWithError:@"Invalid source: no uri"];
        [delegate fastImageViewDidEndLoading:self];
        return;
    }
    NSString *url = [_source.url absoluteString];
    if (url && [url hasPrefix:@"data:image"]) {
        [self sd_cancelCurrentImageLoad];
        [delegate fastImageViewDidStartLoading:self];
        // Use SDWebImage API to support external format like WebP images
        UIImage *image = [UIImage sd_imageWithData:[NSData dataWithContentsOfURL:_source.url]];
        if (!image) {
            // Not decodable: fail like a remote image, showing defaultSource.
            [self setImage:_defaultSource];
            [delegate fastImageView:self didFailWithError:@"The data URI couldn't be decoded as an image"];
            [delegate fastImageViewDidEndLoading:self];
            return;
        }
        [self setImage:image];
        if (self.progressEnabled) {
            [delegate fastImageView:self didProgress:1 total:1];
        }
        [delegate fastImageView:self didLoadWithSize:image.size];
        [delegate fastImageViewDidEndLoading:self];
        return;
    }

    // Set headers.
    SDWebImageContext *context = @{SDWebImageContextDownloadRequestModifier: _source.requestModifier};

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

    [delegate fastImageViewDidStartLoading:self];
    [self downloadImage:_source options:options context:context];
}

- (void)downloadImage:(FFFastImageSource *)source options:(SDWebImageOptions)options context:(SDWebImageContext *)context {
    __weak typeof(self) weakSelf = self;
    SDImageLoaderProgressBlock progress = nil;
    if (self.progressEnabled) {
        progress = ^(NSInteger receivedSize, NSInteger expectedSize, NSURL *_Nullable targetURL) {
            // Without a Content-Length the total is unknown (-1 or 0), and a
            // percentage can't be worked out from it, so don't send those.
            if (expectedSize <= 0) {
                return;
            }
            // SDWebImage calls this on its download queue; send it from the
            // main queue, where the delegate lives.
            dispatch_async(dispatch_get_main_queue(), ^{
                FFFastImageView *strongSelf = weakSelf;
                if (strongSelf && strongSelf.source == source) {
                    [strongSelf.delegate fastImageView:strongSelf didProgress:receivedSize total:expectedSize];
                }
            });
        };
    }
    [self sd_setImageWithURL:source.url
            placeholderImage:_defaultSource
                     options:options
                     context:context
                    progress:progress
                   completed:^(UIImage *_Nullable image,
                               NSError *_Nullable error,
                               SDImageCacheType cacheType,
                               NSURL *_Nullable imageURL) {
        FFFastImageView *strongSelf = weakSelf;
        // A later load replaced this one.
        if (!strongSelf || strongSelf.source != source) {
            return;
        }
        id<FFFastImageViewDelegate> delegate = strongSelf.delegate;
        if (error) {
            [delegate fastImageView:strongSelf didFailWithError:[FFFastImageView messageForError:error]];
        } else {
            [delegate fastImageView:strongSelf didLoadWithSize:image.size];
        }
        [delegate fastImageViewDidEndLoading:strongSelf];
    }];
}

- (void)dealloc {
    [self sd_cancelCurrentImageLoad];
}

@end
