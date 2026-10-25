# The app's memory for the iOS memory tests (MemorySamples.m), linked into
# every subject's app as a local Expo module (Expo links ../../modules/*).
Pod::Spec.new do |s|
  s.name = 'MemorySamples'
  s.version = '1.0.0'
  s.summary = "The benchmark app's memory, sent to the iOS tests' image server"
  s.homepage = 'https://github.com/DylanVann/react-native-fast-image'
  s.license = 'MIT'
  s.author = 'react-native-fast-image'
  s.source = { git: '' }
  s.platforms = { ios: '15.1' }
  s.source_files = '*.m'
end
