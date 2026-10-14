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

  # Nitro Images (react-native-nitro-image's Image) as a source, when the app
  # has react-native-nitro-image: its HybridObject (src/nitro, ios/Nitro), with
  # Nitrogen's code. Apps without it don't build any of this.
  podfile = Pod::Config.instance.podfile rescue nil
  if podfile&.dependencies&.any? { |d| d.root_name == 'NitroImage' }
    s.source_files = [s.attributes_hash["source_files"], "ios/Nitro/*.swift"].flatten
    # The Swift code's view of FastImage (a module now, for Swift).
    s.public_header_files = "ios/FastImage/FFFastImageMemoryImages.h"
    load File.join(__dir__, "nitrogen/generated/ios/RNFastImage+autolinking.rb")
    add_nitrogen_files(s)
    s.dependency 'NitroImage'
    # A Swift pod's dependencies must be modules, and the SDWebImage pods
    # aren't by default: build them as modules, as `:modular_headers => true`
    # for them in the Podfile would.
    podfile.target_definition_list.each do |target|
      %w[SDWebImage SDWebImageWebPCoder SDWebImageSVGCoder SDWebImagePhotosPlugin].each do |pod|
        target.set_use_modular_headers_for_pod(pod, true)
      end
    end
  end
end
