#import "FFFastImageViewComponentView.h"

#import <React/RCTConversions.h>
#import <React/RCTConvert.h>
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

// A value from JS as the objects React Native's converters (RCTConvert) take,
// with NSNull for null. (React Native's own converters aren't available to a
// library: React/RCTFollyConvert.h is a private header of React-Core, and
// react/utils/FollyConvert.h isn't on a library's header search paths when
// the app builds React Native from source with use_frameworks!, e.g. 0.83's.)
static id FFFObjectFromDynamic(const folly::dynamic &value)
{
    switch (value.type()) {
        case folly::dynamic::BOOL:
            return @(value.getBool());
        case folly::dynamic::INT64:
            return @(value.getInt());
        case folly::dynamic::DOUBLE:
            return @(value.getDouble());
        case folly::dynamic::STRING: {
            const std::string &string = value.getString();
            return [[NSString alloc] initWithBytes:string.data() length:string.size() encoding:NSUTF8StringEncoding] ?: @"";
        }
        case folly::dynamic::ARRAY: {
            NSMutableArray *array = [NSMutableArray arrayWithCapacity:value.size()];
            for (const auto &item : value) {
                [array addObject:FFFObjectFromDynamic(item)];
            }
            return array;
        }
        case folly::dynamic::OBJECT: {
            NSMutableDictionary *dictionary = [NSMutableDictionary dictionaryWithCapacity:value.size()];
            for (const auto &pair : value.items()) {
                if (pair.first.isString()) {
                    // As a string value: never nil (dictionary[nil] throws).
                    dictionary[FFFObjectFromDynamic(pair.first)] = FFFObjectFromDynamic(pair.second);
                }
            }
            return dictionary;
        }
        default:
            return (id)kCFNull;
    }
}

// An event's payload (dictionaries of strings, numbers and booleans) for the
// event emitter.
static folly::dynamic FFFDynamicFromObject(id value)
{
    if ([value isKindOfClass:NSDictionary.class]) {
        folly::dynamic object = folly::dynamic::object();
        for (id key in (NSDictionary *)value) {
            if ([key isKindOfClass:NSString.class]) {
                object[RCTStringFromNSString(key)] = FFFDynamicFromObject(((NSDictionary *)value)[key]);
            }
        }
        return object;
    }
    if ([value isKindOfClass:NSArray.class]) {
        folly::dynamic array = folly::dynamic::array();
        for (id item in (NSArray *)value) {
            array.push_back(FFFDynamicFromObject(item));
        }
        return array;
    }
    if ([value isKindOfClass:NSString.class]) {
        // "" when it has no UTF-8 form (UTF8String is NULL for a string with
        // a lone surrogate), as React Native's conversions do.
        return RCTStringFromNSString(value);
    }
    if ([value isKindOfClass:NSNumber.class]) {
        if (CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
            return (bool)[value boolValue];
        }
        if (CFNumberIsFloatType((__bridge CFNumberRef)value)) {
            return [value doubleValue];
        }
        return (int64_t)[value longLongValue];
    }
    return nullptr;
}

// A prop of any type (a source, sources, defaultSource) as JSON: nil when
// it's null (not set).
static id _Nullable FFFJSON(const folly::dynamic &value)
{
    return value.isNull() ? nil : FFFObjectFromDynamic(value);
}

// The events JS has a handler for: the handledEvents prop's bits (see
// src/specs/FastImageViewNativeComponent.ts).
typedef NS_OPTIONS(int32_t, FFFEvent) {
    FFFEventLoadStart = 1 << 0,
    FFFEventProgress = 1 << 1,
    FFFEventLoad = 1 << 2,
    FFFEventError = 1 << 3,
    FFFEventLoadEnd = 1 << 4,
};

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
    }
    return self;
}

// A new image view, made with the view's first props after it's created or
// recycled (see updateProps), which sends its events through the component's
// event emitter: the ones JS has a handler for (see sendEvent:).
- (void)makeImageView
{
    _imageView = [FFFastImageView new];
    __weak __typeof(self) weakSelf = self;
    _imageView.onFastImageLoadStart = ^(NSDictionary *event) {
        [weakSelf sendEvent:FFFEventLoadStart type:"fastImageLoadStart" payload:event];
    };
    _imageView.onFastImageProgress = ^(NSDictionary *event) {
        [weakSelf sendEvent:FFFEventProgress type:"fastImageProgress" payload:event];
    };
    _imageView.onFastImageLoad = ^(NSDictionary *event) {
        [weakSelf sendEvent:FFFEventLoad type:"fastImageLoad" payload:event];
    };
    _imageView.onFastImageError = ^(NSDictionary *event) {
        [weakSelf sendEvent:FFFEventError type:"fastImageError" payload:event];
    };
    _imageView.onFastImageLoadEnd = ^(NSDictionary *event) {
        [weakSelf sendEvent:FFFEventLoadEnd type:"fastImageLoadEnd" payload:event];
    };
    _setsAllProps = YES;
    self.contentView = _imageView;
    _imageView.frame = RCTCGRectFromRect(_layoutMetrics.getPaddingFrame());
}

// Padding doesn't inset the image: it fills the view inside its borders (the
// padding box), as on Android. React Native lays the content view out inside
// the padding too; its clipping mask for an image view (the padding box's
// corners, in the image view's bounds) then fits it exactly.
- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
    [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
    _imageView.frame = RCTCGRectFromRect(layoutMetrics.getPaddingFrame());
}

// The image view's event as it built it (not the generated event structs,
// which would add the fields an event doesn't have, e.g. width to an error's
// onLoadEnd), if JS has a handler for it as it happens: most images have
// none, and each event would be converted and dispatched to JS for nothing.
- (void)sendEvent:(FFFEvent)event type:(std::string)type payload:(NSDictionary *)payload
{
    const auto &props = *std::static_pointer_cast<const FastImageViewProps>(_props);
    if (_eventEmitter && (props.handledEvents & event)) {
        _eventEmitter->dispatchEvent(type, FFFDynamicFromObject(payload ?: @{}));
    }
}

// React Native sets the accessibility props on this view (its
// accessibilityElement), but RCTViewComponentView answers isAccessibilityElement
// with its content view's, which is NO for an image view: `accessible` did
// nothing. (React Native's Image makes its image view the accessibilityElement
// instead, which doesn't work here: a recycled view gets a new image view,
// without the props that didn't change.)
- (BOOL)isAccessibilityElement
{
    return std::static_pointer_cast<const FastImageViewProps>(_props)->accessible;
}

- (void)prepareForRecycle
{
    [super prepareForRecycle];
    // A recycled view shows another image: it gets a new image view when it's
    // used again (see updateProps), as a new view does, and has none while it
    // waits in React Native's pool, where it may stay unused. The old one
    // stops: removing it autoreleases it, and a load that finished just before
    // can still reach it from the main queue after this view has its next
    // element's event emitter.
    [_imageView stop];
    _imageView = nil;
    self.contentView = nil;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
    if (!_imageView) {
        [self makeImageView];
    }
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
        view.resizeMode = [RCTConvert FFFResizeMode:FFFString(newViewProps.resizeMode)];
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
    if (all || oldViewProps.handledEvents != newViewProps.handledEvents) {
        // Progress is tracked from the next load, as a handler added while
        // loading was. (Each event is sent if it has a handler as it happens:
        // see sendEvent:.)
        view.trackProgress = (newViewProps.handledEvents & FFFEventProgress) != 0;
    }
    _propsChanged = YES;

    [super updateProps:props oldProps:oldProps];
}

// Once the update's props and layout are all set: the image view loads (for
// its size, which it has by now).
- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask
{
    [super finalizeUpdates:updateMask];
    // RCTViewComponentView masks its image view subviews to the border radius
    // while it clips (invalidateLayer), and leaves the mask when overflow
    // becomes visible.
    if (!std::static_pointer_cast<const FastImageViewProps>(_props)->getClipsContentToBounds()) {
        _imageView.layer.mask = nil;
    }
    if (_propsChanged) {
        _propsChanged = NO;
        [_imageView didSetProps];
    }
}

@end

