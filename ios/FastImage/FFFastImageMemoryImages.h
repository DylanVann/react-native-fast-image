#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// Images already in memory that views show by a uri
// (fastimage-memory://<n>), such as a Nitro Image (added by
// react-native-fast-image-nitro-image). Only Foundation and UIKit here, so
// other pods (Swift ones too) can declare and call it without SDWebImage's
// headers.
@interface FFFastImageMemoryImages : NSObject

// Adds the image and returns its uri. It's only held weakly: the uri works
// while something else (e.g. the Nitro Image) keeps the image.
+ (NSString *)addImage:(UIImage *)image;

// The image at this uri, or nil if it's no longer in memory.
+ (nullable UIImage *)imageForURL:(NSURL *)url;

// Whether the url is one addImage: returned (a fastimage-memory:// url).
+ (BOOL)isMemoryImageURL:(nullable NSURL *)url;

@end

NS_ASSUME_NONNULL_END
