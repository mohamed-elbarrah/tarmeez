export type MembershipRole = "OWNER" | "VIEWER";
export type MerchantStatus = "ACTIVE" | "SUSPENDED";
export type ConnectionStatus = "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED";
export type SyncResource = "ALL" | "PRODUCTS" | "CUSTOMERS" | "ORDERS";
export type SyncStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";

export interface MerchantProfile {
  role: MembershipRole;
  createdAt: string;
  user: { id: string; email: string; name: string; emailVerifiedAt: string | null };
  merchant: { id: string; name: string; status: MerchantStatus; createdAt: string; updatedAt: string };
}

export interface TeamMember {
  id: string;
  role: MembershipRole;
  createdAt: string;
  user: { id: string; email: string; name: string };
}

export interface Invitation {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  createdAt: string;
}

export interface StoreConnection {
  id: string;
  platform: "SALLA";
  externalStoreId: string;
  storeName: string | null;
  storeDomain: string | null;
  status: ConnectionStatus;
  connectedAt: string;
  verifiedAt: string | null;
}

export interface SyncRun {
  id: string;
  resource: SyncResource;
  status: SyncStatus;
  fetchedCount: number;
  upsertedCount: number;
  errorKey: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

export interface ProductRecord {
  id: string;
  externalId: string;
  name: string;
  sku: string | null;
  productType: string | null;
  description: string | null;
  status: string | null;
  currency: string | null;
  price: string | number | null;
  salePrice: string | number | null;
  quantity: number | null;
  isAvailable: boolean | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string;
}

export interface CustomerRecord {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string;
}

export interface OrderItemRecord {
  id: string;
  name: string | null;
  sku: string | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
  total: string | number | null;
  currency: string | null;
}

export interface OrderRecord {
  id: string;
  externalId: string;
  customerId: string | null;
  reference: string | null;
  status: string | null;
  currency: string | null;
  subtotal: string | number | null;
  discountTotal: string | number | null;
  shippingTotal: string | number | null;
  taxTotal: string | number | null;
  total: string | number | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string;
  items: OrderItemRecord[];
}

export interface StartConnectionResult {
  intentId: string;
  installationUrl: string;
  expiresAt: string;
}

export interface StartSyncResult {
  syncRunId: string;
  resource: SyncResource;
  status: SyncStatus;
  createdAt: string;
}
