require 'json'

Pod::Spec.new do |s|
  package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

  s.name          = "RNFastImage"
  s.version       = package['version']
  s.summary       = package['description']
  s.authors       = { "Dylan Vann" => "dylan@dylanvann.com" }
  s.homepage      = "https://github.com/DylanVann/react-native-fast-image#readme"
  s.license       = "MIT"
  # React Native 0.76's minimums.
  s.platforms     = { :ios => "15.1", :tvos => "15.1" }
  s.framework     = 'UIKit'
  s.requires_arc  = true
  s.source        = { :git => "https://github.com/DylanVann/react-native-fast-image.git", :tag => "v#{s.version}" }
  s.source_files  = "ios/**/*.{h,m,mm}"

  # React Native's dependencies for a New Architecture component and
  # TurboModule (React-Core, Codegen's output for src/specs, ...).
  install_modules_dependencies(s)

  # Any 5.x from 5.21, so apps can use newer versions (and share them with
  # other libraries) without having to update. 5.21 decodes images smaller
  # (downsample) with the right EXIF orientation, and counts maxDiskAge from
  # when an image was last used.
  s.dependency 'SDWebImage', '>= 5.21.0', '< 6.0'
  s.dependency 'SDWebImageWebPCoder', '>= 0.8.4', '< 1.0'
end
