// What the app's autolinking includes for the library: Codegen's header (the
// next RNFastImageSpec.h on the include path), and the descriptor of
// FastImageView's own shadow node, which it registers (componentDescriptors
// in react-native.config.js).
#pragma once

#include_next <RNFastImageSpec.h>
#include <react/renderer/components/FastImage/FastImageViewComponentDescriptor.h>
