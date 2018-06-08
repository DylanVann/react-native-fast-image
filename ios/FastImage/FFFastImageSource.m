#import "FFFastImageSource.h"

@implementation FFFastImageSource

- (instancetype)initWithURL:(NSURL *)url
                   priority:(FFFPriority)priority
                    headers:(NSDictionary *)headers
{
    self = [super init];
    if (self) {
        _uri = url;
        _priority = priority;
        _headers = headers;
    }
    return self;
}

- (instancetype)initWithImage:(UIImage *)image
{
    self = [super init];
    if (self) {
        _image = image;
    }
    return self;
}

@end
