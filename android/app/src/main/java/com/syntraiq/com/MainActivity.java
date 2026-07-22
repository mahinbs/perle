package com.syntraiq.com;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.PluginHandle;

/**
 * Capacitor host activity.
 *
 * Razorpay Checkout.js runs inside this WebView. UPI Intent is enabled by:
 * 1) passing {@code webview_intent: true} from JS (see razorpayService.ts)
 * 2) launching non-http deep links (upi://, phonepe://, …) from the WebView
 * 3) package visibility queries in AndroidManifest.xml
 *
 * @see <a href="https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android/">UPI Intent in WebView</a>
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OAuthSessionPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(NativeTtsPlugin.class);
        registerPlugin(MediaFilesPlugin.class);
        super.onCreate(savedInstanceState);

        // Keep content inside system bars so Razorpay Continue/Cancel aren't
        // covered by the Android navigation / gesture bar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        bridge.getWebView().post(() -> {
            WebView webView = bridge.getWebView();
            android.webkit.WebSettings settings = webView.getSettings();
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            // Allow mic / media capture without an extra user gesture race.
            settings.setMediaPlaybackRequiresUserGesture(false);

            // Ensure UPI / wallet deep links leave the WebView (Razorpay Intent).
            webView.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if (url != null && shouldLaunchExternalPaymentApp(url)) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, url);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return true;
                        } catch (Exception ignored) {
                            return true;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });

            handleOAuthCallbackIntent(getIntent());
        });
    }

    /**
     * UPI Intent / wallet schemes used by Razorpay Checkout in a WebView.
     * Capacitor already launches unknown hosts, but these schemes must always
     * open externally even when partially handled by the WebView.
     */
    private static boolean shouldLaunchExternalPaymentApp(Uri url) {
        String scheme = url.getScheme();
        if (scheme == null) {
            return false;
        }
        String s = scheme.toLowerCase();
        return s.equals("upi")
            || s.equals("phonepe")
            || s.equals("gpay")
            || s.equals("tez")
            || s.equals("paytmmp")
            || s.equals("paytm")
            || s.equals("bhim")
            || s.equals("amazonpay")
            || s.equals("credpay")
            || s.startsWith("intent");
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
