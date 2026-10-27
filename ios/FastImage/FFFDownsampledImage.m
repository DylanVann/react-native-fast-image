#import "FFFDownsampledImage.h"
#import <ImageIO/ImageIO.h>
#import <SDWebImage/SDImageCoder.h>
#import <SDWebImage/SDImageCacheDefine.h>
#import <SDWebImage/UIImage+Metadata.h>
#import <SDWebImage/NSData+ImageContentType.h>
#import <SDWebImage/SDImageCodersManager.h>
#import <SDWebImage/SDImageCache.h>
#import <SDWebImage/SDWebImageManager.h>
#import <SDWebImage/SDImageTransformer.h>

// The decode option that carries the full image's size to the view.
static SDImageCoderOption const FFFDecodeSourceSize = @"FFFDecodeSourceSize";
// The decode option for a full-size load that decodes an image at its own
// size however large it is (objectFit none, which shows it at that size).
static SDImageCoderOption const FFFDecodeUncapped = @"FFFDecodeUncapped";
// The decode option for a view that shows an image no larger than its own
// size (objectFit scale-down): the screen's scale, the most pixels per point
// an SVG is drawn at (see FFFDrawnSVG).
static SDImageCoderOption const FFFDecodeMaxScale = @"FFFDecodeMaxScale";

// The most pixels a full-size load decodes an image of at least twice that
// size each way at (each frame, for an animated image): 4096 x 4096, 64 MB
// (128 MB decoded to HDR, at 8 bytes per pixel). At full size a 10000 x 10000
// photo would take 400 MB, for each view that doesn't downsample it.
static CGFloat const FFFMaxPixels = 4096.0 * 4096.0;

// The longest side (in pixels) a full-size load decodes an image of this size
// at, or zero for its own size. An image less than twice FFFMaxPixels' size
// each way (64 megapixels) is decoded at its own size: decoding it to more
// than half its size decodes it at full size first (see initWithData), so its
// peak is larger. On a Mac a 6000 x 4000 JPEG took 268 MB at its peak decoded
// to 84% of its size, 200 MB at full size, and 80 MB at half its size; a
// 10000 x 8000 PNG 697 MB at full size and 274 MB at 16 megapixels.
static CGFloat FFFCappedLongestSide(CGSize pixelSize) {
    CGFloat ratio = sqrt(FFFMaxPixels / (pixelSize.width * pixelSize.height));
    if (pixelSize.width <= 0 || pixelSize.height <= 0 || ratio > 0.5) {
        return 0;
    }
    return MAX(1, floor(MAX(pixelSize.width, pixelSize.height) * ratio));
}

// The size in pixels a full-size load decodes an image of this size at.
static CGSize FFFFullSizePixelSize(CGSize pixelSize, BOOL uncapped) {
    CGFloat longest = uncapped ? 0 : FFFCappedLongestSide(pixelSize);
    if (longest == 0) {
        return pixelSize;
    }
    CGFloat ratio = longest / MAX(pixelSize.width, pixelSize.height);
    return CGSizeMake(pixelSize.width * ratio, pixelSize.height * ratio);
}

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

void FFFWithSVGLock(void (^block)(void)) {
    static NSCondition* condition;
    static BOOL busy;
    static NSInteger mainWaiting;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        condition = [NSCondition new];
    });
    // The main thread goes before background threads waiting their turn, so
    // it waits for the drawing in progress at most.
    BOOL main = [NSThread isMainThread];
    [condition lock];
    if (main) {
        mainWaiting++;
    }
    while (busy || (!main && mainWaiting > 0)) {
        [condition wait];
    }
    if (main) {
        mainWaiting--;
    }
    busy = YES;
    [condition unlock];
    block();
    [condition lock];
    busy = NO;
    [condition broadcast];
    [condition unlock];
}

// An SVG (a vector image, its size in points) drawn into a bitmap for a box
// (in pixels) to fit in or cover, with at most maxScale pixels per point if
// it's not zero, on SDWebImage's decode queue. Shown as a
// vector, UIKit draws it on the main thread whenever the view shows it at a
// new size (on an iPhone 15 Pro Max, mounting 40 cached 24-point icons took
// 36 ms of the main thread against 11 ms as PNGs). It keeps the SVG's size in
// points, with the pixels per point the box needs, so objectFit and onLoad
// treat it as the SVG, and at most FFFMaxPixels (a thin SVG covering a box).
static UIImage* FFFDrawnSVG(UIImage* image, CGSize box, BOOL cover, CGFloat maxScale) {
    CGSize size = image.size;
    if (size.width <= 0 || size.height <= 0 || box.width <= 0 || box.height <= 0) {
        return nil;
    }
    CGFloat widthRatio = box.width / size.width;
    CGFloat heightRatio = box.height / size.height;
    CGFloat scale = cover ? MAX(widthRatio, heightRatio) : MIN(widthRatio, heightRatio);
    if (maxScale > 0) {
        scale = MIN(scale, maxScale);
    }
    scale = MIN(scale, sqrt(FFFMaxPixels / (size.width * size.height)));
    UIGraphicsImageRendererFormat* format = [UIGraphicsImageRendererFormat preferredFormat];
    format.scale = scale;
    format.opaque = NO;
    // 8 bits per channel, as SVG colors are (not the display's extended range,
    // which takes twice the memory).
    format.preferredRange = UIGraphicsImageRendererFormatRangeStandard;
    UIGraphicsImageRenderer* renderer = [[UIGraphicsImageRenderer alloc] initWithSize: size format: format];
    __block UIImage* drawn;
    FFFWithSVGLock(^{
        drawn = [renderer imageWithActions: ^(UIGraphicsImageRendererContext* context) {
            [image drawInRect: CGRectMake(0, 0, size.width, size.height)];
        }];
    });
    return drawn;
}

// Where the decode puts the full image's size, passed in the load's decode
// options. SDWebImage attaches those options to the image it ends up with
// (sd_decodeOptions), also when its force decoding replaces the decoded image
// with another one, which drops anything kept on the image itself.
@interface FFFSourceSize : NSObject
@property (atomic, assign) CGSize size;
// The image is an SVG drawn into a bitmap for the box (see FFFDrawnSVG): it
// has no full size to decode at, so it's always smaller than one.
@property (atomic, assign) BOOL drawnForBox;
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

// Gives a load its own memory cache key, which SDWebImage makes from the url,
// the box and whether it's covered, not the decode options (see
// FFFDecodeMaxScale). The image is unchanged.
@interface FFFKeyTransformer : NSObject <SDImageTransformer>
@property (nonatomic, copy) NSString* transformerKey;
@end

@implementation FFFKeyTransformer

- (UIImage*) transformedImageWithImage: (UIImage*)image forKey: (NSString*)key {
    return image;
}

@end

// The cache a downsampled load reads the downloaded file from (SDWebImage's
// original image cache): the manager's, without its memory, except for an
// image decoded at full size, which full-size loads can use (5.21.5 keeps
// every downsampled decode under its own key). SDWebImageManager (5.21.6 and
// later) puts the image it decodes from that file in memory under the
// full-size image's key, also when it's decoded smaller, where a full-size
// load of the url started at the same time could find it (SDImageCache looks
// in memory again before it decodes from disk) and show it blurry.
@interface FFFOriginalImageCache : NSObject <SDImageCache>
@end

@interface FFFDownsampledImage ()
+ (BOOL) isSmallerFullSizeImage: (UIImage*)image context: (SDWebImageContext*)context;
@end

@implementation FFFOriginalImageCache

+ (instancetype) sharedCache {
    static FFFOriginalImageCache* cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        cache = [FFFOriginalImageCache new];
    });
    return cache;
}

- (id<SDImageCache>) cache {
    return [SDWebImageManager sharedManager].imageCache;
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"

- (nullable id<SDWebImageOperation>) queryImageForKey: (nullable NSString*)key options: (SDWebImageOptions)options context: (nullable SDWebImageContext*)context completion: (nullable SDImageCacheQueryCompletionBlock)completionBlock {
    return [self queryImageForKey: key options: options context: context cacheType: SDImageCacheTypeAll completion: completionBlock];
}

- (nullable id<SDWebImageOperation>) queryImageForKey: (nullable NSString*)key options: (SDWebImageOptions)options context: (nullable SDWebImageContext*)context cacheType: (SDImageCacheType)cacheType completion: (nullable SDImageCacheQueryCompletionBlock)completionBlock {
    // The file, not an image in memory (another load's, of another size).
    if (cacheType == SDImageCacheTypeMemory || cacheType == SDImageCacheTypeNone) {
        if (completionBlock) {
            completionBlock(nil, nil, SDImageCacheTypeNone);
        }
        return nil;
    }
    cacheType = SDImageCacheTypeDisk;
    id<SDImageCache> cache = self.cache;
    if ([cache respondsToSelector: @selector(queryImageForKey:options:context:cacheType:completion:)]) {
        return [cache queryImageForKey: key options: options context: context cacheType: cacheType completion: completionBlock];
    }
    return [cache queryImageForKey: key options: options context: context completion: completionBlock];
}

- (void) storeImage: (nullable UIImage*)image imageData: (nullable NSData*)imageData forKey: (nullable NSString*)key cacheType: (SDImageCacheType)cacheType completion: (nullable SDWebImageNoParamsBlock)completionBlock {
    [self storeImage: image imageData: imageData forKey: key options: 0 context: nil cacheType: cacheType completion: completionBlock];
}

- (void) storeImage: (nullable UIImage*)image imageData: (nullable NSData*)imageData forKey: (nullable NSString*)key options: (SDWebImageOptions)options context: (nullable SDWebImageContext*)context cacheType: (SDImageCacheType)cacheType completion: (nullable SDWebImageNoParamsBlock)completionBlock {
    id<SDImageCache> cache = self.cache;
    // An image decoded at full size (the view needs most of it) is the one
    // full-size loads use: kept in memory for them, as without downsample.
    BOOL memory = (cacheType == SDImageCacheTypeMemory || cacheType == SDImageCacheTypeAll) && image &&
        [FFFDownsampledImage sourceSizeOfImage: image].width > 0 &&
        ![FFFDownsampledImage isSmallerFullSizeImage: image context: nil];
    if (memory) {
        [cache storeImage: image imageData: nil forKey: key cacheType: SDImageCacheTypeMemory completion: nil];
    }
    if (cacheType != SDImageCacheTypeDisk && cacheType != SDImageCacheTypeAll) {
        if (completionBlock) {
            completionBlock();
        }
        return;
    }
    if ([cache respondsToSelector: @selector(storeImage:imageData:forKey:options:context:cacheType:completion:)]) {
        [cache storeImage: image imageData: imageData forKey: key options: options context: context cacheType: SDImageCacheTypeDisk completion: completionBlock];
    } else {
        [cache storeImage: image imageData: imageData forKey: key cacheType: SDImageCacheTypeDisk completion: completionBlock];
    }
}

- (void) removeImageForKey: (nullable NSString*)key cacheType: (SDImageCacheType)cacheType completion: (nullable SDWebImageNoParamsBlock)completionBlock {
    [self.cache removeImageForKey: key cacheType: cacheType completion: completionBlock];
}

- (void) containsImageForKey: (nullable NSString*)key cacheType: (SDImageCacheType)cacheType completion: (nullable SDImageCacheContainsCompletionBlock)completionBlock {
    [self.cache containsImageForKey: key cacheType: cacheType completion: completionBlock];
}

- (void) clearWithCacheType: (SDImageCacheType)cacheType completion: (nullable SDWebImageNoParamsBlock)completionBlock {
    [self.cache clearWithCacheType: cacheType completion: completionBlock];
}

#pragma clang diagnostic pop

@end

@implementation FFFDownsampledImage

+ (void) addFullSizeToContext: (SDWebImageMutableContext*)context uncapped: (BOOL)uncapped {
    context[SDWebImageContextAnimatedImageClass] = [FFFDownsampledImage class];
    context[SDWebImageContextImageDecodeOptions] = uncapped
        ? @{FFFDecodeSourceSize: [FFFSourceSize new], FFFDecodeUncapped: @YES}
        : @{FFFDecodeSourceSize: [FFFSourceSize new]};
}

+ (void) addToContext: (SDWebImageMutableContext*)context box: (CGSize)box cover: (BOOL)cover maxScale: (CGFloat)maxScale {
    context[SDWebImageContextAnimatedImageClass] = [FFFDownsampledImage class];
    // The memory cache key is the source's key with these (SDWebImage's
    // thumbnail key), so views of other sizes don't get this image. The disk
    // cache keeps the downloaded file under the source's key, for every size.
    context[SDWebImageContextImageThumbnailPixelSize] = [NSValue valueWithCGSize: box];
    context[SDWebImageContextImagePreserveAspectRatio] = @(!cover);
    NSMutableDictionary* decodeOptions = [@{FFFDecodeSourceSize: [FFFSourceSize new]} mutableCopy];
    if (maxScale > 0) {
        decodeOptions[FFFDecodeMaxScale] = @(maxScale);
        FFFKeyTransformer* key = [FFFKeyTransformer new];
        key.transformerKey = [NSString stringWithFormat: @"FFFMaxScale%g", maxScale];
        // A transformer in the context replaces the manager's: an app's own
        // (SDWebImageManager's transformer) still applies, before this one.
        id<SDImageTransformer> appTransformer = [SDWebImageManager sharedManager].transformer;
        context[SDWebImageContextImageTransformer] = appTransformer
            ? [SDImagePipelineTransformer transformerWithTransformers: @[appTransformer, key]]
            : key;
    }
    context[SDWebImageContextImageDecodeOptions] = decodeOptions;
    // Only in memory: the disk cache has the downloaded file.
    context[SDWebImageContextStoreCacheType] = @(SDImageCacheTypeMemory);
    context[SDWebImageContextQueryCacheType] = @(SDImageCacheTypeMemory);
    // The downloaded file is read from and written to the disk cache there.
    context[SDWebImageContextOriginalImageCache] = [FFFOriginalImageCache sharedCache];
}

+ (FFFSourceSize*) sourceSizeObjectOfImage: (UIImage*)image {
    id sourceSize = image.sd_decodeOptions[FFFDecodeSourceSize];
    return [sourceSize isKindOfClass: [FFFSourceSize class]] ? sourceSize : nil;
}

+ (CGSize) sourceSizeOfImage: (UIImage*)image {
    FFFSourceSize* sourceSize = [self sourceSizeObjectOfImage: image];
    return sourceSize ? sourceSize.size : CGSizeZero;
}

+ (void) forgetUnusableImageForURL: (NSURL*)url context: (SDWebImageContext*)context {
    SDWebImageManager* manager = [SDWebImageManager sharedManager];
    if (!url || ![manager.imageCache isKindOfClass: [SDImageCache class]] || ![manager respondsToSelector: @selector(cacheKeyForURL:context:)]) {
        return;
    }
    SDImageCache* cache = (SDImageCache*) manager.imageCache;
    NSString* key = [manager cacheKeyForURL: url context: context];
    UIImage* image = [cache imageFromMemoryCacheForKey: key];
    if (image && ([self isSmallerFullSizeImage: image context: context] || [self isOtherDynamicRange: image context: context])) {
        [cache removeImageFromMemoryForKey: key];
    }
}

+ (BOOL) isDrawnForBox: (UIImage*)image {
    return [self sourceSizeObjectOfImage: image].drawnForBox;
}

+ (BOOL) isSmallerThanFullSize: (UIImage*)image uncapped: (BOOL)uncapped {
    if ([self isDrawnForBox: image]) {
        return YES;
    }
    CGSize fullSize = [self sourceSizeOfImage: image];
    if (fullSize.width <= 0 || fullSize.height <= 0) {
        return NO;
    }
    CGFloat scale = MAX(image.scale, 1);
    CGSize expected = FFFFullSizePixelSize(CGSizeMake(fullSize.width * scale, fullSize.height * scale), uncapped);
    // By more than a pixel of rounding.
    return image.size.width * scale < expected.width - 1 || image.size.height * scale < expected.height - 1;
}

+ (BOOL) isFullSizeImage: (UIImage*)image {
    CGSize fullSize = [self sourceSizeOfImage: image];
    return fullSize.width > 0 && fullSize.height > 0 && ![self isSmallerThanFullSize: image uncapped: NO];
}

// A smaller image under a full-size load's key.
+ (BOOL) isSmallerFullSizeImage: (UIImage*)image context: (SDWebImageContext*)context {
    if (context[SDWebImageContextImageThumbnailPixelSize]) {
        return NO;
    }
    return [self isSmallerThanFullSize: image uncapped: [context[SDWebImageContextImageDecodeOptions][FFFDecodeUncapped] boolValue]];
}

// An image decoded to SDR for an HDR load, or to HDR for an SDR load. Only
// images SDWebImage decoded say how: not a photo library's, or an app's own
// loader's, which are kept. One decoded to HDR that came out SDR (most images
// have no HDR) is the same as an SDR decode, and an HDR file decoded without
// asking is HDR either way (e.g. an HDR10 HEIC on iOS 15 and 16).
+ (BOOL) isOtherDynamicRange: (UIImage*)image context: (SDWebImageContext*)context {
    if (!image.sd_decodeOptions) {
        return NO;
    }
    BOOL wantsHDR = [context[SDWebImageContextImageDecodeToHDR] boolValue];
    BOOL decodedToHDR = [image.sd_decodeOptions[SDImageCoderDecodeToHDR] boolValue];
    return wantsHDR ? !decodedToHDR : decodedToHDR && image.sd_isHighDynamicRange;
}

- (instancetype) initWithData: (NSData*)data scale: (CGFloat)scale options: (SDImageCoderOptions*)options {
    // An SVG, which this class can't decode (this init can return another
    // image): a vector image from the SVG coder, without the box (it would
    // draw it at the box's size in points, at the screen's scale), drawn here
    // for the box (FFFDrawnSVG). A full-size load keeps the vector image.
    if ([NSData sd_imageFormatForImageData: data] == SDImageFormatSVG) {
        NSMutableDictionary* vectorOptions = options ? [options mutableCopy] : [NSMutableDictionary dictionary];
        [vectorOptions removeObjectForKey: SDImageCoderDecodeThumbnailPixelSize];
        __block UIImage* image;
        FFFWithSVGLock(^{
            image = [[SDImageCodersManager sharedManager] decodedImageWithData: data options: vectorOptions];
        });
        FFFSourceSize* sourceSize = options[FFFDecodeSourceSize];
        if (!image || ![sourceSize isKindOfClass: [FFFSourceSize class]]) {
            sourceSize = nil;
        }
        sourceSize.size = image.size;
        NSValue* boxValue = options[SDImageCoderDecodeThumbnailPixelSize];
        NSNumber* preserveAspectRatio = options[SDImageCoderDecodePreserveAspectRatio];
        BOOL cover = preserveAspectRatio != nil && !preserveAspectRatio.boolValue;
        CGFloat maxScale = [options[FFFDecodeMaxScale] doubleValue];
        UIImage* drawn = boxValue && image ? FFFDrawnSVG(image, boxValue.CGSizeValue, cover, maxScale) : nil;
        if (drawn) {
            image = drawn;
            sourceSize.drawnForBox = YES;
        }
        self = (id) image;
        return self;
    }

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
    // ImageIO takes the longest side (kCGImageSourceThumbnailMaxPixelSize),
    // zero here for full size.
    CGFloat longest = 0;
    if (box.width > 0 && box.height > 0 && pixelSize.width > 0 && pixelSize.height > 0) {
        CGFloat widthRatio = box.width / pixelSize.width;
        CGFloat heightRatio = box.height / pixelSize.height;
        CGFloat ratio = cover ? MAX(widthRatio, heightRatio) : MIN(widthRatio, heightRatio);
        if (ratio <= 0.5) {
            longest = ceil(MAX(pixelSize.width, pixelSize.height) * ratio);
        }
    }
    CGFloat cappedLongest = [options[FFFDecodeUncapped] boolValue] ? 0 : FFFCappedLongestSide(pixelSize);
    if (cappedLongest > 0 && (longest == 0 || longest > cappedLongest)) {
        longest = cappedLongest;
    }
    if (longest > 0) {
        // SDWebImage works it out from the box with the image's stored width
        // and height, before EXIF orientation, so a square box is the one
        // that gives this side for any orientation.
        decodeOptions[SDImageCoderDecodeThumbnailPixelSize] = [NSValue valueWithCGSize: CGSizeMake(longest, longest)];
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
