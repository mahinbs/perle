#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MediaFilesPlugin, "MediaFiles",
    CAP_PLUGIN_METHOD(save, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(share, CAPPluginReturnPromise);
)
