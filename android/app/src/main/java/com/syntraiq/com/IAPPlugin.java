package com.syntraiq.com;

import android.app.Activity;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "IAP")
public class IAPPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private boolean isConnected = false;
    private PluginCall pendingPurchaseCall;
    private final Map<String, ProductDetails> products = new HashMap<>();

    private BillingClient getOrCreateBillingClient() {
        if (billingClient == null) {
            billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                    PendingPurchasesParams.newBuilder()
                        .enableOneTimeProducts()
                        .build()
                )
                .build();
        }
        return billingClient;
    }

    private void ensureConnected(PluginCall call, Runnable onConnected) {
        BillingClient client = getOrCreateBillingClient();

        if (isConnected) {
            onConnected.run();
            return;
        }

        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    isConnected = true;
                    onConnected.run();
                } else {
                    call.reject("Billing setup failed: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                isConnected = false;
            }
        });
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        ensureConnected(call, () -> {
            JSObject result = new JSObject();
            result.put("canMakePayments", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void loadProducts(PluginCall call) {
        JSArray productIdsArray = call.getArray("productIds");
        if (productIdsArray == null || productIdsArray.length() == 0) {
            call.reject("Product IDs are required");
            return;
        }

        List<String> productIds = new ArrayList<>();
        try {
            for (int i = 0; i < productIdsArray.length(); i++) {
                productIds.add(productIdsArray.getString(i));
            }
        } catch (Exception e) {
            call.reject("Invalid product IDs");
            return;
        }

        ensureConnected(call, () -> {
            List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
            for (String productId : productIds) {
                productList.add(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                );
            }

            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build();

            getOrCreateBillingClient().queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Failed to load products: " + billingResult.getDebugMessage());
                    return;
                }

                JSArray productsArray = new JSArray();
                for (ProductDetails details : productDetailsList) {
                    products.put(details.getProductId(), details);

                    String displayPrice = "";
                    double price = 0;
                    if (details.getSubscriptionOfferDetails() != null
                        && !details.getSubscriptionOfferDetails().isEmpty()) {
                        ProductDetails.SubscriptionOfferDetails offer =
                            details.getSubscriptionOfferDetails().get(0);
                        if (offer.getPricingPhases() != null
                            && !offer.getPricingPhases().getPricingPhaseList().isEmpty()) {
                            ProductDetails.PricingPhase phase =
                                offer.getPricingPhases().getPricingPhaseList().get(0);
                            displayPrice = phase.getFormattedPrice();
                            price = phase.getPriceAmountMicros() / 1_000_000.0;
                        }
                    }

                    JSObject product = new JSObject();
                    product.put("id", details.getProductId());
                    product.put("displayName", details.getName());
                    product.put("description", details.getDescription());
                    product.put("price", price);
                    product.put("displayPrice", displayPrice);
                    product.put("type", "subs");
                    productsArray.put(product);
                }

                JSObject result = new JSObject();
                result.put("products", productsArray);
                call.resolve(result);
            });
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("Product ID is required");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        Runnable launchPurchase = () -> {
            ProductDetails productDetails = products.get(productId);

            if (productDetails == null) {
                loadSingleProduct(productId, call, () -> launchBillingFlow(call, productId, activity));
                return;
            }

            launchBillingFlow(call, productId, activity);
        };

        ensureConnected(call, launchPurchase);
    }

    private void loadSingleProduct(String productId, PluginCall call, Runnable onLoaded) {
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        );

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build();

        getOrCreateBillingClient().queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                || productDetailsList.isEmpty()) {
                call.reject("Product not found: " + productId);
                return;
            }

            ProductDetails details = productDetailsList.get(0);
            products.put(details.getProductId(), details);
            onLoaded.run();
        });
    }

    private void launchBillingFlow(PluginCall call, String productId, Activity activity) {
        ProductDetails productDetails = products.get(productId);
        if (productDetails == null
            || productDetails.getSubscriptionOfferDetails() == null
            || productDetails.getSubscriptionOfferDetails().isEmpty()) {
            call.reject("Product not found or has no subscription offers");
            return;
        }

        ProductDetails.SubscriptionOfferDetails offer =
            productDetails.getSubscriptionOfferDetails().get(0);

        List<BillingFlowParams.ProductDetailsParams> productDetailsParamsList = new ArrayList<>();
        productDetailsParamsList.add(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .setOfferToken(offer.getOfferToken())
                .build()
        );

        BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build();

        pendingPurchaseCall = call;
        call.setKeepAlive(true);

        BillingResult result = getOrCreateBillingClient().launchBillingFlow(activity, billingFlowParams);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchaseCall = null;
            call.reject("Failed to launch billing flow: " + result.getDebugMessage());
        }
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (pendingPurchaseCall == null) {
            return;
        }

        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("userCancelled", true);
            call.resolve(result);
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            call.reject("Purchase failed: " + billingResult.getDebugMessage());
            return;
        }

        if (purchases == null || purchases.isEmpty()) {
            call.reject("No purchase data returned");
            return;
        }

        Purchase purchase = purchases.get(0);
        handlePurchase(call, purchase);
    }

    private void handlePurchase(PluginCall call, Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("pending", true);
            call.resolve(result);
            return;
        }

        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            call.reject("Purchase not completed");
            return;
        }

        Runnable resolvePurchase = () -> {
            JSObject transaction = new JSObject();
            transaction.put("transactionId", purchase.getOrderId() != null
                ? purchase.getOrderId()
                : purchase.getPurchaseToken());
            transaction.put("productId", purchase.getProducts().get(0));
            transaction.put("purchaseDate", purchase.getPurchaseTime());
            transaction.put("receipt", purchase.getPurchaseToken());

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("transaction", transaction);
            call.resolve(result);
        };

        if (!purchase.isAcknowledged()) {
            AcknowledgePurchaseParams acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();

            getOrCreateBillingClient().acknowledgePurchase(acknowledgeParams, ackResult -> {
                if (ackResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    resolvePurchase.run();
                } else {
                    call.reject("Failed to acknowledge purchase: " + ackResult.getDebugMessage());
                }
            });
        } else {
            resolvePurchase.run();
        }
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        ensureConnected(call, () -> queryPurchases(call, "transactions"));
    }

    @PluginMethod
    public void getCurrentSubscriptions(PluginCall call) {
        ensureConnected(call, () -> queryPurchases(call, "subscriptions"));
    }

    private void queryPurchases(PluginCall call, String resultKey) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build();

        getOrCreateBillingClient().queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Failed to query purchases: " + billingResult.getDebugMessage());
                return;
            }

            JSArray transactions = new JSArray();
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
                    continue;
                }

                for (String productId : purchase.getProducts()) {
                    JSObject tx = new JSObject();
                    tx.put("transactionId", purchase.getOrderId() != null
                        ? purchase.getOrderId()
                        : purchase.getPurchaseToken());
                    tx.put("productId", productId);
                    tx.put("purchaseDate", purchase.getPurchaseTime());
                    tx.put("receipt", purchase.getPurchaseToken());
                    transactions.put(tx);
                }
            }

            JSObject result = new JSObject();
            result.put(resultKey, transactions);
            call.resolve(result);
        });
    }
}
