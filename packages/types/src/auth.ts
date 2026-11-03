import type { UserRole } from './enums.js';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthSessionUser extends AuthUser {
  email: string;
  name: string;
}

export interface AuthSessionResponse {
  accessToken: string;
  user: AuthSessionUser;
}

export interface SignupAcceptedResponse {
  emailVerificationRequired: true;
  messageKey: string;
}

export interface AuthMessageResponse {
  messageKey: string;
}
