# Example apps only: lists the simulator's photo library, for the photo library
# (ph://) regression cases. Not part of react-native-fast-image.
Pod::Spec.new do |s|
  s.name = 'ExamplePhotos'
  s.version = '1.0.0'
  s.summary = 'Lists the photo library for the example apps.'
  s.homepage = 'https://github.com/DylanVann/react-native-fast-image'
  s.license = 'MIT'
  s.author = 'react-native-fast-image'
  s.platforms = { :ios => '13.4', :tvos => '13.4' }
  s.source = { :git => 'https://github.com/DylanVann/react-native-fast-image.git' }
  s.source_files = '*.{h,m}'
  s.frameworks = 'Photos'
  s.dependency 'React-Core'
end
