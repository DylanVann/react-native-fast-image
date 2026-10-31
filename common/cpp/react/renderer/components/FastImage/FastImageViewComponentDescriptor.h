#pragma once

#include <react/renderer/core/ConcreteComponentDescriptor.h>

#include "FastImageAutoViewShadowNode.h"
#include "FastImageViewShadowNode.h"

namespace facebook::react {

// FastImageView's and FastImageAutoView's descriptors.
template <typename ShadowNodeT>
class FastImageComponentDescriptor final : public ConcreteComponentDescriptor<ShadowNodeT> {
  public:
    using ConcreteComponentDescriptor<ShadowNodeT>::ConcreteComponentDescriptor;

    // Padding doesn't inset the image (it fills the view inside its
    // borders), so it isn't laid out either: the style's padding is cleared
    // from the props Yoga lays the view out from, as they're made: the
    // style's edges, and the logical paddings React Native keeps apart and
    // adds to them as it lays the view out (paddingBlock, paddingInline and
    // their start and end). (Props made without any padding, e.g. the shared
    // default ones, are left as they are.)
    Props::Shared cloneProps(const PropsParserContext &context, const Props::Shared &props, RawProps rawProps)
        const override
    {
        auto cloned = ConcreteComponentDescriptor<ShadowNodeT>::cloneProps(context, props, std::move(rawProps));
        const auto &viewProps = static_cast<const FastImageViewProps &>(*cloned);
        bool padded = viewProps.paddingBlock.isDefined() || viewProps.paddingBlockStart.isDefined() ||
            viewProps.paddingBlockEnd.isDefined() || viewProps.paddingInline.isDefined() ||
            viewProps.paddingInlineStart.isDefined() || viewProps.paddingInlineEnd.isDefined();
        for (auto edge : kEdges) {
            padded = padded || viewProps.yogaStyle.padding(edge).isDefined();
        }
        if (padded) {
            auto &unpadded = const_cast<FastImageViewProps &>(viewProps);
            for (auto edge : kEdges) {
                unpadded.yogaStyle.setPadding(edge, yoga::StyleLength::undefined());
            }
            unpadded.paddingBlock = yoga::StyleLength::undefined();
            unpadded.paddingBlockStart = yoga::StyleLength::undefined();
            unpadded.paddingBlockEnd = yoga::StyleLength::undefined();
            unpadded.paddingInline = yoga::StyleLength::undefined();
            unpadded.paddingInlineStart = yoga::StyleLength::undefined();
            unpadded.paddingInlineEnd = yoga::StyleLength::undefined();
        }
        return cloned;
    }

  private:
    static constexpr yoga::Edge kEdges[] = {
        yoga::Edge::Left,
        yoga::Edge::Top,
        yoga::Edge::Right,
        yoga::Edge::Bottom,
        yoga::Edge::Start,
        yoga::Edge::End,
        yoga::Edge::Horizontal,
        yoga::Edge::Vertical,
        yoga::Edge::All,
    };
};

using FastImageViewComponentDescriptor = FastImageComponentDescriptor<FastImageViewShadowNode>;
using FastImageAutoViewComponentDescriptor = FastImageComponentDescriptor<FastImageAutoViewShadowNode>;

} // namespace facebook::react
