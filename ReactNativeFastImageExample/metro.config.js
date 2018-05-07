const path = require('path');
const blacklist = require('metro/src/blacklist');

module.exports = {
    extraNodeModules: {
    
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