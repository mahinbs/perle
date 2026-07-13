package com.syntraiq.com;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Explicit Android runtime request for RECORD_AUDIO.
 * Capacitor's WebView also prompts via getUserMedia, but requesting first
 * makes the system dialog reliable before speech / voice input starts.
 */
@CapacitorPlugin(
    name = "MicrophonePermission",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class MicrophonePermissionPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        result.put("microphone", getPermissionState("microphone").toString());
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("microphone", PermissionState.GRANTED.toString());
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        PermissionState state = getPermissionState("microphone");
        result.put("microphone", state.toString());
        if (state == PermissionState.GRANTED) {
            call.resolve(result);
        } else {
            call.reject("Microphone permission denied");
        }
    }
}
