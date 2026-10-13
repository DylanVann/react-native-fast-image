#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// react-native-fast-image's FFFastImageMemoryImages
// (ios/FastImage/FFFastImageMemoryImages.h there), declared here for the
// Swift code: FastImage's pod isn't a module Swift can import.
@interface FFFastImageMemoryImages : NSObject

+ (NSString *)addImage:(UIImage *)image;

@end

NS_ASSUME_NONNULL_END
