#import <SDWebImage/SDImageIOAnimatedCoder.h>

// Animated AVIFs (AVIF image sequences), decoded with ImageIO, which reads
// them where it reads AVIF (iOS 16 and later): SDWebImage's own coders decode
// an AVIF's first frame only. Still AVIFs keep SDWebImage's ImageIO coder.
// Registered with SDWebImage's coders by FFFastImageSource.
@interface FFFAnimatedAVIFCoder : SDImageIOAnimatedCoder

@property (nonatomic, class, readonly, nonnull) FFFAnimatedAVIFCoder* sharedCoder;

@end
