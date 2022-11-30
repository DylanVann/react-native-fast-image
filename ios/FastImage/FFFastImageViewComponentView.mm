#ifdef RCT_NEW_ARCH_ENABLED

#import "FFFastImageViewComponentView.h"
#import "FFFastImageView.h"

#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/rnfastimage/ComponentDescriptors.h>
#import <react/renderer/components/rnfastimage/Props.h>

using namespace facebook::react;

@implementation FFFastImageViewComponentView
{
    FFFastImageView *fastImageView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<FastImageViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
    if (self = [super initWithFrame:frame]) {
        static const auto defaultProps = std::make_shared<const FastImageViewProps>();
        _props = defaultProps;
        fastImageView = [[FFFastImageView alloc] initWithFrame:self.bounds];
        self.contentView = fastImageView;
    }
    return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps{

    const auto &newViewProps = *std::static_pointer_cast<FastImageViewProps const>(props);

    NSString *sourceStr = [NSString stringWithCString:newViewProps.source.uri.c_str() encoding:[NSString defaultCStringEncoding]];
     NSURL *imageUrl = [[NSURL alloc] initWithString:sourceStr];
     FFFastImageSource *imageSource = fastImageView.source;
     if(imageSource == NULL){
         imageSource = [[FFFastImageSource alloc] init];
     }
    imageSource.url = imageUrl;

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
    imageSource.cacheControl = cacheControl;

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

   
    imageSource.priority = priority;
   
    [fastImageView setSource: imageSource];


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
    [fastImageView setResizeMode:resizeMode];
    
    fastImageView.imageColor = RCTUIColorFromSharedColor(newViewProps.tintColor);

    [super updateProps:props oldProps:oldProps];
    [fastImageView didSetProps:nil];
}

- (void)prepareForRecycle
{
    [super prepareForRecycle];
    fastImageView = [[FFFastImageView alloc] initWithFrame:self.bounds];
}

@end

Class<RCTComponentViewProtocol> FastImageViewCls(void)
{
    return FFFastImageViewComponentView.class;
}

#endif
