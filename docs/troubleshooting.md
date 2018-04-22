# Troubleshooting

If you have problems you can try:

- Running Clean in Xcode.
- Deleting Xcode's derived data.
- Remove `node_modules` then reinstall dependencies. (`rm -rf node_modules && yarn`)
- Clear watchman watches. (`watchman watch-del-all`)
- Clear react-native packager cache. (`react-native start --reset-cache`)
- Clear react-native ios build folder. (`rm -rf ios/build`)
