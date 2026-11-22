import { Injectable } from '@nestjs/common';
import { AdminRepository } from './admin.repository.js';

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async listMerchantUsers(page: number, perPage: number, search?: string) {
    const result = await this.repository.listMerchantUsers({ page, perPage, search });
    return {
      data: result.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        workspace: user.membership
          ? {
              id: user.membership.merchant.id,
              name: user.membership.merchant.name,
              status: user.membership.merchant.status,
              membershipRole: user.membership.role,
              createdAt: user.membership.merchant.createdAt,
            }
          : null,
      })),
      meta: {
        total: result.total,
        page,
        perPage,
        totalPages: Math.ceil(result.total / perPage),
      },
    };
  }
}
