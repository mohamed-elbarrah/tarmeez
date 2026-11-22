export type UserRole = "ADMIN" | "MERCHANT";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { key: string; statusCode: number; details?: unknown };
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  invitationToken?: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface InvitationRequest extends LoginRequest {
  invitationToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface Principal {
  id: string;
  role: UserRole;
}
