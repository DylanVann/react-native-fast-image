#import "RCTConvert+FFFastImage.h"
#import "FFFastImageSource.h"

@implementation RCTConvert (FFFastImage)

RCT_ENUM_CONVERTER(FFFPriority, (@{
        @"low": @(FFFPriorityLow),
        @"normal": @(FFFPriorityNormal),
        @"high": @(FFFPriorityHigh),
}), FFFPriorityNormal, integerValue);

+ (FFFastImageSource *)FFFastImageSource:(id)json {
    if (!json) {
        return nil;
    }
    NSString *URLString = json[@"uri"];
    NSURL *url = [self NSURL:URLString];

    FFFPriority priority = [self FFFPriority:json[@"priority"]];

    NSDictionary *headers = [self NSDictionary:json[@"headers"]];
    if (headers) {
        __block BOOL allHeadersAreStrings = YES;
        [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, id header, BOOL *stop) {
            if (![header isKindOfClass:[NSString class]]) {
                RCTLogError(@"Values of HTTP headers passed must be  of type string. "
                        "Value of header '%@' is not a string.", key);
                allHeadersAreStrings = NO;
                *stop = YES;
            }
        }];
        if (!allHeadersAreStrings) {
            // Set headers to nil here to avoid crashing later.
            headers = nil;
        }
    }

    FFFastImageSource *imageSource = [[FFFastImageSource alloc] initWithURL:url priority:priority headers:headers];

    return imageSource;
}

RCT_ARRAY_CONVERTER(FFFastImageSource);

@end
