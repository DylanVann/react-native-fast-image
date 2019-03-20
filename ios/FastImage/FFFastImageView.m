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

- (void)dealloc {
    [NSNotificationCenter.defaultCenter removeObserver:self];
}

- (void)setResizeMode:(RCTResizeMode)resizeMode {
    if (_resizeMode != resizeMode) {
        _resizeMode = resizeMode;
        self.contentMode = (UIViewContentMode)resizeMode;
    }
}

- (void)setOnFastImageLoadEnd:(RCTBubblingEventBlock)onFastImageLoadEnd {
    _onFastImageLoadEnd = onFastImageLoadEnd;
    if (self.hasCompleted) {
        _onFastImageLoadEnd(@{});
    }
}

- (void)setOnFastImageLoad:(RCTBubblingEventBlock)onFastImageLoad {
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

- (void)setOnFastImageLoadStart:(RCTBubblingEventBlock)onFastImageLoadStart {
    if (_source && !self.hasSentOnLoadStart) {
        _onFastImageLoadStart = onFastImageLoadStart;
        onFastImageLoadStart(@{});
        self.hasSentOnLoadStart = YES;
    } else {
        _onFastImageLoadStart = onFastImageLoadStart;
        self.hasSentOnLoadStart = NO;
    }
}

- (void)sendOnLoad:(UIImage *)image {
    self.onLoadEvent = @{
                         @"width":[NSNumber numberWithDouble:image.size.width],
                         @"height":[NSNumber numberWithDouble:image.size.height]
                         };
    if (_onFastImageLoad) {
        _onFastImageLoad(self.onLoadEvent);
    }
}

- (void)imageDidLoadObserver:(NSNotification *)notification {
    FFFastImageSource *source = notification.object;
    if (source != nil) {
        [self sd_setImageWithURL:source.url];
    }
}

- (void)setSource:(FFFastImageSource *)source {
    if (_source != source) {
        _source = source;
        
        // Attach a observer to refresh other FFFastImageView instance sharing the same source
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(imageDidLoadObserver:) name:source.url.absoluteString object:nil];
        
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
                options |= SDWebImageCacheMemoryOnly;
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
        
        [self downloadImage:_source options:options retry:0];
    }
}

- (void)downloadImage:(FFFastImageSource *) source options:(SDWebImageOptions) options retry:(NSInteger) retry {
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
                            if (retry >= 3) {
                                weakSelf.hasErrored = YES;
                                if (weakSelf.onFastImageError) {
                                    weakSelf.onFastImageError(@{});
                                }
                                if (weakSelf.onFastImageLoadEnd) {
                                    weakSelf.onFastImageLoadEnd(@{});
                                }
                            } else {
                                // Auto-retry to download if failed
                                NSTimeInterval delayInSeconds = (retry + 1) * 5.0; // will retry after 0.5, 1.0 or 1.5 seconds
                                dispatch_time_t trigger = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayInSeconds * NSEC_PER_SEC));
                                dispatch_after(trigger, dispatch_get_main_queue(), ^{
                                    [weakSelf downloadImage:_source options:options retry:retry + 1];
                                });
                            }
                        } else {
                            weakSelf.hasCompleted = YES;
                            [weakSelf sendOnLoad:image];
                            
                            // Alert other FFFastImageView component sharing the same URL
                            [NSNotificationCenter.defaultCenter postNotificationName:source.url.absoluteString object:source];
                            
                            if (weakSelf.onFastImageLoadEnd) {
                                weakSelf.onFastImageLoadEnd(@{});
                            }
                        }
                    }];
}

@end

