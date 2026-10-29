#include "FastImageViewShadowNode.h"

#include <algorithm>
#include <cmath>

#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>

namespace facebook::react {

const char FastImageViewComponentName[] = "FastImageView";

// Yoga only asks for a side the style leaves open: a set width (or one from
// the parent, e.g. stretched) comes as minimum = maximum, an open one as 0 to
// the space there is (or infinity). Its sizes are the content box's, inside
// the padding, but the image fills the padding box (padding doesn't inset
// it), so that's what has the image's shape.
Size FastImageViewShadowNode::measureContent(
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
    const auto ratio = std::isnan(styleRatio) || styleRatio <= 0 ? image.width / image.height : styleRatio;
    // Yoga has resolved the padding by now (it measures with it).
    const Float paddingX =
        YGNodeLayoutGetPadding(&yogaNode_, YGEdgeLeft) + YGNodeLayoutGetPadding(&yogaNode_, YGEdgeRight);
    const Float paddingY =
        YGNodeLayoutGetPadding(&yogaNode_, YGEdgeTop) + YGNodeLayoutGetPadding(&yogaNode_, YGEdgeBottom);
    const auto forWidth = [&](Float width) -> Size {
        return {width, std::max<Float>(0, (width + paddingX) / ratio - paddingY)};
    };
    const auto forHeight = [&](Float height) -> Size {
        return {std::max<Float>(0, (height + paddingY) * ratio - paddingX), height};
    };
    const auto &minimum = layoutConstraints.minimumSize;
    const auto &maximum = layoutConstraints.maximumSize;
    Size size;
    if (minimum.width == maximum.width) {
        size = forWidth(maximum.width);
    } else if (minimum.height == maximum.height) {
        size = forHeight(maximum.height);
    } else {
        // The image's own width, and the height its shape (or the style's
        // ratio) gives, scaled down to fit the space there is.
        size = forWidth(std::max<Float>(0, image.width - paddingX));
        if (size.width > maximum.width) {
            size = forWidth(maximum.width);
        }
        if (size.height > maximum.height) {
            size = forHeight(maximum.height);
        }
    }
    return layoutConstraints.clamp(size);
}

FastImageViewShadowNode::FastImageViewShadowNode(
    const ShadowNode &sourceShadowNode,
    const ShadowNodeFragment &fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment)
{
    YGNodeSetNodeType(&yogaNode_, YGNodeTypeDefault);
    const auto &source = static_cast<const FastImageViewShadowNode &>(sourceShadowNode);
    if (fragment.state) {
        const auto &previous = source.getStateData();
        const auto &image = getStateData();
        imageSizeChanged_ = image.width != previous.width || image.height != previous.height;
    }
    if (fragment.props) {
        const auto &previous = source.getConcreteProps();
        const auto &props = getConcreteProps();
        imageSizeChanged_ =
            imageSizeChanged_ || props.ownWidth != previous.ownWidth || props.ownHeight != previous.ownHeight;
    }
}

bool FastImageViewShadowNode::shouldNewRevisionDirtyMeasurement(
    const ShadowNode & /*sourceShadowNode*/,
    const ShadowNodeFragment & /*fragment*/) const
{
    return imageSizeChanged_;
}

} // namespace facebook::react
