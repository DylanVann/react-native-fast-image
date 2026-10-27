#pragma once

#include <jsi/jsi.h>
#include <react/renderer/components/RNFastImageSpec/EventEmitters.h>
#include <react/renderer/components/RNFastImageSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <yoga/YGNode.h>

#include "FastImageViewState.h"

namespace facebook::react {

JSI_EXPORT extern const char FastImageViewComponentName[];

// FastImageView's shadow node (Codegen makes the props and events; the spec
// is interfaceOnly). It measures itself from the loaded image's size, as an
// <img> does: a side its style leaves open (e.g. no height, or `auto`)
// follows the image's aspect ratio, and with neither side set it's the
// image's own size. Until an image has loaded, the open sides are 0.
class JSI_EXPORT FastImageViewShadowNode final : public ConcreteViewShadowNode<
                                                     FastImageViewComponentName,
                                                     FastImageViewProps,
                                                     FastImageViewEventEmitter,
                                                     FastImageViewState> {
  public:
    // Yoga takes a node with a measure function for text, which it rounds to
    // the pixel grid differently (sizes rounded up): an image is rounded as
    // any view is, also where its style sets both sides. (Clones copy the
    // node type.)
    template <typename... Args>
    FastImageViewShadowNode(Args &&...args) : ConcreteViewShadowNode(std::forward<Args>(args)...)
    {
        YGNodeSetNodeType(&yogaNode_, YGNodeTypeDefault);
    }

    static ShadowNodeTraits BaseTraits()
    {
        auto traits = ConcreteViewShadowNode::BaseTraits();
        traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
        traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
        return traits;
    }

    Size measureContent(const LayoutContext &layoutContext, const LayoutConstraints &layoutConstraints) const override;
};

} // namespace facebook::react
