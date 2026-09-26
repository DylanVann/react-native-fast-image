#import "FFFDownsampledImage.h"
#import <ImageIO/ImageIO.h>
#import <SDWebImage/SDImageCoder.h>
#import <SDWebImage/SDImageCacheDefine.h>
#import <SDWebImage/SDWebImageCacheKeyFilter.h>
#import <SDWebImage/UIImage+Metadata.h>

// The decode option that carries the full image's size to the view.
static SDImageCoderOption const FFFDecodeSourceSize = @"FFFDecodeSourceSize";
// Added to the url's fragment, which isn't sent to the server.
static NSString* const FFFDownsampledFragment = @"fastimage-downsampled";

// The image's size in pixels as it's shown (EXIF orientations 5 to 8 turn it
// sideways), from its header, or zero if ImageIO can't read it.
static CGSize FFFPixelSize(NSData* data) {
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef) data, NULL);
    if (!source) {
        return CGSizeZero;
    }
    NSDictionary* properties = (__bridge_transfer NSDictionary*) CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
    CFRelease(source);
    CGFloat width = [properties[(__bridge NSString*) kCGImagePropertyPixelWidth] doubleValue];
    CGFloat height = [properties[(__bridge NSString*) kCGImagePropertyPixelHeight] doubleValue];
    NSUInteger orientation = [properties[(__bridge NSString*) kCGImagePropertyOrientation] unsignedIntegerValue];
    if (orientation >= kCGImagePropertyOrientationLeftMirrored) {
        return CGSizeMake(height, width);
    }
    return CGSizeMake(width, height);
}

// Where the decode puts the full image's size, passed in the load's decode
// options. SDWebImage attaches those options to the image it ends up with
// (sd_decodeOptions), also when its force decoding replaces the decoded image
// with another one, which drops anything kept on the image itself.
@interface FFFSourceSize : NSObject
@property (atomic, assign) CGSize size;
@end

@implementation FFFSourceSize

// Any two are equal: it's where the result goes, not part of the request, so
// the same request from several views is still decoded once (SDWebImage's
// downloader groups them by their decode options).
- (BOOL) isEqual: (id)object {
    return [object isKindOfClass: [FFFSourceSize class]];
}

- (NSUInteger) hash {
    return 0;
}

@end

@implementation FFFDownsampledImage

+ (BOOL) isSupported {
    static BOOL supported = NO;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // No animated image coder takes JPEG, so before SDWebImage 5.19
        // SDAnimatedImage returned nil for one, and SDWebImage decoded it with
        // its thumbnail options as they are (stretched to the box).
        CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
        CGContextRef context = CGBitmapContextCreate(NULL, 1, 1, 8, 4, colorSpace, kCGImageAlphaNoneSkipLast);
        CGColorSpaceRelease(colorSpace);
        CGImageRef pixel = context ? CGBitmapContextCreateImage(context) : NULL;
        if (context) {
            CGContextRelease(context);
        }
        if (!pixel) {
            return;
        }
        NSMutableData* jpeg = [NSMutableData data];
        CGImageDestinationRef destination = CGImageDestinationCreateWithData((__bridge CFMutableDataRef) jpeg, CFSTR("public.jpeg"), 1, NULL);
        if (destination) {
            CGImageDestinationAddImage(destination, pixel, NULL);
            CGImageDestinationFinalize(destination);
            CFRelease(destination);
        }
        CGImageRelease(pixel);
        supported = jpeg.length > 0 && [[SDAnimatedImage alloc] initWithData: jpeg scale: 1 options: nil] != nil;
    });
    return supported;
}

+ (NSURL*) loadURLForURL: (NSURL*)url {
    // SDWebImage's downloader shares a download between loads of the same
    // url, and decodes each load's image with the first load's image class.
    // After a load that isn't downsampled (e.g. a preload), this class
    // wouldn't be used, and the box would be decoded as SDWebImage does (to
    // fill it, stretched). With its own url, a downsampled load only shares
    // downloads with other downsampled ones.
    NSURLComponents* components = [NSURLComponents componentsWithURL: url resolvingAgainstBaseURL: NO];
    if (!components) {
        return url;
    }
    components.fragment = components.fragment.length > 0
        ? [components.fragment stringByAppendingFormat: @"-%@", FFFDownsampledFragment]
        : FFFDownsampledFragment;
    return components.URL ?: url;
}

+ (void) addToContext: (SDWebImageMutableContext*)context forURL: (NSURL*)url box: (CGSize)box cover: (BOOL)cover {
    context[SDWebImageContextAnimatedImageClass] = [FFFDownsampledImage class];
    // Cached under the url itself (see loadURLForURL:), so the disk cache
    // keeps one download for every size and for loads that aren't downsampled.
    NSString* key = url.absoluteString;
    context[SDWebImageContextCacheKeyFilter] = [SDWebImageCacheKeyFilter cacheKeyFilterWithBlock: ^NSString* (NSURL* _Nonnull loadURL) {
        return key;
    }];
    // The memory cache key is the url with these (SDWebImage's thumbnail
    // key), so views of other sizes don't get this image.
    context[SDWebImageContextImageThumbnailPixelSize] = [NSValue valueWithCGSize: box];
    context[SDWebImageContextImagePreserveAspectRatio] = @(!cover);
    context[SDWebImageContextImageDecodeOptions] = @{FFFDecodeSourceSize: [FFFSourceSize new]};
    // Only in memory: the disk cache has the downloaded file.
    context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeMemory);
    context[SDWebImageContextQueryCacheType] = @(SDImageCacheTypeMemory);
}

+ (CGSize) sourceSizeOfImage: (UIImage*)image {
    id sourceSize = image.sd_decodeOptions[FFFDecodeSourceSize];
    return [sourceSize isKindOfClass: [FFFSourceSize class]] ? ((FFFSourceSize*) sourceSize).size : CGSizeZero;
}

- (instancetype) initWithData: (NSData*)data scale: (CGFloat)scale options: (SDImageCoderOptions*)options {
    NSValue* boxValue = options[SDImageCoderDecodeThumbnailPixelSize];
    CGSize box = boxValue ? boxValue.CGSizeValue : CGSizeZero;
    NSNumber* preserveAspectRatio = options[SDImageCoderDecodePreserveAspectRatio];
    BOOL cover = preserveAspectRatio != nil && !preserveAspectRatio.boolValue;
    CGSize pixelSize = FFFPixelSize(data);

    // Decode at full size unless the image is at least twice as large as it
    // needs to be (or its size can't be read). Decoding smaller is done in
    // software, while newer iPhones decode JPEG and HEIC at full size in
    // hardware: on an iPhone 15 Pro Max a 12 MP JPEG took about 20 ms at full
    // size, and 120-130 ms with a peak of 100-125 MB decoded to 60-90% of its
    // size (1-6 MB and 27-40 ms for a thumbnail).
    NSMutableDictionary* decodeOptions = options ? [options mutableCopy] : [NSMutableDictionary dictionary];
    [decodeOptions removeObjectForKey: SDImageCoderDecodeThumbnailPixelSize];
    decodeOptions[SDImageCoderDecodePreserveAspectRatio] = @YES;
    if (box.width > 0 && box.height > 0 && pixelSize.width > 0 && pixelSize.height > 0) {
        CGFloat widthRatio = box.width / pixelSize.width;
        CGFloat heightRatio = box.height / pixelSize.height;
        CGFloat ratio = cover ? MAX(widthRatio, heightRatio) : MIN(widthRatio, heightRatio);
        if (ratio <= 0.5) {
            // ImageIO takes the longest side (kCGImageSourceThumbnailMaxPixelSize).
            // SDWebImage works it out from the box with the image's stored
            // width and height, before EXIF orientation, so a square box is
            // the one that gives this side for any orientation.
            CGFloat longest = ceil(MAX(pixelSize.width, pixelSize.height) * ratio);
            decodeOptions[SDImageCoderDecodeThumbnailPixelSize] = [NSValue valueWithCGSize: CGSizeMake(longest, longest)];
        }
    }

    self = [super initWithData: data scale: scale options: decodeOptions];
    if (self) {
        CGFloat imageScale = MAX(scale, 1);
        FFFSourceSize* sourceSize = options[FFFDecodeSourceSize];
        if ([sourceSize isKindOfClass: [FFFSourceSize class]]) {
            sourceSize.size = pixelSize.width > 0 && pixelSize.height > 0
                ? CGSizeMake(pixelSize.width / imageScale, pixelSize.height / imageScale)
                : self.size;
        }
    }
    return self;
}

@end
