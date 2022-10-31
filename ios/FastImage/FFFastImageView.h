#import <UIKit/UIKit.h>

#import <SDWebImage/SDAnimatedImageView+WebCache.h>
#import <SDWebImage/SDWebImageDownloader.h>

#import <React/RCTComponent.h>
#import <React/RCTResizeMode.h>
#import <React/RCTViewComponentView.h>

#import "FFFastImageSource.h"

#import <react/renderer/components/FastImageViewSpecs/ComponentDescriptors.h>
#import <react/renderer/components/FastImageViewSpecs/EventEmitters.h>
#import <react/renderer/components/FastImageViewSpecs/Props.h>
#import <react/renderer/components/FastImageViewSpecs/RCTComponentViewHelpers.h>

@interface FFFastImageView : SDAnimatedImageView

@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadStart;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageProgress;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageError;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoad;
@property (nonatomic, copy) RCTDirectEventBlock onFastImageLoadEnd;
@property (nonatomic, assign) RCTResizeMode resizeMode;
@property (nonatomic, strong) FFFastImageSource *source;
@property (nonatomic, strong) UIImage *defaultSource;
@property (nonatomic, strong) UIColor *imageColor;

@end

