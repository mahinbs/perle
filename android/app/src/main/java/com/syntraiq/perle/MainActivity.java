package com.syntraiq.com;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IAPPlugin.class);
        registerPlugin(OAuthSessionPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().post(() -> handleOAuthCallbackIntent(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOAuthCallbackIntent(intent);
    }

    private void handleOAuthCallbackIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        Uri data = intent.getData();
        if (data == null) {
            return;
        }

        PluginHandle handle = getBridge().getPlugin("OAuthSession");
        if (handle == null || handle.getInstance() == null) {
            return;
        }

        if (handle.getInstance() instanceof OAuthSessionPlugin) {
            ((OAuthSessionPlugin) handle.getInstance()).handleCallbackUrl(data.toString());
        }
    }
}
