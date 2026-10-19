#import <CoreGraphics/CoreGraphics.h>

// Blurs a bitmap context's pixels in place (8 bits per channel, 4 channels in
// any order, premultiplied if it has alpha): a box blur of boxSize (odd)
// three times, close to a Gaussian blur, with the edges extended outwards.
// For blurRadius and for a source's blurDataUri.
void FFFBoxBlur(CGContextRef context, uint32_t boxSize);
