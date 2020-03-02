#import "FFFastImageSource.h"
#import <Foundation/Foundation.h>
#import <SDWebImage/SDWebImagePrefetcher.h>

@interface FFFastImagePreloader : SDWebImagePrefetcher

@property (nonatomic, readonly) NSNumber* id;

@end
