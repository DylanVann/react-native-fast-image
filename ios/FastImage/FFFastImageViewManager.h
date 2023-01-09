#import <React/RCTViewManager.h>

typedef NS_ENUM(NSInteger, FFFEnterTransition) {
    FFFTransitionNone,
    FFFFadeIn,
    FFFCurlDown,
    FFFCurlUp,
    FFFFlipBottom,
    FFFFlipLeft,
    FFFFlipRight,
    FFFFlipTop,
};

@interface FFFastImageViewManager : RCTViewManager

@end
