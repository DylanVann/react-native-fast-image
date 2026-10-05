require 'json'

Pod::Spec.new do |s|
  package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

  s.name          = "RNFastImage"
  s.version       = package['version']
  s.summary       = package['description']
  s.authors       = { "Dylan Vann" => "dylan@dylanvann.com" }
  s.homepage      = "https://github.com/DylanVann/react-native-fast-image#readme"
  s.license       = "MIT"
  s.platforms     = { :ios => "13.0", :tvos => "13.0" }
  s.framework     = 'UIKit'
  s.requires_arc  = true
  s.source        = { :git => "https://github.com/DylanVann/react-native-fast-image.git", :tag => "v#{s.version}" }
  s.source_files  = "ios/**/*.{h,m}"

  s.dependency 'React-Core'
  # Any 5.x from 5.11.1, so apps can use newer versions (and share them with
  # other libraries) without having to update. 5.18.7+ has the privacy
  # manifest Apple requires.
  s.dependency 'SDWebImage', '>= 5.11.1', '< 6.0'
  s.dependency 'SDWebImageWebPCoder', '>= 0.8.4', '< 1.0'
  # SVG images. Every 1.x needs iOS 13 (Apple's SVG renderer). From 1.7, as
  # expo-image's, so apps with it share one copy.
  s.dependency 'SDWebImageSVGCoder', '>= 1.7.0', '< 2.0'
  # Photo library images (ph://).
  s.dependency 'SDWebImagePhotosPlugin', '>= 1.2.0', '< 2.0'
end
