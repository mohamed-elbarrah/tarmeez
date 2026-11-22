import type { MembershipRole, MerchantStatus, UserRole } from './enums.js';

/** Date/time fields are ISO-8601 strings in JSON responses. */
export interface MerchantWorkspace {
  id: string;
  name: string;
  status: MerchantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantAccountUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerifiedAt: string | null;
}

export interface MerchantProfileResponse {
  role: MembershipRole;
  createdAt: string;
  user: MerchantAccountUser;
  merchant: MerchantWorkspace;
}

export interface MerchantTeamMember {
  id: string;
  role: MembershipRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface MerchantInvitation {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  createdAt: string;
}
