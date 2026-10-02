#import <SDWebImageWebPCoder/SDImageWebPCoder.h>

// libwebp's WebP coder (SDWebImageWebPCoder), for animated WebPs only:
// SDWebImage's own coders decode a WebP's first frame. Still WebPs keep
// ImageIO's decoder. Registered with SDWebImage's coders by FFFastImageSource.
@interface FFFAnimatedWebPCoder : SDImageWebPCoder

@property (nonatomic, class, readonly, nonnull) FFFAnimatedWebPCoder* sharedCoder;

@end
