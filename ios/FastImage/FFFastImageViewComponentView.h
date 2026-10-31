#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

// The FastImageView component (src/specs) on the New Architecture: shows an
// FFFastImageView, and passes it the component's props and its events back.
@interface FFFastImageViewComponentView : RCTViewComponentView

@end

// The FastImageAutoView component: FastImageView for an image whose style
// leaves a side to the image (see src/index.tsx). Its shadow node has the
// state the view sets the loaded image's size in; FastImageView's has none.
@interface FFFastImageAutoViewComponentView : FFFastImageViewComponentView

@end

NS_ASSUME_NONNULL_END
