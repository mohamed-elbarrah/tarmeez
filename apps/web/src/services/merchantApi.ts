import { baseApi } from "@/services/baseApi";
import type { ApiEnvelope } from "@/types/auth.types";
import type { Invitation, MerchantProfile, TeamMember } from "@/types/merchant.types";

export const merchantApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMerchantProfile: builder.query<MerchantProfile, void>({
      query: () => "merchants/me",
      transformResponse: (response: ApiEnvelope<MerchantProfile>) => response.data,
      providesTags: ["MerchantProfile"],
    }),
    updateMerchantName: builder.mutation<MerchantProfile, { name: string }>({
      query: (body) => ({ url: "merchants/me", method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<MerchantProfile>) => response.data,
      invalidatesTags: ["MerchantProfile"],
    }),
    getTeam: builder.query<TeamMember[], void>({
      query: () => "merchants/me/team",
      transformResponse: (response: ApiEnvelope<TeamMember[]>) => response.data,
      providesTags: ["Team"],
    }),
    getInvitations: builder.query<Invitation[], void>({
      query: () => "merchants/me/team/invitations",
      transformResponse: (response: ApiEnvelope<Invitation[]>) => response.data,
      providesTags: ["Invitation"],
    }),
    inviteTeamMember: builder.mutation<{ invitation: Invitation }, { email: string }>({
      query: (body) => ({ url: "merchants/me/team/invitations", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<{ invitation: Invitation }>) => response.data,
      invalidatesTags: ["Invitation", "Team"],
    }),
    resendInvitation: builder.mutation<{ invitation: Invitation }, string>({
      query: (invitationId) => ({ url: `merchants/me/team/invitations/${invitationId}/resend`, method: "POST" }),
      transformResponse: (response: ApiEnvelope<{ invitation: Invitation }>) => response.data,
      invalidatesTags: ["Invitation"],
    }),
    revokeInvitation: builder.mutation<void, string>({
      query: (invitationId) => ({ url: `merchants/me/team/invitations/${invitationId}`, method: "DELETE" }),
      invalidatesTags: ["Invitation"],
    }),
    removeTeamMember: builder.mutation<void, string>({
      query: (membershipId) => ({ url: `merchants/me/team/${membershipId}`, method: "DELETE" }),
      invalidatesTags: ["Team"],
    }),
  }),
});

export const { useGetMerchantProfileQuery, useUpdateMerchantNameMutation, useGetTeamQuery, useGetInvitationsQuery, useInviteTeamMemberMutation, useResendInvitationMutation, useRevokeInvitationMutation, useRemoveTeamMemberMutation } = merchantApi;
