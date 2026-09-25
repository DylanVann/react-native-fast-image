#import <UIKit/UIKit.h>

#import <SDWebImage/SDAnimatedImageView+WebCache.h>
#import <SDWebImage/SDWebImageDownloader.h>

#import "FFFastImageSource.h"

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, FFFResizeMode) {
    FFFResizeModeCover,
    FFFResizeModeContain,
    FFFResizeModeStretch,
    FFFResizeModeCenter,
};

@class FFFastImageView;

// Receives the view's load events (the component view sends them to JS).
@protocol FFFastImageViewDelegate <NSObject>
- (void)fastImageViewDidStartLoading:(FFFastImageView *)view;
- (void)fastImageView:(FFFastImageView *)view didProgress:(NSInteger)loaded total:(NSInteger)total;
- (void)fastImageView:(FFFastImageView *)view didLoadWithSize:(CGSize)size;
- (void)fastImageView:(FFFastImageView *)view didFailWithError:(NSString *)error;
- (void)fastImageViewDidEndLoading:(FFFastImageView *)view;
@end

@interface FFFastImageView : SDAnimatedImageView

@property (nonatomic, weak, nullable) id<FFFastImageViewDelegate> delegate;
@property (nonatomic, assign) FFFResizeMode resizeMode;
// Setting these marks the image for reloading (see reloadIfNeeded).
@property (nonatomic, strong, nullable) FFFastImageSource *source;
@property (nonatomic, strong, nullable) UIImage *defaultSource;
@property (nonatomic, strong, nullable) UIColor *imageColor;
// How many times animated images play: -1 for the file's own loop count (the
// `loop` prop not set), 0 for forever, or a number of times.
@property (nonatomic, assign) NSInteger loopCount;
@property (nonatomic, assign) BOOL enableMinificationFilter;
// Only track download progress when something listens for it.
@property (nonatomic, assign) BOOL progressEnabled;

// Loads the image if the source or default source changed.
- (void)reloadIfNeeded;
// Cancels loading and clears the image, for reuse.
- (void)reset;

// The error's description, with the HTTP status code when there is one.
+ (NSString *)messageForError:(nullable NSError *)error;

@end

NS_ASSUME_NONNULL_END
