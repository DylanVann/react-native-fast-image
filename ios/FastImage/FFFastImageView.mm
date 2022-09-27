#import "FFFastImageView.h"
#import "RCTFabricComponentsPlugins.h"
#import <SDWebImage/UIImage+MultiFormat.h>
#import <SDWebImage/UIView+WebCache.h>

using namespace facebook::react;

@interface FFFastImageView () <RCTFastImageViewViewProtocol>

@property(nonatomic, assign) BOOL hasSentOnLoadStart;
@property(nonatomic, assign) BOOL hasCompleted;
@property(nonatomic, assign) BOOL hasErrored;
// Whether the latest change of props requires the image to be reloaded
@property(nonatomic, assign) BOOL needsReload;

@property(nonatomic, strong) NSDictionary* onLoadEvent;

@end

@implementation FFFastImageView

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<FastImageViewComponentDescriptor>();
}

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
            [self setImage: image];
            if (self.onFastImageProgress) {
                self.onFastImageProgress(@{
                        @"loaded": @(1),
                        @"total": @(1)
                });
            }
            self.hasCompleted = YES;
            [self sendOnLoad: image];

            if (self.onFastImageLoadEnd) {
                self.onFastImageLoadEnd(@{});
            }
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

        if (self.onFastImageLoadStart) {
            self.onFastImageLoadStart(@{});
            self.hasSentOnLoadStart = YES;
        } else {
            self.hasSentOnLoadStart = NO;
        }
        self.hasCompleted = NO;
        self.hasErrored = NO;

        [self downloadImage: _source options: options context: context];
    } else if (_defaultSource) {
        [self setImage: _defaultSource];
    }
}

- (void) downloadImage: (FFFastImageSource*)source options: (SDWebImageOptions)options context: (SDWebImageContext*)context {
    [self sd_setImageWithURL: _source.url
            placeholderImage: _defaultSource
                     options: options
                     context: context
                    progress: ^(NSInteger receivedSize, NSInteger expectedSize, NSURL* _Nullable targetURL) {
                        if (self.onFastImageProgress) {
                            self.onFastImageProgress(@{
                                    @"loaded": @(receivedSize),
                                    @"total": @(expectedSize)
                            });
                        }
                    } completed: ^(UIImage* _Nullable image,
                    NSError* _Nullable error,
                    SDImageCacheType cacheType,
                    NSURL* _Nullable imageURL) {
                if (error) {
                    self.hasErrored = YES;
                    if (self.onFastImageError) {
                        self.onFastImageError(@{});
                    }
                    if (self.onFastImageLoadEnd) {
                        self.onFastImageLoadEnd(@{});
                    }
                } else {
                    self.hasCompleted = YES;
                    [self sendOnLoad: image];
                    if (self.onFastImageLoadEnd) {
                        self.onFastImageLoadEnd(@{});
                    }
                }
            }];
}

- (void) dealloc {
    [self sd_cancelCurrentImageLoad];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps{
    
  const auto &oldViewProps = *std::static_pointer_cast<FastImageViewProps const>(oldProps);
  const auto &newViewProps = *std::static_pointer_cast<FastImageViewProps const>(props);
    
    if(oldProps==nil || oldViewProps.source.uri.compare(newViewProps.source.uri) != 0){
        NSString *sourceStr = [NSString stringWithCString:newViewProps.source.uri.c_str() encoding:[NSString defaultCStringEncoding]];
         NSURL *imageUrl = [[NSURL alloc] initWithString:sourceStr];
         FFFastImageSource *imageSource = _source;
         if(imageSource == NULL){
             imageSource = [[FFFastImageSource alloc] init];
         }
        imageSource.url = imageUrl;
        [self setSource: imageSource];
        _needsReload = YES;
        [self reloadImage];
    }
    
    if(oldProps==nil || oldViewProps.source.cache != newViewProps.source.cache){
        FFFCacheControl cacheControl;
        switch (newViewProps.source.cache) {
            case FastImageViewCache::Web:
                cacheControl = FFFCacheControl::FFFCacheControlWeb;
                break;
            case FastImageViewCache::CacheOnly:
                cacheControl = FFFCacheControl::FFFCacheControlCacheOnly;
                break;
            case FastImageViewCache::Immutable:
            default:
                cacheControl = FFFCacheControl::FFFCacheControlImmutable;
                break;
        }
        FFFastImageSource *imageSource = _source;
        if(imageSource == NULL){
            imageSource = [[FFFastImageSource alloc] init];
        }
       imageSource.cacheControl = cacheControl;
       [self setSource: imageSource];
       _needsReload = YES;
       [self reloadImage];
    }
    
    if(oldProps==nil || oldViewProps.source.priority != newViewProps.source.priority){
        FFFPriority priority;
        switch (newViewProps.source.priority) {
            case FastImageViewPriority::Low:
                priority = FFFPriority::FFFPriorityLow;
                break;
            case FastImageViewPriority::Normal:
                priority = FFFPriority::FFFPriorityNormal;
                break;
            case FastImageViewPriority::High:
            default:
                priority = FFFPriority::FFFPriorityHigh;
                break;
        }
        FFFastImageSource *imageSource = _source;
        if(imageSource == NULL){
            imageSource = [[FFFastImageSource alloc] init];
        }
       imageSource.priority = priority;
       [self setSource: imageSource];
       _needsReload = YES;
       [self reloadImage];
    }
    
    if(oldProps==nil || oldViewProps.resizeMode != newViewProps.resizeMode){
        RCTResizeMode resizeMode;
        switch (newViewProps.resizeMode) {
            case FastImageViewResizeMode::Contain:
                resizeMode = RCTResizeMode::RCTResizeModeContain;
                break;
            case FastImageViewResizeMode::Stretch:
                resizeMode = RCTResizeMode::RCTResizeModeStretch;
                break;
            case FastImageViewResizeMode::Center:
                resizeMode = RCTResizeMode::RCTResizeModeCenter;
                break;
            case FastImageViewResizeMode::Cover:
            default:
                    resizeMode = RCTResizeMode::RCTResizeModeCover;
                break;
        }
        [self setResizeMode: resizeMode];
        _needsReload = YES;
    }
    
  [super updateProps:props oldProps:oldProps];
}

@end

Class<RCTComponentViewProtocol> FastImageViewCls(void)
{
  return FFFastImageView.class;
}
