Pod::Spec.new do |s|
  s.name     = 'react-native-fast-image'
  s.version  = '1.0.0'
  s.ios.deployment_target = '8.0'
  s.tvos.deployment_target = '9.0'
  s.license  =  { :type => 'MIT', :file => 'LICENSE' }
  s.summary  = 'react-native-fast-image.'
  s.homepage = 'https://mptst.picclife.cn/guoyufu/react-native-fast-image'
  s.authors   = { 'GuoYufu' => 'guoyufu@picclife.cn' }
  s.source   = { :git => 'https://mptst.picclife.cn/guoyufu/react-native-fast-image.git', :tag => s.version.to_s }

  s.description = 'react-native-fast-image.'

  s.source_files = 'ios/FastImage/*.{h,m}'
  s.framework    = 'UIKit'
  s.requires_arc = true
  s.dependency 'SDWebImage'
  s.dependency 'FLAnimatedImage'
  s.dependency 'React'
end
