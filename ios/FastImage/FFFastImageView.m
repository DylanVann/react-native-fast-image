#import "FFFastImageView.h"

@implementation FFFastImageView {
    BOOL hasSentOnLoadStart;
}

- (void)setResizeMode:(RCTResizeMode)resizeMode
{
    if (_resizeMode != resizeMode) {
        _resizeMode = resizeMode;
        self.contentMode = (UIViewContentMode)resizeMode;
    }
}

- (void)setOnFastImageLoadStart:(RCTBubblingEventBlock)onFastImageLoadStart {
    if (_source && !hasSentOnLoadStart) {
        _onFastImageLoadStart = onFastImageLoadStart;
        onFastImageLoadStart(@{});
        hasSentOnLoadStart = YES;
    } else {
        _onFastImageLoadStart = onFastImageLoadStart;
        hasSentOnLoadStart = NO;
    }
}

- (void)setSource:(FFFastImageSource *)source {
    if (_source != source) {
        _source = source;

        // Set headers.
        [_source.headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString* header, BOOL *stop) {
            [[SDWebImageDownloader sharedDownloader] setValue:header forHTTPHeaderField:key];
        }];

        // Set priority.
        SDWebImageOptions options = 0;
        options |= SDWebImageRetryFailed;
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

        if (_onFastImageLoadStart) {
            _onFastImageLoadStart(@{});
            hasSentOnLoadStart = YES;
        } {
            hasSentOnLoadStart = NO;
        }

        // Load the new source.
        [self sd_setImageWithURL:_source.uri
                placeholderImage:nil
                         options:options
                        progress:^(NSInteger receivedSize, NSInteger expectedSize, NSURL * _Nullable targetURL) {
                            double progress = MIN(1, MAX(0, (double) receivedSize / (double) expectedSize));
                            if (_onFastImageProgress) {
                                _onFastImageProgress(@{
                                    @"loaded": @(receivedSize),
                                    @"total": @(expectedSize)
                                });
                            }
                        } completed:^(UIImage * _Nullable image,
                                      NSError * _Nullable error,
                                      SDImageCacheType cacheType,
                                      NSURL * _Nullable imageURL) {
                            if (error) {
                                if (_onFastImageError) {
                                    _onFastImageError(@{});
                                    if (_onFastImageLoadEnd) {
                                        _onFastImageLoadEnd(@{});
                                    }
                                }
                            } else {
                                if (_onFastImageLoad) {
                                    _onFastImageLoad(@{});
                                    if (_onFastImageLoadEnd) {
                                        _onFastImageLoadEnd(@{});
                                    }
                                }
                            }
                        }];
    }
}

@end

