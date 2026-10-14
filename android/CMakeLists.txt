# The native part of the Nitro HybridObject (src/nitro), built when the app
# has react-native-nitro-image (see build.gradle).
project(FastImage)
cmake_minimum_required(VERSION 3.9.0)

set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

add_library(FastImage SHARED
        src/nitro/cpp/cpp-adapter.cpp
)

# The code Nitrogen generated from src/nitro.
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/FastImage+autolinking.cmake)

find_library(LOG_LIB log)
# For the Image type (HybridImageSpec).
find_package(react-native-nitro-image REQUIRED)

target_link_libraries(
        FastImage
        ${LOG_LIB}
        android
        react-native-nitro-image::NitroImage
)
