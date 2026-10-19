#import "FFFThumbHash.h"
#include <math.h>

// FFFThumbHashToRGBA is Evan Wallace's reference decoder
// (https://github.com/evanw/thumbhash, thumbHashToRGBA in java/ and js/) in C,
// with a check that the hash is long enough for what its header says it
// holds:
//
// Copyright (c) 2023 Evan Wallace
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// How many AC factors a channel of nx × ny has.
static int FFFThumbHashCount(int nx, int ny) {
    int n = 0;
    for (int cy = 0; cy < ny; cy++)
        for (int cx = cy > 0 ? 0 : 1; cx * ny < nx * (ny - cy); cx++)
            n++;
    return n;
}

static void FFFThumbHashDecodeChannel(const uint8_t* hash, int start, int* index, int nx, int ny, float scale, float* ac) {
    int n = FFFThumbHashCount(nx, ny);
    for (int i = 0; i < n; i++) {
        int data = hash[start + (*index >> 1)] >> ((*index & 1) << 2);
        ac[i] = ((float) (data & 15) / 7.5f - 1.0f) * scale;
        (*index)++;
    }
}

static uint8_t FFFThumbHashChannel(float value) {
    return (uint8_t) fmaxf(0, roundf(255.0f * fminf(1, value)));
}

// The hash decoded as unpremultiplied RGBA (malloc'd, the caller frees it),
// with its width and height, or NULL if it's too short.
static uint8_t* FFFThumbHashToRGBA(const uint8_t* hash, NSUInteger length, int* width, int* height) {
    if (length < 5) {
        return NULL;
    }
    // Read the constants
    int header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
    int header16 = hash[3] | (hash[4] << 8);
    float l_dc = (float) (header24 & 63) / 63.0f;
    float p_dc = (float) ((header24 >> 6) & 63) / 31.5f - 1.0f;
    float q_dc = (float) ((header24 >> 12) & 63) / 31.5f - 1.0f;
    float l_scale = (float) ((header24 >> 18) & 31) / 31.0f;
    BOOL hasAlpha = (header24 >> 23) != 0;
    float p_scale = (float) ((header16 >> 3) & 63) / 63.0f;
    float q_scale = (float) ((header16 >> 9) & 63) / 63.0f;
    BOOL isLandscape = (header16 >> 15) != 0;
    int lx = MAX(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
    int ly = MAX(3, isLandscape ? header16 & 7 : (hasAlpha ? 5 : 7));
    int ac_start = hasAlpha ? 6 : 5;
    int l_count = FFFThumbHashCount(lx, ly);
    int pq_count = FFFThumbHashCount(3, 3);
    int a_count = hasAlpha ? FFFThumbHashCount(5, 5) : 0;
    if (length < (NSUInteger) (ac_start + (l_count + 2 * pq_count + a_count + 1) / 2)) {
        return NULL;
    }
    float a_dc = hasAlpha ? (float) (hash[5] & 15) / 15.0f : 1.0f;
    float a_scale = hasAlpha ? (float) ((hash[5] >> 4) & 15) / 15.0f : 0;

    // Read the varying factors (boost saturation by 1.25x to compensate for quantization)
    float l_ac[64], p_ac[16], q_ac[16], a_ac[32];
    int ac_index = 0;
    FFFThumbHashDecodeChannel(hash, ac_start, &ac_index, lx, ly, l_scale, l_ac);
    FFFThumbHashDecodeChannel(hash, ac_start, &ac_index, 3, 3, p_scale * 1.25f, p_ac);
    FFFThumbHashDecodeChannel(hash, ac_start, &ac_index, 3, 3, q_scale * 1.25f, q_ac);
    if (hasAlpha) {
        FFFThumbHashDecodeChannel(hash, ac_start, &ac_index, 5, 5, a_scale, a_ac);
    }

    // Decode using the DCT into RGB
    int ratio_lx = isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7;
    int ratio_ly = isLandscape ? header16 & 7 : (hasAlpha ? 5 : 7);
    float ratio = ratio_ly > 0 ? (float) ratio_lx / (float) ratio_ly : 1;
    int w = MAX(1, (int) roundf(ratio > 1.0f ? 32.0f : 32.0f * ratio));
    int h = MAX(1, (int) roundf(ratio > 1.0f ? 32.0f / ratio : 32.0f));
    uint8_t* rgba = malloc((size_t) w * h * 4);
    if (!rgba) {
        return NULL;
    }
    int cx_stop = MAX(lx, hasAlpha ? 5 : 3);
    int cy_stop = MAX(ly, hasAlpha ? 5 : 3);
    float fx[8], fy[8];
    for (int y = 0, i = 0; y < h; y++) {
        for (int x = 0; x < w; x++, i += 4) {
            float l = l_dc, p = p_dc, q = q_dc, a = a_dc;

            // Precompute the coefficients
            for (int cx = 0; cx < cx_stop; cx++)
                fx[cx] = (float) cos(M_PI / w * (x + 0.5f) * cx);
            for (int cy = 0; cy < cy_stop; cy++)
                fy[cy] = (float) cos(M_PI / h * (y + 0.5f) * cy);

            // Decode L
            for (int cy = 0, j = 0; cy < ly; cy++) {
                float fy2 = fy[cy] * 2.0f;
                for (int cx = cy > 0 ? 0 : 1; cx * ly < lx * (ly - cy); cx++, j++)
                    l += l_ac[j] * fx[cx] * fy2;
            }

            // Decode P and Q
            for (int cy = 0, j = 0; cy < 3; cy++) {
                float fy2 = fy[cy] * 2.0f;
                for (int cx = cy > 0 ? 0 : 1; cx < 3 - cy; cx++, j++) {
                    float f = fx[cx] * fy2;
                    p += p_ac[j] * f;
                    q += q_ac[j] * f;
                }
            }

            // Decode A
            if (hasAlpha)
                for (int cy = 0, j = 0; cy < 5; cy++) {
                    float fy2 = fy[cy] * 2.0f;
                    for (int cx = cy > 0 ? 0 : 1; cx < 5 - cy; cx++, j++)
                        a += a_ac[j] * fx[cx] * fy2;
                }

            // Convert to RGB
            float b = l - 2.0f / 3.0f * p;
            float r = (3.0f * l - b + q) / 2.0f;
            float g = r - q;
            rgba[i] = FFFThumbHashChannel(r);
            rgba[i + 1] = FFFThumbHashChannel(g);
            rgba[i + 2] = FFFThumbHashChannel(b);
            rgba[i + 3] = FFFThumbHashChannel(a);
        }
    }
    *width = w;
    *height = h;
    return rgba;
}

// One row or column (count values, step apart): each becomes the average of
// the 2 × radius + 1 around it, the edge values repeated.
static void FFFBoxBlur(float* values, int step, int count, int radius, float* line) {
    for (int i = 0; i < count; i++) {
        line[i] = values[i * step];
    }
    float sum = 0;
    for (int i = -radius; i <= radius; i++) {
        sum += line[MIN(count - 1, MAX(0, i))];
    }
    for (int i = 0; i < count; i++) {
        values[i * step] = sum / (2 * radius + 1);
        sum += line[MIN(count - 1, i + radius + 1)] - line[MAX(0, i - radius)];
    }
}

// A blurDataUri's image scaled so its longer side is 32 px (a ThumbHash's
// size) and blurred by about half of one of its pixels, so that a few pixels
// scale up smoothly instead of in steps: a box blur three times each way
// (about a Gaussian), on premultiplied colors, the edges extended outwards.
static UIImage* FFFBlurredPreview(UIImage* image) {
    CGImageRef source = image.CGImage;
    if (!source) {
        return nil;
    }
    size_t width = CGImageGetWidth(source), height = CGImageGetHeight(source);
    if (width == 0 || height == 0) {
        return nil;
    }
    float scale = 32.0f / MAX(width, height);
    int w = MAX(1, (int) lroundf(width * scale)), h = MAX(1, (int) lroundf(height * scale));
    int radius = MAX(1, (int) lroundf(scale / 2));
    CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef context = CGBitmapContextCreate(NULL, w, h, 8, w * 4, colorSpace,
                                                 kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(colorSpace);
    if (!context) {
        return nil;
    }
    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextDrawImage(context, CGRectMake(0, 0, w, h), source);
    uint8_t* rgba = CGBitmapContextGetData(context);
    float* channel = malloc(sizeof(float) * w * h);
    float* line = malloc(sizeof(float) * MAX(w, h));
    for (int c = 0; c < 4; c++) {
        for (int i = 0; i < w * h; i++) {
            channel[i] = rgba[i * 4 + c];
        }
        for (int pass = 0; pass < 3; pass++) {
            for (int y = 0; y < h; y++) {
                FFFBoxBlur(channel + y * w, 1, w, radius, line);
            }
            for (int x = 0; x < w; x++) {
                FFFBoxBlur(channel + x, w, h, radius, line);
            }
        }
        for (int i = 0; i < w * h; i++) {
            rgba[i * 4 + c] = (uint8_t) MIN(255, lroundf(channel[i]));
        }
    }
    free(channel);
    free(line);
    CGImageRef blurred = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    if (!blurred) {
        return nil;
    }
    UIImage* result = [UIImage imageWithCGImage: blurred scale: 1 orientation: UIImageOrientationUp];
    CGImageRelease(blurred);
    return result;
}

@implementation FFFThumbHash

+ (NSCache<NSString*, UIImage*>*) cache {
    static NSCache* cache;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        cache = [NSCache new];
        // Recent placeholders, at most 4 KB each.
        cache.countLimit = 256;
    });
    return cache;
}

+ (UIImage*) imageForPlaceholder: (NSString*)placeholder {
    if ([placeholder rangeOfString: @"data:" options: NSCaseInsensitiveSearch | NSAnchoredSearch].location == NSNotFound) {
        return [self imageForThumbHash: placeholder];
    }
    UIImage* cached = [[self cache] objectForKey: placeholder];
    if (cached) {
        return cached;
    }
    NSURL* url = [NSURL URLWithString: placeholder];
    NSData* data = url ? [NSData dataWithContentsOfURL: url] : nil;
    UIImage* decoded = data ? [UIImage imageWithData: data scale: 1] : nil;
    UIImage* image = decoded ? FFFBlurredPreview(decoded) : nil;
    if (image) {
        [[self cache] setObject: image forKey: placeholder];
    }
    return image;
}

+ (UIImage*) imageForThumbHash: (NSString*)thumbhash {
    if (thumbhash.length == 0) {
        return nil;
    }
    UIImage* cached = [[self cache] objectForKey: thumbhash];
    if (cached) {
        return cached;
    }
    NSMutableString* base64 = [[thumbhash stringByTrimmingCharactersInSet: [NSCharacterSet whitespaceAndNewlineCharacterSet]] mutableCopy];
    [base64 replaceOccurrencesOfString: @"-" withString: @"+" options: 0 range: NSMakeRange(0, base64.length)];
    [base64 replaceOccurrencesOfString: @"_" withString: @"/" options: 0 range: NSMakeRange(0, base64.length)];
    while (base64.length % 4 != 0) {
        [base64 appendString: @"="];
    }
    NSData* hash = [[NSData alloc] initWithBase64EncodedString: base64 options: 0];
    if (!hash) {
        return nil;
    }
    int width = 0, height = 0;
    uint8_t* rgba = FFFThumbHashToRGBA(hash.bytes, hash.length, &width, &height);
    if (!rgba) {
        return nil;
    }
    // Premultiplied, as Core Graphics draws it.
    for (int i = 0; i < width * height * 4; i += 4) {
        int alpha = rgba[i + 3];
        rgba[i] = (uint8_t) ((rgba[i] * alpha + 127) / 255);
        rgba[i + 1] = (uint8_t) ((rgba[i + 1] * alpha + 127) / 255);
        rgba[i + 2] = (uint8_t) ((rgba[i + 2] * alpha + 127) / 255);
    }
    CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef context = CGBitmapContextCreate(rgba, width, height, 8, width * 4, colorSpace,
                                                 kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGImageRef cgImage = context ? CGBitmapContextCreateImage(context) : NULL;
    if (context) {
        CGContextRelease(context);
    }
    CGColorSpaceRelease(colorSpace);
    free(rgba);
    if (!cgImage) {
        return nil;
    }
    UIImage* image = [UIImage imageWithCGImage: cgImage scale: 1 orientation: UIImageOrientationUp];
    CGImageRelease(cgImage);
    [[self cache] setObject: image forKey: thumbhash];
    return image;
}

@end
