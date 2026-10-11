#import <Foundation/Foundation.h>
#import <RNFastImageSpec/RNFastImageSpec.h>

// FastImage's functions (preload, getCachePath, writeToCache and the caches'
// settings): the FastImageModule TurboModule (src/specs).
@interface FFFastImageModule : NSObject <NativeFastImageModuleSpec>

@end
