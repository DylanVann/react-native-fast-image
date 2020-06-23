//
//  FFFastImageCacheNoParamMapper.h
//  FastImage
//
//  Created by David Newell on 06/03/2019.
//  Copyright © 2020 daibhin. All rights reserved.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface FFFastImageCacheNoParamMapper : NSObject

+ (instancetype)shared;
- (void)add:(NSURL*)url;
- (void)remove:(NSURL*)url;

@end

NS_ASSUME_NONNULL_END