import Foundation
import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin {
    private var products: [String: Product] = [:]
    private var updateListenerTask: Task<Void, Error>? = nil
    
    override public func load() {
        super.load()
        // Listen for transactions that happen outside the app (e.g. App Store renewals)
        updateListenerTask = Task.detached {
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    // Deliver content to the user
                    await transaction.finish()
                } catch {
                    print("Transaction update verification failed: \(error)")
                }
            }
        }
    }
    
    deinit {
        updateListenerTask?.cancel()
    }
    
    @objc func initialize(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        let canMakePayments = true
        #else
        let canMakePayments = AppStore.canMakePayments || SKPaymentQueue.canMakePayments()
        #endif
        call.resolve([
            "canMakePayments": canMakePayments
        ])
    }
    
    @objc func loadProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self) else {
            call.reject("Product IDs are required")
            return
        }
        
        Task {
            do {
                let storeProducts = try await Product.products(for: productIds)
                var responseArray: [[String: Any]] = []
                
                for product in storeProducts {
                    self.products[product.id] = product
                    
                    let productDict: [String: Any] = [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "price": product.price,
                        "displayPrice": product.displayPrice,
                        "type": product.type.rawValue
                    ]
                    
                    responseArray.append(productDict)
                }
                
                call.resolve([
                    "products": responseArray
                ])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Product ID is required")
            return
        }
        
        Task {
            // Load products if not already cached
            if self.products[productId] == nil {
                do {
                    let storeProducts = try await Product.products(for: [productId])
                    if let product = storeProducts.first {
                        self.products[product.id] = product
                    }
                } catch {
                    call.reject("Failed to load product before purchase: \(error.localizedDescription)")
                    return
                }
            }
            
            guard let product = self.products[productId] else {
                call.reject("Product not found")
                return
            }
            
            do {
                let result = try await product.purchase()
                
                switch result {
                case .success(let verificationResult):
                    let transaction = try self.checkVerified(verificationResult)
                    
                    // Get base64 encoded receipt representation
                    let receiptBase64 = self.getReceiptBase64()
                    
                    await transaction.finish()
                    
                    call.resolve([
                        "success": true,
                        "transaction": [
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                            "purchaseDate": transaction.purchaseDate.timeIntervalSince1970 * 1000,
                            "receipt": receiptBase64
                        ]
                    ])
                    
                case .userCancelled:
                    call.resolve([
                        "success": false,
                        "userCancelled": true
                    ])
                    
                case .pending:
                    call.resolve([
                        "success": false,
                        "pending": true
                    ])
                    
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                // Sync user transactions with the App Store
                try await AppStore.sync()
                
                var activeSubscriptions: [[String: Any]] = []
                
                // Scan current active entitlements
                for await result in Transaction.currentEntitlements {
                    do {
                        let transaction = try self.checkVerified(result)
                        let receiptBase64 = self.getReceiptBase64()
                        
                        activeSubscriptions.append([
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                            "purchaseDate": transaction.purchaseDate.timeIntervalSince1970 * 1000,
                            "receipt": receiptBase64
                        ])
                    } catch {
                        print("Verification of current entitlement failed: \(error)")
                    }
                }
                
                call.resolve([
                    "transactions": activeSubscriptions
                ])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func getCurrentSubscriptions(_ call: CAPPluginCall) {
        Task {
            var activeSubscriptions: [[String: Any]] = []
            
            for await result in Transaction.currentEntitlements {
                do {
                    let transaction = try self.checkVerified(result)
                    let receiptBase64 = self.getReceiptBase64()
                    
                    activeSubscriptions.append([
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                        "purchaseDate": transaction.purchaseDate.timeIntervalSince1970 * 1000,
                        "receipt": receiptBase64
                    ])
                } catch {
                    print("Verification of current entitlement failed: \(error)")
                }
            }
            
            call.resolve([
                "subscriptions": activeSubscriptions
            ])
        }
    }
    
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
    
    private func getReceiptBase64() -> String {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              let receiptData = try? Data(contentsOf: receiptURL) else {
            return ""
        }
        return receiptData.base64EncodedString()
    }
}
