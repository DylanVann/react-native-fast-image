# Codegen's library for the specs (src/specs), with FastImageView's shadow node
# (common/cpp), which the spec leaves to the library (interfaceOnly). Set as
# the library's cmakeListsPath (react-native.config.js), in place of the
# CMakeLists.txt Codegen writes, which builds the same library from its files
# only.
cmake_minimum_required(VERSION 3.13)

set(FASTIMAGE_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../..)
set(FASTIMAGE_COMMON_DIR ${FASTIMAGE_ANDROID_DIR}/../common/cpp)
set(FASTIMAGE_CODEGEN_DIR ${FASTIMAGE_ANDROID_DIR}/build/generated/source/codegen/jni)

file(GLOB react_codegen_SRCS CONFIGURE_DEPENDS
  ${FASTIMAGE_CODEGEN_DIR}/*.cpp
  ${FASTIMAGE_CODEGEN_DIR}/react/renderer/components/RNFastImageSpec/*.cpp
  ${FASTIMAGE_COMMON_DIR}/react/renderer/components/FastImage/*.cpp)

add_library(
  react_codegen_RNFastImageSpec
  OBJECT
  ${react_codegen_SRCS}
)

# This folder first: its RNFastImageSpec.h, which the app's autolinking
# includes, adds the shadow node's component descriptor to Codegen's.
target_include_directories(
  react_codegen_RNFastImageSpec
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${FASTIMAGE_CODEGEN_DIR}
  ${FASTIMAGE_CODEGEN_DIR}/react/renderer/components/RNFastImageSpec
  ${FASTIMAGE_COMMON_DIR}
)

target_link_libraries(
  react_codegen_RNFastImageSpec
  fbjni
  jsi
  reactnative
)

# PUBLIC: RN_SERIALIZABLE_STATE changes FastImageViewState, which the app's
# autolinking code sees too.
target_compile_reactnative_options(react_codegen_RNFastImageSpec PUBLIC)
