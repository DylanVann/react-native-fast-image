#import "FFFastImageView.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>

@interface FFFastImageView ()

@property(nonatomic, assign) BOOL hasSentOnLoadStart;
@property(nonatomic, assign) BOOL hasCompleted;
@property(nonatomic, assign) BOOL hasErrored;
// Whether the latest change of props requires the image to be reloaded
@property(nonatomic, assign) BOOL needsReload;

@property(nonatomic, strong) NSDictionary* onLoadEvent;

@end

@implementation FFFastImageView

- (id) init {
    self = [super init];
    self.resizeMode = RCTResizeModeCover;
    self.clipsToBounds = YES;
    return self;
}

- (void) setResizeMode: (RCTResizeMode)resizeMode {
    if (_resizeMode != resizeMode) {
        _resizeMode = resizeMode;
        self.contentMode = (UIViewContentMode) resizeMode;
    }
}

- (void) setOnFastImageLoadEnd: (RCTDirectEventBlock)onFastImageLoadEnd {
    _onFastImageLoadEnd = onFastImageLoadEnd;
    if (self.hasCompleted) {
        _onFastImageLoadEnd(@{});
    }
}

- (void) setOnFastImageLoad: (RCTDirectEventBlock)onFastImageLoad {
    _onFastImageLoad = onFastImageLoad;
    if (self.hasCompleted) {
        _onFastImageLoad(self.onLoadEvent);
    }
}

- (void) setOnFastImageError: (RCTDirectEventBlock)onFastImageError {
    _onFastImageError = onFastImageError;
    if (self.hasErrored) {
        _onFastImageError(@{});
    }
}

- (void) setOnFastImageLoadStart: (RCTDirectEventBlock)onFastImageLoadStart {
    if (_source && !self.hasSentOnLoadStart) {
        _onFastImageLoadStart = onFastImageLoadStart;
        onFastImageLoadStart(@{});
        self.hasSentOnLoadStart = YES;
    } else {
        _onFastImageLoadStart = onFastImageLoadStart;
        self.hasSentOnLoadStart = NO;
    }
}

- (void) setImageColor: (UIColor*)imageColor {
    if (imageColor != nil) {
        _imageColor = imageColor;
        if (super.image) {
            super.image = [self makeImage: super.image withTint: self.imageColor];
        }
    }
}

- (UIImage*) makeImage: (UIImage*)image withTint: (UIColor*)color {
    UIImage* newImage = [image imageWithRenderingMode: UIImageRenderingModeAlwaysTemplate];
    UIGraphicsBeginImageContextWithOptions(image.size, NO, newImage.scale);
    [color set];
    [newImage drawInRect: CGRectMake(0, 0, image.size.width, newImage.size.height)];
    newImage = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    return newImage;
}

- (void) setImage: (UIImage*)image {
    if (self.imageColor != nil) {
        super.image = [self makeImage: image withTint: self.imageColor];
    } else {
        super.image = image;
    }
}

- (void) sendOnLoad: (UIImage*)image {
    self.onLoadEvent = @{
            @"width": [NSNumber numberWithDouble: image.size.width],
            @"height": [NSNumber numberWithDouble: image.size.height]
    };
// all the setters of RCTDirectEventBlock aren't called on Fabric so we don't
// need the logic of checking if the values are there already etc
#ifdef RCT_NEW_ARCH_ENABLED
            if (_eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(_eventEmitter)
                    ->onFastImageLoad(facebook::react::FastImageViewEventEmitter::OnFastImageLoad{.width = image.size.width, .height = image.size.height});
              }
#else
    if (self.onFastImageLoad) {
        self.onFastImageLoad(self.onLoadEvent);
    }
#endif
}

- (void) setSource: (FFFastImageSource*)source {
    if (_source != source) {
        _source = source;
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
#ifdef RCT_NEW_ARCH_ENABLED
            if (_eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(_eventEmitter)
                    ->onFastImageLoadStart(facebook::react::FastImageViewEventEmitter::OnFastImageLoadStart{});
              }
#else
            if (self.onFastImageLoadStart) {
                self.onFastImageLoadStart(@{});
                self.hasSentOnLoadStart = YES;
            } else {
                self.hasSentOnLoadStart = NO;
            }
#endif
            // Use SDWebImage API to support external format like WebP images
            UIImage* image = [UIImage sd_imageWithData: [NSData dataWithContentsOfURL: _source.url]];
            [self setImage: image];
#ifdef RCT_NEW_ARCH_ENABLED
            if (_eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(_eventEmitter)
                    ->onFastImageProgress(facebook::react::FastImageViewEventEmitter::OnFastImageProgress{.loaded = 1, .total = 1});
              }
#else
            if (self.onFastImageProgress) {
                self.onFastImageProgress(@{
                        @"loaded": @(1),
                        @"total": @(1)
                });
            }
#endif
            self.hasCompleted = YES;
            [self sendOnLoad: image];

#ifdef RCT_NEW_ARCH_ENABLED
            if (_eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(_eventEmitter)
                    ->onFastImageLoadEnd(facebook::react::FastImageViewEventEmitter::OnFastImageLoadEnd{});
              }
#else
            if (self.onFastImageLoadEnd) {
                self.onFastImageLoadEnd(@{});
            }
#endif
            return;
        }

        // Set headers.
        NSDictionary* headers = _source.headers;
        SDWebImageDownloaderRequestModifier* requestModifier = [SDWebImageDownloaderRequestModifier requestModifierWithBlock: ^NSURLRequest* _Nullable (NSURLRequest* _Nonnull request) {
            NSMutableURLRequest* mutableRequest = [request mutableCopy];
            for (NSString* header in headers) {
                NSString* value = headers[header];
                [mutableRequest setValue: value forHTTPHeaderField: header];
            }
            return [mutableRequest copy];
        }];
        SDWebImageContext* context = @{SDWebImageContextDownloadRequestModifier: requestModifier};

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

#ifdef RCT_NEW_ARCH_ENABLED
            if (_eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(_eventEmitter)
                    ->onFastImageLoadStart(facebook::react::FastImageViewEventEmitter::OnFastImageLoadStart{});
              }
#else
        if (self.onFastImageLoadStart) {
            self.onFastImageLoadStart(@{});
            self.hasSentOnLoadStart = YES;
        } else {
            self.hasSentOnLoadStart = NO;
        }
#endif
        self.hasCompleted = NO;
        self.hasErrored = NO;

        [self downloadImage: _source options: options context: context];
    } else if (_defaultSource) {
        [self setImage: _defaultSource];
    }
}

- (void) downloadImage: (FFFastImageSource*)source options: (SDWebImageOptions)options context: (SDWebImageContext*)context {
    __weak FFFastImageView *weakSelf = self; // Always use a weak reference to self in blocks
    [self sd_setImageWithURL: _source.url
            placeholderImage: _defaultSource
                     options: options
                     context: context
                    progress: ^(NSInteger receivedSize, NSInteger expectedSize, NSURL* _Nullable targetURL) {
#ifdef RCT_NEW_ARCH_ENABLED
        if (weakSelf.eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(weakSelf.eventEmitter)
                ->onFastImageProgress(facebook::react::FastImageViewEventEmitter::OnFastImageProgress{.loaded = static_cast<int>(receivedSize), .total = static_cast<int>(expectedSize)});
              }
#else
        if (weakSelf.onFastImageProgress) {
                            weakSelf.onFastImageProgress(@{
                                    @"loaded": @(receivedSize),
                                    @"total": @(expectedSize)
                            });
                        }
#endif

                    } completed: ^(UIImage* _Nullable image,
                    NSError* _Nullable error,
                    SDImageCacheType cacheType,
                    NSURL* _Nullable imageURL) {
                if (error) {
                    weakSelf.hasErrored = YES;
#ifdef RCT_NEW_ARCH_ENABLED
        if (weakSelf.eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(weakSelf.eventEmitter)
                ->onFastImageError(facebook::react::FastImageViewEventEmitter::OnFastImageError{});
              }
#else
                    if (weakSelf.onFastImageError) {
                        weakSelf.onFastImageError(@{});
                    }
#endif

#ifdef RCT_NEW_ARCH_ENABLED
        if (weakSelf.eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(weakSelf.eventEmitter)
                ->onFastImageLoadEnd(facebook::react::FastImageViewEventEmitter::OnFastImageLoadEnd{});
              }
#else
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd(@{});
                    }
#endif
                } else {
                    weakSelf.hasCompleted = YES;
                    [weakSelf sendOnLoad: image];
#ifdef RCT_NEW_ARCH_ENABLED
        if (weakSelf.eventEmitter != nullptr) {
                std::dynamic_pointer_cast<const facebook::react::FastImageViewEventEmitter>(weakSelf.eventEmitter)
                ->onFastImageLoadEnd(facebook::react::FastImageViewEventEmitter::OnFastImageLoadEnd{});
              }
#else
                    if (weakSelf.onFastImageLoadEnd) {
                        weakSelf.onFastImageLoadEnd(@{});
                    }
#endif
                }
            }];
}

- (void) dealloc {
    [self sd_cancelCurrentImageLoad];
}

@end
