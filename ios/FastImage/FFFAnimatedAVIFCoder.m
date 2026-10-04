#import "FFFAnimatedAVIFCoder.h"
#import <ImageIO/ImageIO.h>

// SDWebImage has no format for AVIF: this is the value SDWebImageAVIFCoder
// uses, so an image reports the same format with either coder.
static const SDImageFormat FFFImageFormatAVIF = 15;

// Whether the data is an animated AVIF: a file whose first box is `ftyp`
// with the `avis` (image sequence) brand, as its major brand or a compatible
// one. The header comes first, so a partial download can be checked too.
static BOOL FFFIsAnimatedAVIF(NSData* data) {
    if (data.length < 16) {
        return NO;
    }
    const uint8_t* bytes = data.bytes;
    if (memcmp(bytes + 4, "ftyp", 4) != 0) {
        return NO;
    }
    if (memcmp(bytes + 8, "avis", 4) == 0) {
        return YES;
    }
    // The compatible brands, after the major brand and its version.
    uint32_t size = (uint32_t)bytes[0] << 24 | (uint32_t)bytes[1] << 16 | (uint32_t)bytes[2] << 8 | bytes[3];
    NSUInteger end = MIN((NSUInteger)size, data.length);
    for (NSUInteger offset = 16; offset + 4 <= end; offset += 4) {
        if (memcmp(bytes + offset, "avis", 4) == 0) {
            return YES;
        }
    }
    return NO;
}

// Whether ImageIO reads AVIF image sequences on this version of iOS.
static BOOL FFFCanDecodeAVIFSequences(void) {
    static BOOL supported;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSArray* types = CFBridgingRelease(CGImageSourceCopyTypeIdentifiers());
        supported = [types containsObject: @"public.avis"];
    });
    return supported;
}

@implementation FFFAnimatedAVIFCoder

+ (FFFAnimatedAVIFCoder*) sharedCoder {
    static FFFAnimatedAVIFCoder* coder;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        coder = [FFFAnimatedAVIFCoder new];
    });
    return coder;
}

- (BOOL) canDecodeFromData: (NSData*)data {
    return FFFIsAnimatedAVIF(data) && FFFCanDecodeAVIFSequences();
}

- (BOOL) canIncrementalDecodeFromData: (NSData*)data {
    return [self canDecodeFromData: data];
}

// Only for decoding.
- (BOOL) canEncodeToFormat: (SDImageFormat)format {
    return NO;
}

#pragma mark - SDImageIOAnimatedCoder

+ (SDImageFormat) imageFormat {
    return FFFImageFormatAVIF;
}

+ (NSString*) imageUTType {
    return @"public.avis";
}

// ImageIO's keys for AVIF sequences (kCGImagePropertyAVIS…), as strings so
// they build with any SDK. LoopCount is the number of plays, 0 for forever,
// as for GIF and APNG.
+ (NSString*) dictionaryProperty {
    return @"{AVIS}";
}

+ (NSString*) unclampedDelayTimeProperty {
    return @"UnclampedDelayTime";
}

+ (NSString*) delayTimeProperty {
    return @"DelayTime";
}

+ (NSString*) loopCountProperty {
    return @"LoopCount";
}

// A sequence without a repetition count plays forever (ImageIO reports
// LoopCount 0 for one).
+ (NSUInteger) defaultLoopCount {
    return 0;
}

@end
