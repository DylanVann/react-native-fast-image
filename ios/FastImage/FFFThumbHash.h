#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// A source's `thumbhash` (https://evanw.github.io/thumbhash/) decoded into the
// placeholder it shows while its image loads: at most 32 × 32 pixels, which
// the view scales up smoothly. Decoding takes well under a millisecond, so it
// happens as the view picks its source; recent ones are cached by their hash.
@interface FFFThumbHash : NSObject

// The placeholder for a base64 ThumbHash (standard or url-safe, with or
// without padding), or nil for an empty or invalid one. Main thread.
+ (nullable UIImage*) imageForThumbHash: (nullable NSString*)thumbhash;

@end

NS_ASSUME_NONNULL_END
