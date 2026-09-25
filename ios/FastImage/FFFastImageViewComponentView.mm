#import "FFFastImageViewComponentView.h"
#import "FFFastImageView.h"

#import <React/RCTConversions.h>
#import <React/RCTConvert.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/RNFastImageSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNFastImageSpec/EventEmitters.h>
#import <react/renderer/components/RNFastImageSpec/Props.h>
#import <react/renderer/components/RNFastImageSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface FFFastImageViewComponentView () <FFFastImageViewDelegate>
@end

static FFFPriority FFFPriorityFromProp(FastImageViewPriority priority)
{
    switch (priority) {
        case FastImageViewPriority::Low:
            return FFFPriorityLow;
        case FastImageViewPriority::High:
            return FFFPriorityHigh;
        case FastImageViewPriority::Normal:
            return FFFPriorityNormal;
    }
    return FFFPriorityNormal;
}

static FFFCacheControl FFFCacheControlFromProp(FastImageViewCache cache)
{
    switch (cache) {
        case FastImageViewCache::Web:
            return FFFCacheControlWeb;
        case FastImageViewCache::CacheOnly:
            return FFFCacheControlCacheOnly;
        case FastImageViewCache::Immutable:
            return FFFCacheControlImmutable;
    }
    return FFFCacheControlImmutable;
}

static FFFResizeMode FFFResizeModeFromProp(FastImageViewResizeMode resizeMode)
{
    switch (resizeMode) {
        case FastImageViewResizeMode::Contain:
            return FFFResizeModeContain;
        case FastImageViewResizeMode::Stretch:
            return FFFResizeModeStretch;
        case FastImageViewResizeMode::Center:
            return FFFResizeModeCenter;
        case FastImageViewResizeMode::Cover:
            return FFFResizeModeCover;
    }
    return FFFResizeModeCover;
}

static bool FFFSourcesEqual(const FastImageViewSourceStruct &a, const FastImageViewSourceStruct &b)
{
    if (a.provided != b.provided || a.uri != b.uri || a.priority != b.priority || a.cache != b.cache || a.headers.size() != b.headers.size()) {
        return false;
    }
    for (size_t i = 0; i < a.headers.size(); i++) {
        if (a.headers[i].name != b.headers[i].name || a.headers[i].value != b.headers[i].value) {
            return false;
        }
    }
    return true;
}

static bool FFFDefaultSourcesEqual(
    const FastImageViewDefaultSourceStruct &a,
    const FastImageViewDefaultSourceStruct &b)
{
    return a.uri == b.uri && a.width == b.width && a.height == b.height && a.scale == b.scale &&
        a.packagerAsset == b.packagerAsset;
}

// nil for no source. A source without a uri has a nil url (and fails).
static FFFastImageSource *_Nullable FFFSourceFromProp(const FastImageViewSourceStruct &source)
{
    if (!source.provided) {
        return nil;
    }
    NSMutableDictionary<NSString *, NSString *> *headers = [NSMutableDictionary new];
    for (const auto &header : source.headers) {
        headers[RCTNSStringFromString(header.name)] = RCTNSStringFromString(header.value);
    }
    NSURL *url = source.uri.empty() ? nil : [RCTConvert NSURL:RCTNSStringFromString(source.uri)];
    return [[FFFastImageSource alloc] initWithURL:url
                                         priority:FFFPriorityFromProp(source.priority)
                                          headers:headers
                                     cacheControl:FFFCacheControlFromProp(source.cache)];
}

static UIImage *_Nullable FFFDefaultSourceFromProp(const FastImageViewDefaultSourceStruct &source)
{
    if (source.uri.empty()) {
        return nil;
    }
    NSMutableDictionary *json = [@{@"uri": RCTNSStringFromString(source.uri)} mutableCopy];
    if (source.width > 0 && source.height > 0) {
        json[@"width"] = @(source.width);
        json[@"height"] = @(source.height);
    }
    if (source.scale > 0) {
        json[@"scale"] = @(source.scale);
    }
    if (source.packagerAsset) {
        json[@"__packager_asset"] = @YES;
    }
    return [RCTConvert UIImage:json];
}

@implementation FFFastImageViewComponentView {
    FFFastImageView *_imageView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
    return concreteComponentDescriptorProvider<FastImageViewComponentDescriptor>();
}

+ (const std::shared_ptr<const FastImageViewProps> &)defaultProps
{
    static const auto defaultProps = std::make_shared<const FastImageViewProps>();
    return defaultProps;
}

- (instancetype)initWithFrame:(CGRect)frame
{
    if (self = [super initWithFrame:frame]) {
        _props = [FFFastImageViewComponentView defaultProps];
        _imageView = [[FFFastImageView alloc] initWithFrame:self.bounds];
        _imageView.delegate = self;
        self.contentView = _imageView;
    }
    return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
    const auto &oldImageProps = static_cast<const FastImageViewProps &>(*_props);
    const auto &newImageProps = static_cast<const FastImageViewProps &>(*props);

    if (!FFFSourcesEqual(oldImageProps.source, newImageProps.source)) {
        _imageView.source = FFFSourceFromProp(newImageProps.source);
    }
    if (!FFFDefaultSourcesEqual(oldImageProps.defaultSource, newImageProps.defaultSource)) {
        _imageView.defaultSource = FFFDefaultSourceFromProp(newImageProps.defaultSource);
    }
    if (oldImageProps.resizeMode != newImageProps.resizeMode) {
        _imageView.resizeMode = FFFResizeModeFromProp(newImageProps.resizeMode);
    }
    if (oldImageProps.tintColor != newImageProps.tintColor) {
        _imageView.imageColor = newImageProps.tintColor ? RCTUIColorFromSharedColor(newImageProps.tintColor) : nil;
    }
    if (oldImageProps.loopCount != newImageProps.loopCount) {
        _imageView.loopCount = newImageProps.loopCount;
    }
    if (oldImageProps.enableMinificationFilter != newImageProps.enableMinificationFilter) {
        _imageView.enableMinificationFilter = newImageProps.enableMinificationFilter;
    }
    if (oldImageProps.progressEnabled != newImageProps.progressEnabled) {
        _imageView.progressEnabled = newImageProps.progressEnabled;
    }

    [super updateProps:props oldProps:oldProps];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask
{
    [super finalizeUpdates:updateMask];
    // After all of the transaction's updates, so the event emitter is set
    // before the load sends events.
    [_imageView reloadIfNeeded];
}

- (void)prepareForRecycle
{
    [super prepareForRecycle];
    // A recycled view gets its next props compared with these, so start from
    // the defaults, as the image view does below (otherwise the same source
    // on the next use wouldn't load).
    _props = [FFFastImageViewComponentView defaultProps];
    [_imageView reset];
    _imageView.resizeMode = FFFResizeModeCover;
    _imageView.imageColor = nil;
    _imageView.loopCount = -1;
    _imageView.enableMinificationFilter = YES;
    _imageView.progressEnabled = NO;
}

- (NSObject *)accessibilityElement
{
    return _imageView;
}

#pragma mark - FFFastImageViewDelegate

- (const FastImageViewEventEmitter *)imageEventEmitter
{
    return static_cast<const FastImageViewEventEmitter *>(_eventEmitter.get());
}

- (void)fastImageViewDidStartLoading:(FFFastImageView *)view
{
    if (auto emitter = [self imageEventEmitter]) {
        emitter->onFastImageLoadStart({});
    }
}

- (void)fastImageView:(FFFastImageView *)view didProgress:(NSInteger)loaded total:(NSInteger)total
{
    if (auto emitter = [self imageEventEmitter]) {
        emitter->onFastImageProgress({.loaded = (double)loaded, .total = (double)total});
    }
}

- (void)fastImageView:(FFFastImageView *)view didLoadWithSize:(CGSize)size
{
    if (auto emitter = [self imageEventEmitter]) {
        emitter->onFastImageLoad({.width = size.width, .height = size.height});
    }
}

- (void)fastImageView:(FFFastImageView *)view didFailWithError:(NSString *)error
{
    if (auto emitter = [self imageEventEmitter]) {
        emitter->onFastImageError({.error = RCTStringFromNSString(error)});
    }
}

- (void)fastImageViewDidEndLoading:(FFFastImageView *)view
{
    if (auto emitter = [self imageEventEmitter]) {
        emitter->onFastImageLoadEnd({});
    }
}

@end

Class<RCTComponentViewProtocol> FastImageViewCls(void)
{
    return FFFastImageViewComponentView.class;
}
