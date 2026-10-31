// FastImageView's and FastImageAutoView's shadow nodes are the library's own
// (common/cpp; the spec is interfaceOnly), so Android's autolinking builds the
// library's CMakeLists.txt and registers their component descriptors. (iOS
// registers them from FFFastImageViewComponentView and
// FFFastImageAutoViewComponentView.)
module.exports = {
    dependency: {
        platforms: {
            android: {
                componentDescriptors: [
                    'FastImageViewComponentDescriptor',
                    'FastImageAutoViewComponentDescriptor',
                ],
                cmakeListsPath: 'src/main/jni/CMakeLists.txt',
            },
        },
    },
}
