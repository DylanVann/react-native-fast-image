# Example apps only: pauses and steps the app's Core Animation clock, for the
# regression runner's stepped samples. Not part of react-native-fast-image.
Pod::Spec.new do |s|
  s.name = 'ExampleAnimationClock'
  s.version = '1.0.0'
  s.summary = "Steps the example apps' animations for the regression runner."
  s.homepage = 'https://github.com/DylanVann/react-native-fast-image'
  s.license = 'MIT'
  s.author = 'react-native-fast-image'
  s.platforms = { :ios => '13.4', :tvos => '13.4' }
  s.source = { :git => 'https://github.com/DylanVann/react-native-fast-image.git' }
  s.source_files = '*.{h,m}'
  s.frameworks = 'QuartzCore'
  s.dependency 'React-Core'
end
