#import "FFFAnimatedWebPCoder.h"

// Whether the data is an animated WebP: a RIFF WEBP file whose first chunk is
// VP8X (the extended format) with the animation flag set. The header comes
// first, so a partial download can be checked too.
static BOOL FFFIsAnimatedWebP(NSData* data) {
    if (data.length < 21) {
        return NO;
    }
    const uint8_t* bytes = data.bytes;
    return memcmp(bytes, "RIFF", 4) == 0
        && memcmp(bytes + 8, "WEBPVP8X", 8) == 0
        && (bytes[20] & 0x02) != 0;
}

@implementation FFFAnimatedWebPCoder

// SDImageWebPCoder's sharedCoder is always one of its own.
+ (FFFAnimatedWebPCoder*) sharedCoder {
    static FFFAnimatedWebPCoder* coder;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        coder = [FFFAnimatedWebPCoder new];
    });
    return coder;
}

- (BOOL) canDecodeFromData: (NSData*)data {
    return FFFIsAnimatedWebP(data);
}

- (BOOL) canIncrementalDecodeFromData: (NSData*)data {
    return FFFIsAnimatedWebP(data);
}

// Only for decoding: encoding WebP is left to the coders that did it before.
- (BOOL) canEncodeToFormat: (SDImageFormat)format {
    return NO;
}

@end
