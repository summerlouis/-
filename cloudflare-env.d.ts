declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ASSETS?: Fetcher;
    ORDER_EVENTS?: DurableObjectNamespace;
    BAO_STANDALONE?: string;
    PAYMENT_MODE?: string;
    STORE_ID?: string;
    SESSION_SECRET?: string;
    ADMIN_DEVICE_CODE?: string;
    CASHIER_DEVICE_CODE?: string;
    KITCHEN_DEVICE_CODE?: string;
  }
}
