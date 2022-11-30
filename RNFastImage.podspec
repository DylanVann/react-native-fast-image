require 'json'

fabric_enabled = ENV['RCT_NEW_ARCH_ENABLED'] == '1'

Pod::Spec.new do |s|
  package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

  s.name          = "RNFastImage"
  s.version       = package['version']
  s.summary       = package['description']
  s.authors       = { "Dylan Vann" => "dylan@dylanvann.com" }
  s.homepage      = "https://github.com/DylanVann/react-native-fast-image#readme"
  s.license       = "MIT"
  s.requires_arc  = true
  s.framework     = 'UIKit'
  s.source        = { :git => "https://github.com/DylanVann/react-native-fast-image.git", :tag => "v#{s.version}" }

  if fabric_enabled
    folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

    s.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/boost" "$(PODS_ROOT)/boost-for-react-native"  "$(PODS_ROOT)/RCT-Folly"',
      "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    }
    s.platforms       = { ios: '11.0', tvos: '11.0' }
    s.compiler_flags  = folly_compiler_flags + ' -DRCT_NEW_ARCH_ENABLED'
    s.source_files    = 'ios/**/*.{h,m,mm,cpp}'

    s.dependency "React"
    s.dependency "React-RCTFabric"
    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
    s.dependency "RCTRequired"
    s.dependency "RCTTypeSafety"
    s.dependency "ReactCommon/turbomodule/core"
  else
    s.platforms     = { :ios => "8.0", :tvos => "9.0" }
    s.source_files  = "ios/**/*.{h,mm}"
    s.dependency 'React-Core'
  end

  s.dependency 'SDWebImage', '~> 5.11.1'
  s.dependency 'SDWebImageWebPCoder', '~> 0.8.4'
end
