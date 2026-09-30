#import <React/RCTConvert.h>

@class FFFastImageSource;

@interface RCTConvert (FFFastImage)

+ (FFFastImageSource *)FFFastImageSource:(id)json;
+ (NSArray<FFFastImageSource *> *)FFFastImageSourceArray:(id)json;

@end
