# Installation (CocoaPods)

- Edit `ios/Podfile`

```diff
platform :ios, '9.0'

target 'ReactNativeFastImageCocoaPodsExample' do
  pod 'React', :path => '../node_modules/react-native', :subspecs => [
    'Core',
    'CxxBridge',
    'DevSupport',
    'RCTText',
    'RCTNetwork',
    'RCTWebSocket',
    'RCTImage',
  ]
  pod 'yoga', :path => '../node_modules/react-native/ReactCommon/yoga'

+  pod 'react-native-fast-image', :path => '../node_modules/react-native-fast-image'
end
```

- Run `pod install` within `ios`