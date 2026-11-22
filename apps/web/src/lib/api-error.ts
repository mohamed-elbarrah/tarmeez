import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

const messages: Record<string, string> = {
  "errors.auth.invalid_credentials": "The email or password is incorrect. Please try again.",
  "errors.auth.invalid_or_expired_otp": "That code is invalid or expired. Check it and try again.",
  "errors.auth.otp_attempts_exceeded": "Too many attempts. Please try again later.",
  "errors.auth.email_delivery_failed": "We couldn’t send the email right now. Please try again shortly.",
  "errors.auth.refresh_token_reused": "Your session expired. Please sign in again.",
  "errors.auth.forbidden": "You don’t have permission to do that.",
  "errors.merchant.invitation_invalid_or_expired": "This invitation link is invalid or has expired.",
  "errors.merchant.user_already_assigned": "This account already belongs to a workspace.",
  "errors.merchant.invitation_already_pending": "An invitation is already pending for this email.",
  "errors.request.invalid": "Too many requests. Wait a moment and try again.",
  "errors.request.validation_failed": "Please check your information and try again.",
};

function isFetchError(error: unknown): error is FetchBaseQueryError {
  return typeof error === "object" && error !== null && "status" in error;
}

export function getApiErrorMessage(error: unknown): string {
  if (isFetchError(error)) {
    const payload = typeof error.data === "object" && error.data !== null ? error.data as { error?: { key?: string } } : undefined;
    const key = payload?.error?.key;
    if (key && messages[key]) return messages[key];
    if (error.status === "FETCH_ERROR") return "Couldn’t reach the API. Confirm it’s running and that its FRONTEND_URL CORS setting matches this app’s address.";
    if (error.status === "TIMEOUT_ERROR") return "The request took too long. Please try again.";
    if (error.status === 401) return "The email or password is incorrect. Please try again.";
    if (error.status === 400) return "Please check the information you entered and try again.";
    if (error.status === 403) return "You don’t have permission to perform this action. Workspace owners can manage connections and team access.";
    if (error.status === 404) return "This workspace record could not be found or is no longer available.";
    if (error.status === 409) return "This action conflicts with the current store or workspace state. Check its status and try again.";
    if (error.status === 429) return "Too many requests. Wait a moment and try again.";
    if (error.status === 503) return "This service is temporarily unavailable. Please try again shortly.";
    if (typeof error.status === "number" && error.status >= 500) return "Something went wrong on our side. Please try again shortly.";
  }
  return "We couldn’t complete that request. Please check your details and try again.";
}
