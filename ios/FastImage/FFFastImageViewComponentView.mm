#import "FFFastImageViewComponentView.h"

#import <React/RCTConversions.h>
#import <React/RCTConvert.h>
#import <React/RCTFollyConvert.h>
#import <SDWebImage/UIView+WebCache.h>
#import <react/renderer/components/RNFastImageSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNFastImageSpec/EventEmitters.h>
#import <react/renderer/components/RNFastImageSpec/Props.h>
#import <react/renderer/components/RNFastImageSpec/RCTComponentViewHelpers.h>

#import "FFFastImageView.h"
#import "RCTConvert+FFFastImage.h"

using namespace facebook::react;

// A string prop: nil when it's empty (not set).
static NSString *_Nullable FFFString(const std::string &value)
{
    return value.empty() ? nil : [NSString stringWithUTF8String:value.c_str()];
}

// A prop of any type (a source, sources, defaultSource) as JSON: nil when
// it's null (not set).
static id _Nullable FFFJSON(const folly::dynamic &value)
{
    return value.isNull() ? nil : convertFollyDynamicToId(value);
}

@interface FFFastImageViewComponentView () <RCTFastImageViewViewProtocol>
@end

@implementation FFFastImageViewComponentView {
    FFFastImageView *_imageView;
    // The props aren't on the image view yet (a new one): set them all,
    // rather than the ones that changed.
    BOOL _setsAllProps;
    BOOL _propsChanged;
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
        [self makeImageView];
    }
    return self;
}

// A new image view, which sends its events through the component's event
// emitter. It sends them all (Fabric doesn't tell a view which ones JS
// handles), except progress, which it tracks only with trackProgress.
- (void)makeImageView
{
    _imageView = [FFFastImageView new];
    __weak __typeof(self) weakSelf = self;
    _imageView.onFastImageLoadStart = ^(NSDictionary *event) {
        [weakSelf sendEvent:"fastImageLoadStart" payload:event];
    };
    _imageView.onFastImageLoad = ^(NSDictionary *event) {
        [weakSelf sendEvent:"fastImageLoad" payload:event];
    };
    _imageView.onFastImageError = ^(NSDictionary *event) {
        [weakSelf sendEvent:"fastImageError" payload:event];
    };
    _imageView.onFastImageLoadEnd = ^(NSDictionary *event) {
        [weakSelf sendEvent:"fastImageLoadEnd" payload:event];
    };
    _setsAllProps = YES;
    self.contentView = _imageView;
}

// The image view's event as it built it (not the generated event structs,
// which would add the fields an event doesn't have, e.g. width to an error's
// onLoadEnd).
- (void)sendEvent:(std::string)type payload:(NSDictionary *)payload
{
    if (_eventEmitter) {
        _eventEmitter->dispatchEvent(type, convertIdToFollyDynamic(payload ?: @{}));
    }
}

- (void)prepareForRecycle
{
    [super prepareForRecycle];
    // A recycled view shows another image: start from a new image view, as a
    // new view would.
    [_imageView sd_cancelCurrentImageLoad];
    [self makeImageView];
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
    const auto &oldViewProps = *std::static_pointer_cast<const FastImageViewProps>(_props);
    const auto &newViewProps = *std::static_pointer_cast<const FastImageViewProps>(props);
    BOOL all = _setsAllProps;
    _setsAllProps = NO;
    FFFastImageView *view = _imageView;

    if (all || oldViewProps.source != newViewProps.source) {
        view.source = [RCTConvert FFFastImageSource:FFFJSON(newViewProps.source)];
    }
    if (all || oldViewProps.sources != newViewProps.sources) {
        id sources = FFFJSON(newViewProps.sources);
        view.sources = sources ? [RCTConvert FFFastImageSourceArray:sources] : nil;
    }
    if (all || oldViewProps.defaultSource != newViewProps.defaultSource) {
        id defaultSource = FFFJSON(newViewProps.defaultSource);
        view.defaultSource = defaultSource ? [RCTConvert UIImage:defaultSource] : nil;
    }
    if (all || oldViewProps.resizeMode != newViewProps.resizeMode) {
        view.resizeMode = [RCTConvert RCTResizeMode:FFFString(newViewProps.resizeMode)];
    }
    if (all || oldViewProps.tintColor != newViewProps.tintColor) {
        view.imageColor = RCTUIColorFromSharedColor(newViewProps.tintColor);
    }
    if (all || oldViewProps.recyclingKey != newViewProps.recyclingKey) {
        view.recyclingKey = FFFString(newViewProps.recyclingKey);
    }
    if (all || oldViewProps.loopCount != newViewProps.loopCount) {
        view.loopCount = newViewProps.loopCount;
    }
    if (all || oldViewProps.imageRendering != newViewProps.imageRendering) {
        view.imageRendering = FFFString(newViewProps.imageRendering);
    }
    if (all || oldViewProps.paused != newViewProps.paused) {
        view.paused = newViewProps.paused;
    }
    if (all || oldViewProps.transitionDuration != newViewProps.transitionDuration) {
        view.transitionDuration = newViewProps.transitionDuration;
    }
    if (all || oldViewProps.transitionBetweenImages != newViewProps.transitionBetweenImages) {
        view.transitionBetweenImages = newViewProps.transitionBetweenImages;
    }
    if (all || oldViewProps.transitionSkipOnCacheHit != newViewProps.transitionSkipOnCacheHit) {
        view.transitionSkipOnCacheHit = FFFString(newViewProps.transitionSkipOnCacheHit);
    }
    if (all || oldViewProps.downsample != newViewProps.downsample) {
        view.downsample = newViewProps.downsample;
    }
    if (all || oldViewProps.blurRadius != newViewProps.blurRadius) {
        view.blurRadius = newViewProps.blurRadius;
    }
    if (all || oldViewProps.trackProgress != newViewProps.trackProgress) {
        // Used from the next load, as a handler added while loading was.
        if (newViewProps.trackProgress) {
            __weak __typeof(self) weakSelf = self;
            view.onFastImageProgress = ^(NSDictionary *event) {
                [weakSelf sendEvent:"fastImageProgress" payload:event];
            };
        } else {
            view.onFastImageProgress = nil;
        }
    }
    _propsChanged = YES;

    [super updateProps:props oldProps:oldProps];
}

// Once the update's props and layout are all set: the image view loads (for
// its size, which it has by now).
- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask
{
    [super finalizeUpdates:updateMask];
    if (_propsChanged) {
        _propsChanged = NO;
        [_imageView didSetProps:@[]];
    }
}

@end
