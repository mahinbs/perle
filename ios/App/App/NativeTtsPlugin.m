#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeTtsPlugin, "NativeTts",
    CAP_PLUGIN_METHOD(warmUp, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(speak, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isSpeaking, CAPPluginReturnPromise);
)
