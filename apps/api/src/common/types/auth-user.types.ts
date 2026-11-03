import type { UserRole } from '../../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  role: UserRole;
}
