#import <React/RCTConvert.h>

#import "FFFastImageView.h"

@class FFFastImageSource;

@interface RCTConvert (FFFastImage)

+ (FFFObjectFit)FFFObjectFit:(id)json;
+ (FFFastImageSource *)FFFastImageSource:(id)json;
+ (NSArray<FFFastImageSource *> *)FFFastImageSourceArray:(id)json;

@end
