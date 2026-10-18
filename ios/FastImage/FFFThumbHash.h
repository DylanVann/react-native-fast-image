#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// A source's `thumbhash` (https://evanw.github.io/thumbhash/) decoded into the
// placeholder it shows while its image loads: at most 32 × 32 pixels, which
// the view scales up smoothly. Decoding takes well under a millisecond, so it
// happens as the view picks its source; recent ones are cached by their hash.
// Also a source's `blurDataUri`: a data uri's few pixels, scaled up to the
// same size and blurred.
@interface FFFThumbHash : NSObject

// A source's placeholder: its blurDataUri's (PNG, JPEG, WebP, a GIF's first
// frame; nil for one iOS doesn't decode, e.g. an SVG), or its ThumbHash's.
// Main thread.
+ (nullable UIImage*) imageForPlaceholder: (nullable NSString*)placeholder;

// The placeholder for a base64 ThumbHash (standard or url-safe, with or
// without padding), or nil for an empty or invalid one. Main thread.
+ (nullable UIImage*) imageForThumbHash: (nullable NSString*)thumbhash;

@end

NS_ASSUME_NONNULL_END
