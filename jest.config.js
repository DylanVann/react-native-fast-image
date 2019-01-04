module.exports = {
    preset: 'react-native',
    transform: {
        '^.+\\.(js)$':
            '<rootDir>/node_modules/react-native/jest/preprocessor.js',
    },
    modulePathIgnorePatterns: [
        'react-native-fast-image-example*',
        'react-native-fast-image-example-cocoapods*',
    ],
}
