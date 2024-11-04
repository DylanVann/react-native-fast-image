#import "FFFastImagePreloader.h"
#import "FFFastImageSource.h"

static int instanceCounter = 0;

@implementation FFFastImagePreloader

-(instancetype) init {
    if (self = [super init]) {
        instanceCounter ++;
        _id = [NSNumber numberWithInt:instanceCounter];
    }
    return self;
}

@end
