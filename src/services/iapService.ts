import { registerPlugin, Capacitor } from '@capacitor/core';

export interface IAPProduct {
  id: string;
  displayName: string;
  description: string;
  price: number;
  displayPrice: string;
  type: string;
}

export interface IAPTransaction {
  transactionId: string;
  productId: string;
  purchaseDate: number;
  receipt: string;
}

export interface IAPPluginInterface {
  initialize(): Promise<{ canMakePayments: boolean }>;
  loadProducts(options: { productIds: string[] }): Promise<{ products: IAPProduct[] }>;
  purchase(options: { productId: string }): Promise<{
    success: boolean;
    transaction?: IAPTransaction;
    userCancelled?: boolean;
    pending?: boolean;
  }>;
  restorePurchases(): Promise<{ transactions: IAPTransaction[] }>;
  getCurrentSubscriptions(): Promise<{ subscriptions: IAPTransaction[] }>;
}

// Register the custom Capacitor native plugin
const IAP = registerPlugin<IAPPluginInterface>('IAP');

export class IAPService {
  private static instance: IAPService;
  private isInitialized = false;
  private canMakePayments = false;

  private constructor() { }

  public static getInstance(): IAPService {
    if (!IAPService.instance) {
      IAPService.instance = new IAPService();
    }
    return IAPService.instance;
  }

  /**
   * Helper to check if running on native iOS
   */
  private isNativeIOS(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  }

  /**
   * Initialize the IAP system
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (!this.isNativeIOS()) {
      console.warn('IAP is only supported on native iOS. Initializing mock system.');
      this.isInitialized = true;
      this.canMakePayments = true;
      return true;
    }

    try {
      const result = await IAP.initialize();
      this.canMakePayments = result.canMakePayments;
      this.isInitialized = true;
      console.log(`IAP initialized. Payments allowed on device: ${this.canMakePayments}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize IAP plugin:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Fetch product details (price, title, etc.) from App Store
   */
  public async loadProducts(productIds: string[]): Promise<IAPProduct[]> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      // Mock products for development in browser
      return productIds.map(id => ({
        id,
        displayName: id.includes('max') ? 'IQ Max (Mock)' : 'IQ Pro (Mock)',
        description: id.includes('max') ? 'Built for teams running mission-critical workflows' : 'Perfect for creators and strategists',
        price: id.includes('max') ? 899.00 : 399.00,
        displayPrice: id.includes('max') ? '$10.99' : '$4.99',
        type: 'autoRenewable'
      }));
    }

    try {
      const result = await IAP.loadProducts({ productIds });
      return result.products;
    } catch (error) {
      console.error('Failed to load products from App Store:', error);
      throw error;
    }
  }

  /**
   * Trigger the App Store purchase sheet for a product
   */
  public async purchase(productId: string): Promise<{
    success: boolean;
    transaction?: IAPTransaction;
    userCancelled?: boolean;
    pending?: boolean;
    error?: any;
  }> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      console.log(`Simulating mock purchase for product: ${productId}`);
      // Simulate successful purchase in non-native dev environments
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            success: true,
            transaction: {
              transactionId: `mock_tx_${Date.now()}`,
              productId,
              purchaseDate: Date.now(),
              receipt: 'MOCK_BASE64_APPLE_RECEIPT_DATA'
            }
          });
        }, 1500);
      });
    }

    if (!this.canMakePayments) {
      console.warn('In-App Purchases capability check returned false. Attempting purchase anyway...');
    }

    try {
      const result = await IAP.purchase({ productId });
      return result;
    } catch (error: any) {
      console.error(`Purchase transaction failed for ${productId}:`, error);
      return {
        success: false,
        error
      };
    }
  }

  /**
   * Restore previous purchases
   */
  public async restorePurchases(): Promise<IAPTransaction[]> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      console.log('Simulating mock restore purchases');
      return [
        {
          transactionId: 'mock_restore_tx_123',
          productId: 'com.syntraiq.com.pro_v1_v1',
          purchaseDate: Date.now() - 86400000 * 5, // 5 days ago
          receipt: 'MOCK_BASE64_APPLE_RECEIPT_DATA'
        }
      ];
    }

    try {
      const result = await IAP.restorePurchases();
      return result.transactions;
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      throw error;
    }
  }

  /**
   * Get active subscription transactions
   */
  public async getCurrentSubscriptions(): Promise<IAPTransaction[]> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      return [];
    }

    try {
      const result = await IAP.getCurrentSubscriptions();
      return result.subscriptions;
    } catch (error) {
      console.error('Failed to get current subscriptions:', error);
      throw error;
    }
  }
}
