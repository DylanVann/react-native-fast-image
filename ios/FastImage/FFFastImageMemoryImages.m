#import "FFFastImageMemoryImages.h"

static NSString *const FFFMemoryImageScheme = @"fastimage-memory";

@implementation FFFastImageMemoryImages

// Uris to images, held weakly. Added on the JS thread, read on the main
// thread (and SDWebImage's), so behind a lock.
static NSMapTable<NSString *, UIImage *> *FFFImages;
static NSUInteger FFFLastImage;

+ (void)initialize
{
    if (self == [FFFastImageMemoryImages class]) {
        FFFImages = [NSMapTable strongToWeakObjectsMapTable];
    }
}

+ (NSString *)addImage:(UIImage *)image
{
    @synchronized(self) {
        NSString *uri = [NSString stringWithFormat:@"%@://%lu", FFFMemoryImageScheme, (unsigned long)++FFFLastImage];
        [FFFImages setObject:image forKey:uri];
        return uri;
    }
}

+ (UIImage *)imageForURL:(NSURL *)url
{
    NSString *uri = url.absoluteString;
    if (!uri) {
        return nil;
    }
    @synchronized(self) {
        return [FFFImages objectForKey:uri];
    }
}

+ (BOOL)isMemoryImageURL:(NSURL *)url
{
    return [url.scheme isEqualToString:FFFMemoryImageScheme];
}

@end
