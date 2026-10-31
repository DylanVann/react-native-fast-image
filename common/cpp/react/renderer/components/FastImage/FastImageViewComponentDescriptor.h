#pragma once

#include <react/renderer/core/ConcreteComponentDescriptor.h>

#include "FastImageViewShadowNode.h"

namespace facebook::react {

class FastImageViewComponentDescriptor final : public ConcreteComponentDescriptor<FastImageViewShadowNode> {
  public:
    using ConcreteComponentDescriptor::ConcreteComponentDescriptor;

    // Padding doesn't inset the image (it fills the view inside its
    // borders), so it isn't laid out either: the style's padding is cleared
    // from the props Yoga lays the view out from, as they're made. (Props
    // made without any padding, e.g. the shared default ones, are left as
    // they are.)
    Props::Shared cloneProps(const PropsParserContext &context, const Props::Shared &props, RawProps rawProps)
        const override
    {
        auto cloned = ConcreteComponentDescriptor::cloneProps(context, props, std::move(rawProps));
        const auto &style = static_cast<const FastImageViewProps &>(*cloned).yogaStyle;
        bool padded = false;
        for (auto edge : kEdges) {
            padded = padded || !style.padding(edge).isUndefined();
        }
        if (padded) {
            auto &unpadded = const_cast<FastImageViewProps &>(static_cast<const FastImageViewProps &>(*cloned));
            for (auto edge : kEdges) {
                unpadded.yogaStyle.setPadding(edge, yoga::StyleLength::undefined());
            }
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

} // namespace facebook::react
