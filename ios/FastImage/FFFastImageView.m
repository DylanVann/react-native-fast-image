#import "FFFastImageView.h"

@implementation FFFastImageView

- (void)setResizeMode:(RCTResizeMode)resizeMode
{
    if (_resizeMode != resizeMode) {
        _resizeMode = resizeMode;
        self.contentMode = (UIViewContentMode)resizeMode;
    }
}

- (void)setSource:(FFFastImageSource *)source {
    if (_source != source) {
        // Cancel any previous image loading in progress.
        [self sd_cancelCurrentAnimationImagesLoad];

        // Set headers.
        [source.headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString* header, BOOL *stop) {
            [[SDWebImageDownloader sharedDownloader] setValue:header forHTTPHeaderField:key];
        }];

        // Set priority.
        SDWebImageOptions options = 0;
        options |= SDWebImageRetryFailed;
        switch (source.priority) {
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

        // Load the new source.
        [self sd_setImageWithURL:source.uri
                placeholderImage:nil
                         options:options
                       completed:^(UIImage *image,
                                   NSError *error,
                                   SDImageCacheType cacheType,
                                   NSURL *imageURL) {
                           if (error) {
                             if (_onError) {
                               _onError(@{});
                             }
                           } else {
                             if (_onLoad) {
                               _onLoad(@{});
                             }
                           }
                       }];
    }
}

- (void)removeFromSuperview {
    // Cancel any loading.
    [self sd_cancelCurrentAnimationImagesLoad];
    [super removeFromSuperview];
}

@end
