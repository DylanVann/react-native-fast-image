//
//  FFFastImageCacheNoParamMapper.m
//  FastImage
//
//  Created by David Newell on 06/03/2019.
//  Copyright © 2020 daibhin. All rights reserved.
//

#import "FFFastImageCacheNoParamMapper.h"
#import <SDWebImage/SDWebImageManager.h>

@implementation NSURL (StaticUrl)

- (NSURL*)staticURL {
	return [[NSURL alloc] initWithScheme:self.scheme host:self.host path:self.path];
}

@end

@interface FFFastImageCacheNoParamMapper ()

@property (strong) NSMutableSet *staticUrls;

@end

@implementation FFFastImageCacheNoParamMapper

+ (instancetype)shared {
	static FFFastImageCacheNoParamMapper *_shared = nil;
	static dispatch_once_t onceToken;
	dispatch_once(&onceToken, ^{
		_shared = [FFFastImageCacheNoParamMapper new];
	});

	return _shared;
}

- (id)init {
	self = [super init];
	if (self) {
		_staticUrls = [NSMutableSet new];

		SDWebImageCacheKeyFilter *cacheKeyFilter = [SDWebImageCacheKeyFilter cacheKeyFilterWithBlock:^NSString * _Nullable(NSURL * _Nonnull url) {
				NSString *staticURLString = [[url staticURL] absoluteString];
				if ([_staticUrls containsObject:staticURLString]) {
					return staticURLString;
				}
				return url.absoluteString;
		}];
		SDWebImageManager.sharedManager.cacheKeyFilter = cacheKeyFilter;
	}
	return self;
}

- (void)add:(NSURL*)url {
	[_staticUrls addObject:[url staticURL].absoluteString];
}

- (void)remove:(NSURL*)url {
	[_staticUrls removeObject:[url staticURL].absoluteString];
}

@end