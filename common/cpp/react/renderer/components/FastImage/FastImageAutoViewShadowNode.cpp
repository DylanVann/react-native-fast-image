#include "FastImageAutoViewShadowNode.h"

#include <cmath>

#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>

namespace facebook::react {

const char FastImageAutoViewComponentName[] = "FastImageAutoView";

// Yoga only asks for a side the style leaves open: a set width (or one from
// the parent, e.g. stretched) comes as minimum = maximum, an open one as 0 to
// the space there is (or infinity). Its sizes are the box inside the borders,
// which the image fills (padding is always 0, see
// FastImageViewComponentDescriptor).
Size FastImageAutoViewShadowNode::measureContent(
    const LayoutContext & /*layoutContext*/,
    const LayoutConstraints &layoutConstraints) const
{
    // A single source's own size (see the ownWidth prop), or the loaded
    // image's, which the native views put in the state.
    const auto &props = getConcreteProps();
    const auto &state = getStateData();
    const bool own = props.ownWidth > 0 && props.ownHeight > 0;
    const Size image = own ? Size{props.ownWidth, props.ownHeight} : Size{state.width, state.height};
    if (image.width <= 0 || image.height <= 0) {
        return layoutConstraints.clamp({0, 0});
    }
    // The style's aspectRatio (NaN if it has none) wins over the image's:
    // Yoga applies it to the size measured here, so a size of the image's
    // shape would come out smaller (with neither side set, the height from
    // the image's shape, then the width from the style's ratio).
    const auto styleRatio = YGNodeStyleGetAspectRatio(&yogaNode_);
    const bool hasStyleRatio = !std::isnan(styleRatio) && styleRatio > 0;
    const auto ratio = hasStyleRatio ? styleRatio : image.width / image.height;
    // The sides that follow it: those the style sets to auto (the autoSize
    // prop's bits; a side left out stays 0, as with React Native's Image), or
    // with an own size, every side Yoga asks for. With the style's aspect
    // ratio, the other side comes from the one that follows.
    int sides = own ? 3 : props.autoSize;
    if (hasStyleRatio && sides != 0) {
        sides = 3;
    }
    const bool followsWidth = (sides & 1) != 0;
    const bool followsHeight = (sides & 2) != 0;
    if (!followsWidth && !followsHeight) {
        return layoutConstraints.clamp({0, 0});
    }
    const auto forWidth = [&](Float width) -> Size { return {width, width / ratio}; };
    const auto forHeight = [&](Float height) -> Size { return {height * ratio, height}; };
    const auto &minimum = layoutConstraints.minimumSize;
    const auto &maximum = layoutConstraints.maximumSize;
    Size size;
    if (minimum.width == maximum.width) {
        size = followsHeight ? forWidth(maximum.width) : Size{maximum.width, 0};
    } else if (minimum.height == maximum.height) {
        size = followsWidth ? forHeight(maximum.height) : Size{0, maximum.height};
    } else if (!followsWidth || !followsHeight) {
        // The side that follows, from the other's 0.
        size = {0, 0};
    } else {
        // The image's own width, and the height its shape (or the style's
        // ratio) gives, scaled down to fit the space there is.
        size = forWidth(image.width);
        if (size.width > maximum.width) {
            size = forWidth(maximum.width);
        }
        if (size.height > maximum.height) {
            size = forHeight(maximum.height);
        }
    }
    return layoutConstraints.clamp(size);
}

FastImageAutoViewShadowNode::FastImageAutoViewShadowNode(
    const ShadowNode &sourceShadowNode,
    const ShadowNodeFragment &fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment)
{
    YGNodeSetNodeType(&yogaNode_, YGNodeTypeDefault);
    const auto &source = static_cast<const FastImageAutoViewShadowNode &>(sourceShadowNode);
    if (fragment.state) {
        const auto &previous = source.getStateData();
        const auto &image = getStateData();
        imageSizeChanged_ = image.width != previous.width || image.height != previous.height;
    }
    if (fragment.props) {
        const auto &previous = source.getConcreteProps();
        const auto &props = getConcreteProps();
        imageSizeChanged_ = imageSizeChanged_ || props.ownWidth != previous.ownWidth ||
            props.ownHeight != previous.ownHeight || props.autoSize != previous.autoSize;
    }
}

bool FastImageAutoViewShadowNode::shouldNewRevisionDirtyMeasurement(
    const ShadowNode & /*sourceShadowNode*/,
    const ShadowNodeFragment & /*fragment*/) const
{
    return imageSizeChanged_;
}

} // namespace facebook::react
