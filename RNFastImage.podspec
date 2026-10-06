require 'json'

Pod::Spec.new do |s|
  package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

  s.name          = "RNFastImage"
  s.version       = package['version']
  s.summary       = package['description']
  s.authors       = { "Dylan Vann" => "dylan@dylanvann.com" }
  s.homepage      = "https://github.com/DylanVann/react-native-fast-image#readme"
  s.license       = "MIT"
  # React Native 0.83's minimums.
  s.platforms     = { :ios => "15.1", :tvos => "15.1" }
  s.framework     = 'UIKit'
  s.requires_arc  = true
  s.source        = { :git => "https://github.com/DylanVann/react-native-fast-image.git", :tag => "v#{s.version}" }
  s.source_files  = "ios/**/*.{h,m,mm}"

  # React Native's dependencies for a New Architecture component and
  # TurboModule (React-Core, Codegen's output for src/specs, ...).
  install_modules_dependencies(s)

  # Any 5.x from 5.21.4, so apps can use newer versions (and share them with
  # other libraries, such as expo-image, which uses ~> 5.21.0 from Expo SDK 53)
  # without having to update. downsample needs 5.19.7, tinted animated images
  # and maxDiskAge counting from an image's last use 5.20, and 5.21.4 fixes a
  # crash on iOS 26 (SDWebImage #3849).
  s.dependency 'SDWebImage', '>= 5.21.4', '< 6.0'
  s.dependency 'SDWebImageWebPCoder', '>= 0.8.4', '< 1.0'
  # SVG images. From 1.7, as expo-image's, so apps with it share one copy.
  s.dependency 'SDWebImageSVGCoder', '>= 1.7.0', '< 2.0'
  # Photo library images (ph://).
  s.dependency 'SDWebImagePhotosPlugin', '>= 1.2.0', '< 2.0'
end
