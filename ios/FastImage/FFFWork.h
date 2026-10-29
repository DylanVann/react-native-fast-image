#import <Foundation/Foundation.h>

// Expensive work FastImage does (decodes, loads, blurs, SVG renders), one log
// line each ("FastImageWork <kind> <url> <detail>", and "main" if it ran on
// the main thread), in debug builds with the FastImageWork user default on:
// the example app's regression runner counts them per case
// (scripts/verify.mts sets it). Nothing in a release build.
#if DEBUG
static inline BOOL FFFWorkEnabled(void)
{
    static BOOL enabled;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        enabled = [NSUserDefaults.standardUserDefaults boolForKey:@"FastImageWork"];
    });
    return enabled;
}

static inline void FFFWorkLog(NSString *kind, NSURL *_Nullable url, NSString *detail)
{
    NSString *image = url.absoluteString ?: @"-";
    // A data uri as its length: it can be the whole image.
    if ([image hasPrefix:@"data:"]) {
        image = [NSString stringWithFormat:@"data:(%lu)", (unsigned long)image.length];
    }
    NSLog(@"FastImageWork %@ %@ %@%@", kind, image, detail, NSThread.isMainThread ? @" main" : @"");
}

// The detail is only built when the line is logged (variadic: it's often a
// message with commas in it).
#define FFFWork(kind, url, ...)                 \
    do {                                        \
        if (FFFWorkEnabled()) {                 \
            FFFWorkLog(kind, url, __VA_ARGS__); \
        }                                       \
    } while (0)
#else
#define FFFWork(kind, url, ...)
#endif
