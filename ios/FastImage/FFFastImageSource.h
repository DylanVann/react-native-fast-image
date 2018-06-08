#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

typedef NS_ENUM(NSInteger, FFFPriority) {
    FFFPriorityLow,
    FFFPriorityNormal,
    FFFPriorityHigh
};

/**
 * Object containing an image URL and associated metadata.
 */
@interface FFFastImageSource : NSObject

// uri for image
@property (nonatomic) NSURL* uri;
// priority for image request
@property (nonatomic) FFFPriority priority;
// headers for the image request
@property (nonatomic) NSDictionary *headers;
// base64 image
@property (nonatomic) UIImage *image;

- (instancetype)initWithURL:(NSURL *)url
                   priority:(FFFPriority)priority
                    headers:(NSDictionary *)headers;

- (instancetype)initWithImage:(UIImage *)image;

@end
