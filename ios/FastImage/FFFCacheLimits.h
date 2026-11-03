#import <Foundation/Foundation.h>
#import <SDWebImage/SDImageCacheConfig.h>

NS_ASSUME_NONNULL_BEGIN

// configureCache's limits, by their names in JS. Each is set in the app's
// Info.plist (FastImageMaxDiskSize, ...) or changed at runtime, which is saved
// (FastImage.maxDiskSize, ...) and wins until it's reset with null.
FOUNDATION_EXTERN NSArray<NSString *> *FFFCacheLimitNames(void);

// The user default a limit changed at runtime is saved under.
FOUNDATION_EXTERN NSString *FFFSavedCacheLimitKey(NSString *name);

// A limit's value: the one saved by configureCache, or the app's Info.plist's,
// or nil for SDWebImage's default.
FOUNDATION_EXTERN NSNumber *_Nullable FFFCacheLimit(NSString *name);

// Sets a limit in SDWebImage's cache config: 0 for no limit, nil for
// SDWebImage's default. maxDiskAge counts from when an image was last used.
FOUNDATION_EXTERN void FFFSetCacheLimit(SDImageCacheConfig *config, NSString *name, NSNumber *_Nullable value);

// Applies the app's cache limits (saved by configureCache, or in its
// Info.plist) to SDWebImage's cache, once, before FastImage loads an image.
FOUNDATION_EXTERN void FFFApplyCacheLimits(void);

NS_ASSUME_NONNULL_END
