#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Register the custom IAP plugin and its methods with the Capacitor bridge
CAP_PLUGIN(IAPPlugin, "IAP",
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(loadProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restorePurchases, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentSubscriptions, CAPPluginReturnPromise);
)
