import { baseApi } from "@/services/baseApi";
import type { ApiEnvelope } from "@/types/auth.types";
import type { CustomerRecord, OrderRecord, PaginatedResult, ProductRecord, StartConnectionResult, StartSyncResult, StoreConnection, SyncResource, SyncRun } from "@/types/merchant.types";

interface DataQuery { connectionId: string; page: number; perPage: number }
interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

function toPaginatedResult<T>(response: PaginatedEnvelope<T>): PaginatedResult<T> {
  return { data: response.data, meta: response.meta };
}

export const connectionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getConnections: builder.query<StoreConnection[], void>({
      query: () => "connections",
      transformResponse: (response: ApiEnvelope<StoreConnection[]>) => response.data,
      providesTags: ["Connection"],
    }),
    startSallaConnection: builder.mutation<StartConnectionResult, { storeUrl: string }>({
      query: (body) => ({ url: "connections/salla/start", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<StartConnectionResult>) => response.data,
    }),
    startSync: builder.mutation<StartSyncResult, { connectionId: string; resource: SyncResource }>({
      query: ({ connectionId, resource }) => ({ url: `connections/${connectionId}/sync`, method: "POST", body: { resource } }),
      transformResponse: (response: ApiEnvelope<StartSyncResult>) => response.data,
      invalidatesTags: (_result, _error, arg) => [{ type: "SyncRun", id: arg.connectionId }],
    }),
    getSyncRuns: builder.query<SyncRun[], string>({
      query: (connectionId) => `connections/${connectionId}/sync-runs`,
      transformResponse: (response: ApiEnvelope<SyncRun[]>) => response.data,
      providesTags: (_result, _error, connectionId) => [{ type: "SyncRun", id: connectionId }],
    }),
    getProducts: builder.query<PaginatedResult<ProductRecord>, DataQuery>({
      query: ({ connectionId, page, perPage }) => `connections/${connectionId}/products?page=${page}&perPage=${perPage}`,
      transformResponse: toPaginatedResult<ProductRecord>,
      providesTags: (_result, _error, { connectionId }) => [{ type: "Connection", id: connectionId }],
    }),
    getCustomers: builder.query<PaginatedResult<CustomerRecord>, DataQuery>({
      query: ({ connectionId, page, perPage }) => `connections/${connectionId}/customers?page=${page}&perPage=${perPage}`,
      transformResponse: toPaginatedResult<CustomerRecord>,
      providesTags: (_result, _error, { connectionId }) => [{ type: "Connection", id: connectionId }],
    }),
    getOrders: builder.query<PaginatedResult<OrderRecord>, DataQuery>({
      query: ({ connectionId, page, perPage }) => `connections/${connectionId}/orders?page=${page}&perPage=${perPage}`,
      transformResponse: toPaginatedResult<OrderRecord>,
      providesTags: (_result, _error, { connectionId }) => [{ type: "Connection", id: connectionId }],
    }),
    disconnectConnection: builder.mutation<void, string>({
      query: (connectionId) => ({ url: `connections/${connectionId}`, method: "DELETE" }),
      invalidatesTags: ["Connection"],
    }),
  }),
});

export const { useGetConnectionsQuery, useStartSallaConnectionMutation, useStartSyncMutation, useGetSyncRunsQuery, useGetProductsQuery, useGetCustomersQuery, useGetOrdersQuery, useDisconnectConnectionMutation } = connectionsApi;
