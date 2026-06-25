package com.syntraiq.com;

import android.content.Intent;
import android.net.Uri;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OAuthSession")
public class OAuthSessionPlugin extends Plugin {
    private PluginCall pendingCall;
    private String expectedScheme;

    @PluginMethod
    public void authenticate(PluginCall call) {
        String url = call.getString("url");
        String callbackScheme = call.getString("callbackScheme");

        if (url == null || url.isEmpty() || callbackScheme == null || callbackScheme.isEmpty()) {
            call.reject("url and callbackScheme are required");
            return;
        }

        pendingCall = call;
        expectedScheme = callbackScheme;

        CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder().build();
        customTabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        customTabsIntent.launchUrl(getContext(), Uri.parse(url));
    }

    public boolean handleCallbackUrl(String url) {
        if (pendingCall == null || url == null || expectedScheme == null) {
            return false;
        }

        if (!url.startsWith(expectedScheme + "://")) {
            return false;
        }

        JSObject result = new JSObject();
        result.put("callbackUrl", url);
        result.put("cancelled", false);
        pendingCall.resolve(result);
        pendingCall = null;
        expectedScheme = null;
        return true;
    }

    public void cancelPending(String message) {
        if (pendingCall == null) {
            return;
        }

        pendingCall.reject(message);
        pendingCall = null;
        expectedScheme = null;
    }
}
