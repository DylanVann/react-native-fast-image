# Troubleshooting

If you have problems you can try:

- Running Clean in Xcode.
- Deleting Xcode's derived data.
- Removing `node_modules` then reinstalling dependencies. (`rm -rf node_modules && yarn`)
- Clearing watchman's watches. (`watchman watch-del-all`)
- Clearing React Native's packager cache. (`react-native start --reset-cache`)
- Clearing React Native's iOS build folder. (`rm -rf ios/build`)
