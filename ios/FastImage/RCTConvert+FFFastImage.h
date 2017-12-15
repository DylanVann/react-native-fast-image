#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#elif __has_include("React/RCTConvert.h")
#import "React/RCTConvert.h"
#else
#import "RCTConvert.h"
#endif

@class FFFastImageSource;

@interface RCTConvert (FFFastImage)

+ (FFFastImageSource *)FFFastImageSource:(id)json;

@end
