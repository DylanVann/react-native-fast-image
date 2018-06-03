const path = require('path');
const blacklist = require('metro/src/blacklist');

module.exports = {
    extraNodeModules: {
        'prop-types': path.resolve(__dirname, 'node_modules/prop-types'),
    'react': path.resolve(__dirname, 'node_modules/react'),
    'react-native': path.resolve(__dirname, 'node_modules/react-native')
    },
    getBlacklistRE: () => blacklist([
        /[/\\]Users[/\\]dylan[/\\]repos[/\\]react-native-fast-image[/\\]node_modules[/\\]react-native[/\\].*/
    ]),
    getProjectRoots: () => [
        // Include current package as project root
        path.resolve(__dirname),
        // Include symlinked packages as project roots
        path.resolve('/Users/dylan/repos/react-native-fast-image')
    ],
};