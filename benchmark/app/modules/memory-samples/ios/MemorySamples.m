// The app's memory, measured in the app every 250 ms while the iOS memory
// tests run it (launched with -memorySamples YES) and sent to their image
// server (-server), which TotalMemoryMetric (../../../../ios/UITests) reads:
// its physical footprint, what XCTMemoryMetric measures (and its peak, which
// iOS keeps, between samples too), and its CoreGraphics bitmap data, which
// iOS leaves out of the footprint. Decoded images can be in either: full-size
// JPEGs come from the hardware decoder as IOSurfaces, which the footprint
// counts, but images decoded in software (an animation's buffered frames,
// downsampled images) are bitmap data. Both take the phone's memory. Only the
// app can see its own memory regions.
#import <Foundation/Foundation.h>
#import <mach/mach.h>

@interface MemorySamples : NSObject
@end

// Sends a sample every 250 ms, as long as the app runs. A sample takes about
// 10 ms.
static dispatch_source_t timer;

@implementation MemorySamples

+ (void) load {
    dispatch_queue_t queue = dispatch_queue_create("MemorySamples", DISPATCH_QUEUE_SERIAL_WITH_AUTORELEASE_POOL);
    dispatch_async(queue, ^{
        NSUserDefaults* defaults = NSUserDefaults.standardUserDefaults;
        NSString* server = [defaults stringForKey: @"server"];
        NSString* run = [defaults stringForKey: @"run"];
        if (![defaults boolForKey: @"memorySamples"] || !server || !run) {
            return;
        }
        NSURLSession* session = [NSURLSession sessionWithConfiguration: NSURLSessionConfiguration.ephemeralSessionConfiguration];
        NSString* query = [run stringByAddingPercentEncodingWithAllowedCharacters: NSCharacterSet.URLQueryAllowedCharacterSet];
        timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, queue);
        dispatch_source_set_timer(timer, DISPATCH_TIME_NOW, 250 * NSEC_PER_MSEC, 10 * NSEC_PER_MSEC);
        dispatch_source_set_event_handler(timer, ^{
            task_vm_info_data_t info;
            mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
            if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) {
                return;
            }
            NSString* url = [NSString stringWithFormat: @"%@/memory?run=%@&footprint=%llu&peak=%llu&bitmaps=%llu", server, query, info.phys_footprint, info.ledger_phys_footprint_peak, [self bitmaps]];
            [[session dataTaskWithURL: [NSURL URLWithString: url]] resume];
        });
        dispatch_resume(timer);
    });
}

// The bitmap data's dirty pages, in memory or compressed. Not in submaps
// (the shared libraries'), which are most of the regions.
+ (uint64_t) bitmaps {
    uint64_t bytes = 0;
    vm_address_t address = 0;
    vm_size_t size = 0;
    while (YES) {
        natural_t depth = 0;
        vm_region_submap_info_data_64_t info;
        mach_msg_type_number_t count = VM_REGION_SUBMAP_INFO_COUNT_64;
        if (vm_region_recurse_64(mach_task_self(), &address, &size, &depth, (vm_region_recurse_info_t)&info, &count) != KERN_SUCCESS) {
            break;
        }
        if (!info.is_submap && info.user_tag == VM_MEMORY_COREGRAPHICS_DATA) {
            bytes += ((uint64_t)info.pages_dirtied + info.pages_swapped_out) * vm_kernel_page_size;
        }
        address += size;
    }
    return bytes;
}

@end
