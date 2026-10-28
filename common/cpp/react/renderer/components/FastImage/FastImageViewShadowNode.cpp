#include "FastImageViewShadowNode.h"

#include <algorithm>

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
    const auto &image = getStateData();
    if (image.width <= 0 || image.height <= 0) {
        return layoutConstraints.clamp({0, 0});
    }
    const auto ratio = image.width / image.height;
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
        // The image's own size, scaled down to fit the space there is,
        // keeping its shape.
        size = {
            std::max<Float>(0, image.width - paddingX),
            std::max<Float>(0, image.height - paddingY)};
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
    if (fragment.state) {
        const auto &previous = static_cast<const FastImageViewShadowNode &>(sourceShadowNode).getStateData();
        const auto &image = getStateData();
        imageSizeChanged_ = image.width != previous.width || image.height != previous.height;
    }
}

bool FastImageViewShadowNode::shouldNewRevisionDirtyMeasurement(
    const ShadowNode & /*sourceShadowNode*/,
    const ShadowNodeFragment & /*fragment*/) const
{
    return imageSizeChanged_;
}

} // namespace facebook::react
