#import <Foundation/Foundation.h>

// Expensive work FastImage does (decodes, loads, blurs, SVG renders), one log
// line each ("FastImageWork <kind> <url> <detail>", and "main" if it ran on
// the main thread), in debug builds only: the example app's regression runner
// counts them per case (scripts/verify.mts). Nothing in a release build.
#if DEBUG
static inline void FFFWork(NSString *kind, NSURL *_Nullable url, NSString *detail)
{
    NSString *image = url.absoluteString ?: @"-";
    // A data uri as its length: it can be the whole image.
    if ([image hasPrefix:@"data:"]) {
        image = [NSString stringWithFormat:@"data:(%lu)", (unsigned long)image.length];
    }
    NSLog(@"FastImageWork %@ %@ %@%@", kind, image, detail, NSThread.isMainThread ? @" main" : @"");
}
#else
#define FFFWork(kind, url, detail)
#endif
