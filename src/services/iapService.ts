import { registerPlugin, Capacitor } from '@capacitor/core';

export const IAP_PRODUCT_IDS = {
  pro: 'com.syntraiq.com.pro_v1',
  max: 'com.syntraiq.com.max_v1',
} as const;

export type IAPPlanId = keyof typeof IAP_PRODUCT_IDS;

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

  private isNativeIOS(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  }

  public getProductIdForPlan(planId: IAPPlanId): string {
    return IAP_PRODUCT_IDS[planId];
  }

  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (!this.isNativeIOS()) {
      this.isInitialized = true;
      this.canMakePayments = false;
      return false;
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

  public async loadProducts(productIds: string[]): Promise<IAPProduct[]> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      return [];
    }

    try {
      const result = await IAP.loadProducts({ productIds });
      return result.products;
    } catch (error) {
      console.error('Failed to load products from App Store:', error);
      throw error;
    }
  }

  public async purchase(productId: string): Promise<{
    success: boolean;
    transaction?: IAPTransaction;
    userCancelled?: boolean;
    pending?: boolean;
    error?: any;
  }> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      return {
        success: false,
        error: { message: 'In-App Purchases are only available on iOS' },
      };
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

  public async restorePurchases(): Promise<IAPTransaction[]> {
    await this.initialize();

    if (!this.isNativeIOS()) {
      return [];
    }

    try {
      const result = await IAP.restorePurchases();
      return result.transactions;
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      throw error;
    }
  }

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
