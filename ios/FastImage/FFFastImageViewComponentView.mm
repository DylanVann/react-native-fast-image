#ifdef RCT_NEW_ARCH_ENABLED

#import "FFFastImageViewComponentView.h"
#import "RCTConvert+FFFastImage.h"
#import "FFFastImageView.h"

#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/rnfastimage/ComponentDescriptors.h>
#import <react/renderer/components/rnfastimage/Props.h>
#import <react/renderer/components/rnfastimage/EventEmitters.h>

using namespace facebook::react;

@implementation FFFastImageViewComponentView
{
    FFFastImageView *fastImageView;
    BOOL _shouldPostponeUpdate;
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

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
    const auto &newViewProps = *std::static_pointer_cast<FastImageViewProps const>(props);

    NSMutableDictionary *imageSourcePropsDict = [NSMutableDictionary new];
    imageSourcePropsDict[@"uri"] = RCTNSStringFromStringNilIfEmpty(newViewProps.source.uri);
    NSMutableDictionary* headers = [[NSMutableDictionary alloc] init];
    for (auto & element : newViewProps.source.headers) {
        [headers setValue:RCTNSStringFromString(element.value) forKey:RCTNSStringFromString(element.name)];
    }
    if (headers.count > 0) {
        imageSourcePropsDict[@"headers"] = headers;
    }

    NSString *cacheControl;
    switch (newViewProps.source.cache) {
        case FastImageViewCache::Web:
            cacheControl = @"web";
            break;
        case FastImageViewCache::CacheOnly:
            cacheControl = @"cacheOnly";
            break;
        case FastImageViewCache::Immutable:
        default:
            cacheControl = @"immutable";
            break;
    }
    imageSourcePropsDict[@"cache"] = cacheControl;

    NSString *priority;
    switch (newViewProps.source.priority) {
        case FastImageViewPriority::Low:
            priority = @"low";
            break;
        case FastImageViewPriority::Normal:
            priority = @"normal";
            break;
        case FastImageViewPriority::High:
        default:
            priority = @"high";
            break;
    }
    imageSourcePropsDict[@"priority"] = priority;
    FFFastImageSource *imageSource = [RCTConvert FFFastImageSource:imageSourcePropsDict];

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
    // this method decides whether to reload the image based on changed props
    // so we call it after updating the props. If the _eventEmitter is not present yet,
    // we postpone the update till it is set in `updateEventEmitter` since we want to send
    // events to JS.
    if (!_eventEmitter) {
        _shouldPostponeUpdate = YES;
    } else {
        _shouldPostponeUpdate = NO;
        [fastImageView didSetProps:nil];
    }
}

- (void)updateEventEmitter:(const facebook::react::EventEmitter::Shared &)eventEmitter
{
    [super updateEventEmitter:eventEmitter];
    assert(std::dynamic_pointer_cast<FastImageViewEventEmitter const>(eventEmitter));
    [fastImageView setEventEmitter:std::static_pointer_cast<FastImageViewEventEmitter const>(eventEmitter)];
    if (_shouldPostponeUpdate) {
        // we do the update here since it is the moment we can send events to JS
        [fastImageView didSetProps:nil];
    }
}

- (void)prepareForRecycle
{
    [super prepareForRecycle];
    fastImageView = [[FFFastImageView alloc] initWithFrame:self.bounds];
    self.contentView = fastImageView;
}

@end

Class<RCTComponentViewProtocol> FastImageViewCls(void)
{
    return FFFastImageViewComponentView.class;
}

#endif
