#import "FFFastImageView.h"


@interface FFFastImageView()

@property (nonatomic, assign) BOOL hasSentOnLoadStart;
@property (nonatomic, assign) BOOL hasCompleted;
@property (nonatomic, assign) BOOL hasErrored;

@property (nonatomic, strong) NSDictionary* onLoadEvent;

@end

@implementation FFFastImageView

- (id) init {
    self = [super init];
    self.resizeMode = RCTResizeModeCover;
    self.clipsToBounds = YES;
    return self;
}

- (void)setResizeMode:(RCTResizeMode)resizeMode {
    if (_resizeMode != resizeMode) {
        _resizeMode = resizeMode;
        self.contentMode = (UIViewContentMode)resizeMode;
    }
}

- (void)setOnFastImageLoadEnd:(RCTDirectEventBlock)onFastImageLoadEnd {
    _onFastImageLoadEnd = onFastImageLoadEnd;
    if (self.hasCompleted) {
        _onFastImageLoadEnd(@{});
    }
}

- (void)setOnFastImageLoad:(RCTDirectEventBlock)onFastImageLoad {
    _onFastImageLoad = onFastImageLoad;
    if (self.hasCompleted) {
        _onFastImageLoad(self.onLoadEvent);
    }
}

- (void)setOnFastImageError:(RCTDirectEventBlock)onFastImageError {
    _onFastImageError = onFastImageError;
    if (self.hasErrored) {
        _onFastImageError(@{});
    }
}

- (void)setOnFastImageLoadStart:(RCTDirectEventBlock)onFastImageLoadStart {
    if (_source && !self.hasSentOnLoadStart) {
        _onFastImageLoadStart = onFastImageLoadStart;
        onFastImageLoadStart(@{});
        self.hasSentOnLoadStart = YES;
    } else {
        _onFastImageLoadStart = onFastImageLoadStart;
        self.hasSentOnLoadStart = NO;
    }
}

- (void)setImageColor:(UIColor *)imageColor {
    if (imageColor != nil) {
        _imageColor = imageColor;
        super.image = [self makeImage:super.image withTint:self.imageColor];
    }
}

- (UIImage*)makeImage:(UIImage *)image withTint:(UIColor *)color {
    UIImage *newImage = [image imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate];
    UIGraphicsBeginImageContextWithOptions(image.size, NO, newImage.scale);
    [color set];
    [newImage drawInRect:CGRectMake(0, 0, image.size.width, newImage.size.height)];
    newImage = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    return newImage;
}

- (void)setImage:(UIImage *)image {
    if (self.imageColor != nil) {
        super.image = [self makeImage:image withTint:self.imageColor];
    } else {
        super.image = image;
    }
}

- (void)sendOnLoad:(UIImage *)image {
    self.onLoadEvent = @{
                         @"width":[NSNumber numberWithDouble:image.size.width],
                         @"height":[NSNumber numberWithDouble:image.size.height]
                         };
    if (self.onFastImageLoad) {
        self.onFastImageLoad(self.onLoadEvent);
    }
}

- (void)setSource:(FFFastImageSource *)source {
    if (_source != source) {
        _source = source;
        
        // Load base64 images.
        NSString* url = [_source.url absoluteString];
        if (url && [url hasPrefix:@"data:image"]) {
            if (self.onFastImageLoadStart) {
                self.onFastImageLoadStart(@{});
                self.hasSentOnLoadStart = YES;
            } {
                self.hasSentOnLoadStart = NO;
            }
            UIImage *image = [UIImage imageWithData:[NSData dataWithContentsOfURL:_source.url]];
            [self setImage:image];
            if (self.onFastImageProgress) {
                self.onFastImageProgress(@{
                                           @"loaded": @(1),
                                           @"total": @(1)
                                           });
            }
            self.hasCompleted = YES;
            [self sendOnLoad:image];
            
            if (self.onFastImageLoadEnd) {
                self.onFastImageLoadEnd(@{});
            }
            return;
        }
        
        // Set headers.
        [_source.headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString* header, BOOL *stop) {
            [[SDWebImageDownloader sharedDownloader] setValue:header forHTTPHeaderField:key];
        }];
        
        // Set priority.
        SDWebImageOptions options = SDWebImageRetryFailed;
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
        
        if (self.onFastImageLoadStart) {
            self.onFastImageLoadStart(@{});
            self.hasSentOnLoadStart = YES;
        } {
            self.hasSentOnLoadStart = NO;
        }
        self.hasCompleted = NO;
        self.hasErrored = NO;
        
        [self downloadImage:_source options:options];
    }
}

- (void)downloadImage:(FFFastImageSource *) source options:(SDWebImageOptions) options {
    __weak typeof(self) weakSelf = self; // Always use a weak reference to self in blocks
    [self sd_setImageWithURL:_source.url
            placeholderImage:nil
                     options:options
                    progress:^(NSInteger receivedSize, NSInteger expectedSize, NSURL * _Nullable targetURL) {
                        if (weakSelf.onFastImageProgress) {
                            weakSelf.onFastImageProgress(@{
                                                           @"loaded": @(receivedSize),
                                                           @"total": @(expectedSize)
                                                           });
                        }
                    } completed:^(UIImage * _Nullable image,
                                  NSError * _Nullable error,
                                  SDImageCacheType cacheType,
                                  NSURL * _Nullable imageURL) {
                        if (error) {
                            weakSelf.hasErrored = YES;
                                if (weakSelf.onFastImageError) {
                                    weakSelf.onFastImageError(@{});
                                }
                                if (weakSelf.onFastImageLoadEnd) {
                                    weakSelf.onFastImageLoadEnd(@{});
                                }
                        } else {
                            weakSelf.hasCompleted = YES;
                            [weakSelf sendOnLoad:image];
                            if (weakSelf.onFastImageLoadEnd) {
                                weakSelf.onFastImageLoadEnd(@{});
                            }
                        }
                    }];
}

@end

