require 'json'

Pod::Spec.new do |s|
  s.name         = "react-native-fast-image"
  s.version      = "1.0.0"
  s.license      = "MIT"
  s.homepage     = "https://github.com/bamlab/react-native-fast-image.git"
  s.authors      = { 'Dylan Vann' => 'dylanvann@gmail.com', 'BAM' => 'tychot@bam.tech' }
  s.summary      = "🚩 FastImage, performant React Native image component (BAM fork)"
  s.source       = { :git => "https://github.com/bamlab/react-native-fast-image.git" }
  s.platform     = :ios, "7.0"

  s.dependency 'React'
  s.dependency 'SDWebImage'
  s.dependency 'SDWebImage/GIF'
  s.source_files  = "ios/FastImage/*.{h,m}"
end