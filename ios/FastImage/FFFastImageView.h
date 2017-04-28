#import <UIKit/UIKit.h>

#import <SDWebImage/UIImageView+WebCache.h>
#import <SDWebImage/SDWebImageDownloader.h>

#import <React/RCTComponent.h>
#import <React/RCTResizeMode.h>

#import "FFFastImageSource.h"

@interface FFFastImageView : UIImageView

@property(nonatomic, copy) RCTDirectEventBlock onFastImageError;
@property(nonatomic, copy) RCTDirectEventBlock onFastImageLoad;
@property(nonatomic, assign) RCTResizeMode resizeMode;
@property(nonatomic, strong) FFFastImageSource *source;

@end
