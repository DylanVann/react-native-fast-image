#import <QuartzCore/QuartzCore.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

// Example apps only: pauses the app's Core Animation clock (which FastImage's
// fades use) and steps it by hand, so the regression runner can screenshot a
// fade at set times instead of recording it. Each window's layer is paused
// (speed 0) and its time moved on with timeOffset (Apple's QA1673): the
// render server still draws the real layer tree, at that time. Everything
// else (layout, loading, React Native) keeps running. Animated images play
// on their own display link, which this doesn't stop.
@interface ExampleAnimationClock : NSObject <RCTBridgeModule>
@end

// Calls `done` after `count` frames have been drawn.
@interface FFFExampleFrames : NSObject
@end

@implementation FFFExampleFrames {
    NSInteger _count;
    void (^_done)(void);
    CADisplayLink *_link;
}

+ (void)after:(NSInteger)count done:(void (^)(void))done
{
    FFFExampleFrames *frames = [FFFExampleFrames new];
    frames->_count = count;
    frames->_done = done;
    // The link keeps its target until it's invalidated.
    frames->_link = [CADisplayLink displayLinkWithTarget:frames selector:@selector(tick)];
    [frames->_link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}

- (void)tick
{
    if (--_count > 0) return;
    [_link invalidate];
    _done();
}

@end

@implementation ExampleAnimationClock

// The clock's time while paused (the windows' local time, s), and whether it
// is.
static CFTimeInterval FFFExampleTime = 0;
static BOOL FFFExamplePaused = NO;

RCT_EXPORT_MODULE(AnimationClock)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

static NSArray<CALayer *> *FFFExampleLayers(void)
{
    NSMutableArray<CALayer *> *layers = [NSMutableArray array];
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) [layers addObject:window.layer];
    }
    return layers;
}

static void FFFExampleSetTime(void)
{
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    for (CALayer *layer in FFFExampleLayers()) {
        layer.speed = FFFExamplePaused ? 0 : 1;
        layer.timeOffset = FFFExamplePaused ? FFFExampleTime : 0;
        layer.beginTime = 0;
    }
    [CATransaction commit];
}

// Once it has been drawn paused.
RCT_EXPORT_METHOD(pause : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
    if (!FFFExamplePaused) {
        FFFExampleTime = CACurrentMediaTime();
        FFFExamplePaused = YES;
        FFFExampleSetTime();
    }
    [FFFExampleFrames after:3 done:^{ resolve(nil); }];
}

// Moves the animations on by `ms`, once that much real time has passed since
// the pause too (the clock never gets ahead of real time, so it doesn't go
// back when it resumes), and resolves once that frame has been drawn.
RCT_EXPORT_METHOD(step : (double)ms resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
    if (!FFFExamplePaused) return resolve(nil);
    FFFExampleTime += ms / 1000;
    CFTimeInterval wait = FFFExampleTime - CACurrentMediaTime();
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(MAX(0, wait) * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        FFFExampleSetTime();
        [FFFExampleFrames after:2 done:^{ resolve(nil); }];
    });
}

// Back to real time: animations still running catch up to it.
RCT_EXPORT_METHOD(resume : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
    FFFExamplePaused = NO;
    FFFExampleSetTime();
    resolve(nil);
}

@end
