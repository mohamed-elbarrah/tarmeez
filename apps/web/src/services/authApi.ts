import { baseApi } from "@/services/baseApi";
import { clearCredentials, setCredentials } from "@/store/slices/authSlice";
import type { ApiEnvelope, AuthSession, ForgotPasswordRequest, InvitationRequest, LoginRequest, Principal, RegisterRequest, ResetPasswordRequest, VerifyEmailRequest } from "@/types/auth.types";

interface RegisterResult { emailVerificationRequired: boolean; messageKey: string }
interface MessageResult { messageKey: string }
interface RefreshResult { accessToken: string }

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthSession, LoginRequest>({
      query: (body) => ({ url: "auth/login", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<AuthSession>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { const { data } = await queryFulfilled; dispatch(setCredentials(data)); }
        catch { /* Errors are exposed through the mutation result. */ }
      },
    }),
    register: builder.mutation<RegisterResult, RegisterRequest>({
      query: (body) => ({ url: "auth/register", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<RegisterResult>) => response.data,
    }),
    verifyEmail: builder.mutation<AuthSession, VerifyEmailRequest>({
      query: (body) => ({ url: "auth/verify-email", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<AuthSession>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { const { data } = await queryFulfilled; dispatch(setCredentials(data)); }
        catch { /* Errors are exposed through the mutation result. */ }
      },
    }),
    acceptInvitation: builder.mutation<AuthSession, InvitationRequest>({
      query: (body) => ({ url: "auth/accept-invitation", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<AuthSession>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { const { data } = await queryFulfilled; dispatch(setCredentials(data)); }
        catch { /* Errors are exposed through the mutation result. */ }
      },
    }),
    forgotPassword: builder.mutation<MessageResult, ForgotPasswordRequest>({
      query: (body) => ({ url: "auth/forgot-password", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<MessageResult>) => response.data,
    }),
    resetPassword: builder.mutation<MessageResult, ResetPasswordRequest>({
      query: (body) => ({ url: "auth/reset-password", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<MessageResult>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { await queryFulfilled; dispatch(clearCredentials()); }
        catch { /* Errors are exposed through the mutation result. */ }
      },
    }),
    refresh: builder.mutation<RefreshResult, void>({
      query: () => ({ url: "auth/refresh", method: "POST" }),
      transformResponse: (response: ApiEnvelope<RefreshResult>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { const { data } = await queryFulfilled; dispatch(setCredentials({ accessToken: data.accessToken })); }
        catch { dispatch(clearCredentials()); }
      },
    }),
    logout: builder.mutation<MessageResult, void>({
      query: () => ({ url: "auth/logout", method: "POST" }),
      transformResponse: (response: ApiEnvelope<MessageResult>) => response.data,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try { await queryFulfilled; } finally { dispatch(clearCredentials()); }
      },
    }),
    getMe: builder.query<Principal, void>({
      query: () => "auth/me",
      transformResponse: (response: ApiEnvelope<Principal>) => response.data,
      providesTags: ["Auth"],
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation, useVerifyEmailMutation, useAcceptInvitationMutation, useForgotPasswordMutation, useResetPasswordMutation, useRefreshMutation, useLogoutMutation, useGetMeQuery } = authApi;
