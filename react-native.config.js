// FastImageView's shadow node is the library's own (common/cpp; the spec is
// interfaceOnly), so Android's autolinking builds the library's CMakeLists.txt
// and registers its component descriptor. (iOS registers it from
// FFFastImageViewComponentView.)
module.exports = {
    dependency: {
        platforms: {
            android: {
                componentDescriptors: ['FastImageViewComponentDescriptor'],
                cmakeListsPath: 'src/main/jni/CMakeLists.txt',
            },
        },
    },
}
