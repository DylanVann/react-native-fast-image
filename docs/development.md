# Development

For now this uses a modified cli to work around issues with symlinked packages.

This is how to start the example app so you can test code with it.

```bash
# Install all needed tools
npm install -g commitizen

# In the repo root folder.
# Install dependencies.
yarn

# force tarball creation, expected: `react-native-fast-image-*.tgz`
yarn pack

# Link module. Use link for active development only.
#yarn link

# Move to example folder.
cd ReactNativeFastImageExample

# Install dependencies.
# possible that you have to edit ReactNativeFastImageExample/package.json to reflect
# the latest version of the library `react-native-fast-image-v7.0.2.tgz` to solve the 
# `yarn` command errors.
yarn

# One time only! Generate Android Developer Debug signing key
if [ ! -f android/app/debug.keystore ]; then
    keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000
    cp debug.keystore android/app/debug.keystore
else
    echo OK;
fi  

# Link module. Use link for active development only. Otherwise stay with TGZ pack.
#yarn link react-native-fast-image

# Start packager.
yarn start

# Start the iOS app.
yarn react-native run-ios

# Start the android app.
yarn react-native run-android
# You will need to re-run those commands to re-compile native code.
```

## How To Analyze Yarn Pack and TGZ File Content?

To define content of the npm package you should modify `package.json` `files` section:
 
```json
{
    "files": [
        "/android/src",
        "/android/build.gradle",
        "/ios/FastImage",
        "/ios/FastImage.xcodeproj",
        "/src",
        "/docs",
        "/ReactNativeFastImageExample/android/settings.gradle",
        "/ReactNativeFastImageExample/android/gradle.properties",
        "/ReactNativeFastImageExample/android/gradlew",
        "/ReactNativeFastImageExample/android/gradlew.bat",
        "/ReactNativeFastImageExample/android/gradle",
        "/ReactNativeFastImageExample/android/app/src",
        "/ReactNativeFastImageExample/android/libraries/glide-to-fresco/src",
        "/ReactNativeFastImageExample/android/libraries/glide-to-fresco/build.gradle",
        "/ReactNativeFastImageExample/android/libraries/glide-to-fresco/gradle.properties",
        "/ReactNativeFastImageExampleServer",
        "RNFastImage.podspec"
    ],
}
```

And after modification execute command for verifying the content of TGZ archive: 
```bash
yarn test:pack
```

Expected Output:

```text
yarn run v1.13.0
$ rm -rf test.tgz && yarn pack --filename test.tgz && tar -tf test.tgz | ./bin/treeify
success Wrote tarball to "test.tgz".
package
 ├─CHANGELOG.md
 ├─LICENSE
 ├─README.md
 ├─RNFastImage.podspec
 ├─ReactNativeFastImageExample
 │  └─android
 │     ├─app
 │     │  └─src
 │     │     ├─debug
 │     │     │  └─AndroidManifest.xml
 │     │     └─main
...
 │     ├─gradle.properties
 │     ├─gradlew
 │     ├─gradlew.bat
 │     ├─libraries
 │     │  └─glide-to-fresco
...
 ├─package.json
 └─src
    ├─__snapshots__
    │  └─index.test.js.snap
    ├─index.d.ts
    ├─index.js
    ├─index.js.flow
    └─index.test.js
✨  Done in 4.16s.
```

## Troubleshooting

### How to solve if `yarn` command gives error

Error:

```bash
yarn

# yarn install v1.13.0
# [1/4] 🔍  Resolving packages...
# error "../react-native-fast-image-7.0.2.tgz": Tarball is not in network and can not be located in cache (["~/projects/react-native-fast-image/react-native-fast-image-7.0.2.tgz","/Users/[user]/Library/Caches/Yarn/v4/.tmp/4d7581e65b642e4a2650811347636fcc/.yarn-tarball.tgz"])
# info Visit https://yarnpkg.com/en/docs/cli/install for documentation about this command.
```

modify `ReactNativeFastImageExample/package.json` file and change the version of the `react-native-fact-image` dependency, replace v7.0.2 on latest version.

```json
{
  "name": "ReactNativeFastImageExample",
  "dependencies": {
    "react-native-fast-image": "../react-native-fast-image-v7.0.2.tgz",
  },
}
```
