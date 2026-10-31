#pragma once

#include <jsi/jsi.h>
#include <react/renderer/components/RNFastImageSpec/EventEmitters.h>
#include <react/renderer/components/RNFastImageSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {

JSI_EXPORT extern const char FastImageViewComponentName[];

// FastImageView's shadow node, as Codegen would make it (the spec is
// interfaceOnly for FastImageAutoView's): no state and no measuring, so an
// image with a set size costs no more than any view.
using FastImageViewShadowNode =
    ConcreteViewShadowNode<FastImageViewComponentName, FastImageViewProps, FastImageViewEventEmitter>;

} // namespace facebook::react
