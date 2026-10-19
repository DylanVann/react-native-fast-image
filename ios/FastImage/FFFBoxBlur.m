#import "FFFBoxBlur.h"
#import <Accelerate/Accelerate.h>

void FFFBoxBlur(CGContextRef context, uint32_t boxSize)
{
    if (boxSize <= 1) {
        return;
    }
    size_t height = CGBitmapContextGetHeight(context);
    vImage_Buffer buffer = {
        .data = CGBitmapContextGetData(context),
        .height = height,
        .width = CGBitmapContextGetWidth(context),
        .rowBytes = CGBitmapContextGetBytesPerRow(context),
    };
    vImage_Buffer other = buffer;
    other.data = malloc(buffer.rowBytes * height);
    vImage_Error tempSize = vImageBoxConvolve_ARGB8888(&buffer, &other, NULL, 0, 0, boxSize, boxSize, NULL,
                                                       kvImageGetTempBufferSize | kvImageEdgeExtend);
    void* temp = tempSize > 0 ? malloc(tempSize) : NULL;
    if (other.data && temp) {
        vImageBoxConvolve_ARGB8888(&buffer, &other, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
        vImageBoxConvolve_ARGB8888(&other, &buffer, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
        vImageBoxConvolve_ARGB8888(&buffer, &other, temp, 0, 0, boxSize, boxSize, NULL, kvImageEdgeExtend);
        memcpy(buffer.data, other.data, buffer.rowBytes * height);
    }
    free(other.data);
    free(temp);
}
