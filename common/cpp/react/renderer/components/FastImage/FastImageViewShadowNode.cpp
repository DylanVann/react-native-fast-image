#include "FastImageViewShadowNode.h"

#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>

namespace facebook::react {

const char FastImageViewComponentName[] = "FastImageView";

// Yoga only asks for a side the style leaves open: a set width (or one from
// the parent, e.g. stretched) comes as minimum = maximum, an open one as 0 to
// the space there is (or infinity).
Size FastImageViewShadowNode::measureContent(
    const LayoutContext & /*layoutContext*/,
    const LayoutConstraints &layoutConstraints) const
{
    const auto &image = getStateData();
    if (image.width <= 0 || image.height <= 0) {
        return layoutConstraints.clamp({0, 0});
    }
    const auto ratio = image.width / image.height;
    const auto &minimum = layoutConstraints.minimumSize;
    const auto &maximum = layoutConstraints.maximumSize;
    Size size;
    if (minimum.width == maximum.width) {
        size = {maximum.width, maximum.width / ratio};
    } else if (minimum.height == maximum.height) {
        size = {maximum.height * ratio, maximum.height};
    } else {
        // The image's own size, scaled down to fit the space there is,
        // keeping its shape.
        size = {image.width, image.height};
        if (size.width > maximum.width) {
            size = {maximum.width, maximum.width / ratio};
        }
        if (size.height > maximum.height) {
            size = {maximum.height * ratio, maximum.height};
        }
    }
    return layoutConstraints.clamp(size);
}

} // namespace facebook::react
