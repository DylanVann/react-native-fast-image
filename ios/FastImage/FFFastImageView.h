#import <UIKit/UIKit.h>

#import <SDWebImage/UIImageView+WebCache.h>

#import <React/RCTComponent.h>
#import <React/RCTResizeMode.h>

#import "FFFastImageSource.h"

@interface FFFastImageView : UIImageView

@property(nonatomic, copy) RCTDirectEventBlock onError;
@property(nonatomic, copy) RCTDirectEventBlock onLoad;
@property(nonatomic, assign) RCTResizeMode resizeMode;
@property(nonatomic, strong) FFFastImageSource *source;

@end
