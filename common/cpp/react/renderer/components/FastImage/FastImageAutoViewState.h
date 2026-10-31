#pragma once

#include <react/renderer/graphics/Float.h>

#ifdef RN_SERIALIZABLE_STATE
#include <folly/dynamic.h>
#endif

namespace facebook::react {

// The view's state: the loaded image's own size in points (0 until an image
// has loaded), which the native views set as one loads. The view's size
// follows it where its style leaves it open (see FastImageAutoViewShadowNode).
class FastImageAutoViewState final {
  public:
    FastImageAutoViewState() = default;
    FastImageAutoViewState(Float width, Float height) : width(width), height(height) {}

    Float width{0};
    Float height{0};

#ifdef RN_SERIALIZABLE_STATE
    // Android's view sets it as a map ({ width, height }).
    FastImageAutoViewState(const FastImageAutoViewState &previousState, folly::dynamic data)
        : width(static_cast<Float>(data.getDefault("width", 0).asDouble())),
          height(static_cast<Float>(data.getDefault("height", 0).asDouble()))
    {
    }

    folly::dynamic getDynamic() const
    {
        return folly::dynamic::object("width", width)("height", height);
    }
#endif
};

} // namespace facebook::react
