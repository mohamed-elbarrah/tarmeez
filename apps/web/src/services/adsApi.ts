import { baseApi } from "@/services/baseApi";
import type { ApiEnvelope } from "@/types/auth.types";
import type {
  AdAccountConnection,
  AdCampaign,
  AdStatusAction,
  MetaIntent,
  MetaStartResult,
} from "@/types/ads.types";
import type { PaginatedResult } from "@/types/merchant.types";

export const adsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    startMetaConnection: builder.mutation<MetaStartResult, void>({
      query: () => ({ url: "connections/meta/start", method: "POST" }),
      transformResponse: (response: ApiEnvelope<MetaStartResult>) =>
        response.data,
    }),
    getMetaIntent: builder.query<MetaIntent, string>({
      query: (intentId) => `connections/meta/intents/${intentId}`,
      transformResponse: (response: ApiEnvelope<MetaIntent>) => response.data,
      providesTags: (_result, _error, intentId) => [
        { type: "ConnectionIntent", id: intentId },
      ],
    }),
    completeMetaConnection: builder.mutation<
      {
        connected: Array<{
          externalAccountId: string;
          name: string;
          syncQueued: boolean;
        }>;
      },
      { intentId: string; accountIds: string[] }
    >({
      query: ({ intentId, accountIds }) => ({
        url: `connections/meta/intents/${intentId}/complete`,
        method: "POST",
        body: { accountIds },
      }),
      transformResponse: (
        response: ApiEnvelope<{
          connected: Array<{
            externalAccountId: string;
            name: string;
            syncQueued: boolean;
          }>;
        }>,
      ) => response.data,
      invalidatesTags: ["Connection", "AdAccount"],
    }),
    getAdAccounts: builder.query<AdAccountConnection[], void>({
      query: () => "connections/ads",
      transformResponse: (response: ApiEnvelope<AdAccountConnection[]>) =>
        response.data,
      providesTags: (result) =>
        result
          ? [
              { type: "AdAccount", id: "LIST" },
              ...result.map((account) => ({
                type: "AdAccount" as const,
                id: account.id,
              })),
            ]
          : [{ type: "AdAccount", id: "LIST" }],
    }),
    syncAdAccount: builder.mutation<
      { queued: boolean; syncRunId: string },
      string
    >({
      query: (accountId) => ({
        url: `connections/ads/${accountId}/sync`,
        method: "POST",
      }),
      transformResponse: (
        response: ApiEnvelope<{ queued: boolean; syncRunId: string }>,
      ) => response.data,
      invalidatesTags: (_result, _error, accountId) => [
        { type: "AdAccount", id: accountId },
      ],
    }),
    disconnectAdAccount: builder.mutation<{ disconnected: boolean }, string>({
      query: (accountId) => ({
        url: `connections/ads/${accountId}`,
        method: "DELETE",
      }),
      transformResponse: (response: ApiEnvelope<{ disconnected: boolean }>) =>
        response.data,
      invalidatesTags: ["AdAccount"],
    }),
    getAdCampaigns: builder.query<
      PaginatedResult<AdCampaign>,
      {
        accountId: string;
        page: number;
        perPage: number;
        configuredStatus?: string;
      }
    >({
      query: ({ accountId, page, perPage, configuredStatus }) => {
        const params = new URLSearchParams({
          page: String(page),
          perPage: String(perPage),
        });
        if (configuredStatus) params.set("configuredStatus", configuredStatus);
        return `ads/accounts/${accountId}/campaigns?${params.toString()}`;
      },
      transformResponse: (response: PaginatedResult<AdCampaign>) => response,
      providesTags: (result, _error, { accountId }) =>
        result
          ? [
              { type: "AdCampaign", id: `ACCOUNT-${accountId}` },
              ...result.data.map((campaign) => ({
                type: "AdCampaign" as const,
                id: campaign.id,
              })),
            ]
          : [{ type: "AdCampaign", id: `ACCOUNT-${accountId}` }],
    }),
    getAdCampaign: builder.query<AdCampaign, string>({
      query: (campaignId) => `ads/campaigns/${campaignId}`,
      transformResponse: (response: ApiEnvelope<AdCampaign>) => response.data,
      providesTags: (_result, _error, campaignId) => [
        { type: "AdCampaign", id: campaignId },
      ],
    }),
    updateAdCampaignStatus: builder.mutation<
      { actionId: string; state: AdStatusAction["state"] },
      {
        campaignId: string;
        status: "ACTIVE" | "PAUSED";
        expectedStatus: string;
        idempotencyKey: string;
      }
    >({
      query: ({ campaignId, status, expectedStatus, idempotencyKey }) => ({
        url: `ads/campaigns/${campaignId}/status`,
        method: "PATCH",
        body: { status, expectedStatus, idempotencyKey },
      }),
      transformResponse: (
        response: ApiEnvelope<{
          actionId: string;
          state: AdStatusAction["state"];
        }>,
      ) => response.data,
      invalidatesTags: (_result, _error, { campaignId }) => [
        { type: "AdCampaign", id: campaignId },
      ],
    }),
    getAdStatusAction: builder.query<
      AdStatusAction,
      { campaignId: string; actionId: string }
    >({
      query: ({ campaignId, actionId }) =>
        `ads/campaigns/${campaignId}/status-actions/${actionId}`,
      transformResponse: (response: ApiEnvelope<AdStatusAction>) =>
        response.data,
    }),
  }),
});

export const {
  useStartMetaConnectionMutation,
  useGetMetaIntentQuery,
  useCompleteMetaConnectionMutation,
  useGetAdAccountsQuery,
  useSyncAdAccountMutation,
  useDisconnectAdAccountMutation,
  useGetAdCampaignsQuery,
  useGetAdCampaignQuery,
  useUpdateAdCampaignStatusMutation,
  useGetAdStatusActionQuery,
} = adsApi;
