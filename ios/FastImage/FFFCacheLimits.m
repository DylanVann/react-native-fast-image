#import "FFFCacheLimits.h"

#import <SDWebImage/SDImageCache.h>

NSArray<NSString *> *FFFCacheLimitNames(void)
{
    return @[@"maxDiskSize", @"maxDiskAge", @"maxMemorySize"];
}

NSString *FFFSavedCacheLimitKey(NSString *name)
{
    return [@"FastImage." stringByAppendingString:name];
}

NSNumber *FFFCacheLimit(NSString *name)
{
    id saved = [NSUserDefaults.standardUserDefaults objectForKey:FFFSavedCacheLimitKey(name)];
    if ([saved isKindOfClass:NSNumber.class]) {
        return saved;
    }
    NSString *infoKey = [NSString stringWithFormat:@"FastImage%@%@",
                         [name substringToIndex:1].uppercaseString, [name substringFromIndex:1]];
    id info = [NSBundle.mainBundle objectForInfoDictionaryKey:infoKey];
    if ([info isKindOfClass:NSNumber.class]) {
        return info;
    }
    if ([info isKindOfClass:NSString.class]) {
        return @([info doubleValue]);
    }
    return nil;
}

void FFFSetCacheLimit(SDImageCacheConfig *config, NSString *name, NSNumber *value)
{
    double limit = MAX(value.doubleValue, 0);
    if ([name isEqualToString:@"maxDiskSize"]) {
        config.maxDiskSize = limit;
    } else if ([name isEqualToString:@"maxMemorySize"]) {
        config.maxMemoryCost = limit;
    } else if (value) {
        // SDWebImage never expires images with a negative age (with 0 it
        // would remove them all).
        config.maxDiskAge = limit > 0 ? limit : -1;
        // SDWebImage's default; set in case the app changed it, as FastImage
        // documents maxDiskAge as counted from an image's last use.
        config.diskCacheExpireType = SDImageCacheConfigExpireTypeAccessDate;
    } else {
        config.maxDiskAge = 60 * 60 * 24 * 7;
    }
}

// Runs once per launch, before FastImage first uses SDWebImage's cache: from
// FFFastImageModule's +initialize (on the JS thread: React Native creates the
// app's module providers, this class among them, at the first native module JS
// asks for) or FFFastImageView's (main thread), whichever comes first;
// dispatch_once makes the other wait until the limits are set. Image loads
// don't read the limits: SDWebImage reads the disk ones when it trims the disk
// cache (on its I/O queue, when the app goes to the background or closes), and
// the memory one is its NSCache's cost limit (NSCache is thread-safe).
void FFFApplyCacheLimits(void)
{
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        SDImageCacheConfig *config = SDImageCache.sharedImageCache.config;
        for (NSString *name in FFFCacheLimitNames()) {
            NSNumber *value = FFFCacheLimit(name);
            if (value) {
                FFFSetCacheLimit(config, name, value);
            }
        }
    });
}
