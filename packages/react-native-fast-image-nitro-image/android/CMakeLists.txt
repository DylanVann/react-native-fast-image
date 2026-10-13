project(FastImageNitroImage)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME FastImageNitroImage)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
)

# The code Nitrogen generated from src/specs.
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/FastImageNitroImage+autolinking.cmake)

include_directories("src/main/cpp")

find_library(LOG_LIB log)
# For the Image type (HybridImageSpec).
find_package(react-native-nitro-image REQUIRED)

target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
        react-native-nitro-image::NitroImage
)
