require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "FastImageNitroImage"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = { "Dylan Vann" => "dylan@dylanvann.com" }
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/DylanVann/react-native-fast-image.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  # Its declaration of FastImage's FFFastImageMemoryImages, for the Swift code.
  s.public_header_files = "ios/**/*.h"

  load "nitrogen/generated/ios/FastImageNitroImage+autolinking.rb"
  add_nitrogen_files(s)

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  s.dependency "NitroImage"
  # FastImage's FFFastImageMemoryImages comes from the app's RNFastImage pod
  # when the app links: not a pod dependency, since CocoaPods doesn't let a
  # Swift pod depend on a pod that isn't a module (see FastImageMemoryImages.h).
  install_modules_dependencies(s)
end
