require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = "react-native-fast-image"
  s.version      = package['version']
  s.summary      = "FastImage, performant React Native image component."

  s.authors      = { "Dylan Vann" => "dylanvann@gmail.com" }
  s.homepage     = "https://github.com/DylanVann/react-native-fast-image#readme"
  s.license      = "MIT"
  s.platform     = :ios, "8.0"

  s.source       = { :git => "https://github.com/DylanVann/react-native-fast-image.git" }
  s.source_files  = "ios/**/*.{h,m}"
  s.exclude_files = "ios/Vendor/**/*.{h,m}"

  s.dependency 'React'
  s.dependency 'SDWebImage'
  s.dependency 'FLAnimatedImage'
end