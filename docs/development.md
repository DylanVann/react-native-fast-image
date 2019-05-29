# Development

For now this uses a modified cli to work around issues with symlinked packages.

This is how to start the example app so you can test code with it.

```bash
# In the repo root folder, install dependencies. This will also install SDWebImage submodules.
yarn

# Symlink the package folder during development.
$ yarn link

# Move to one of the example folders.
cd react-native-fast-image-example/
cd react-native-fast-image-example-cocoapods/
cd react-native-fast-image-example-server/

# Install dependencies.
yarn

# Link `react-native-fast-image` package into the current example.
yarn link react-native-fast-image

# Start packager.
yarn start

# Start the iOS app.
yarn react-native run-ios

# Start the android app.
yarn react-native run-android

# You will need to re-run those commands to re-compile native code.
```
