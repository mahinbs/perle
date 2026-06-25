#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(OAuthSessionPlugin, "OAuthSession",
    CAP_PLUGIN_METHOD(authenticate, CAPPluginReturnPromise);
)
