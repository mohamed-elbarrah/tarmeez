import { Injectable } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listMerchantUsers(input: { page: number; perPage: number; search?: string }) {
    const search = input.search?.trim();
    const where = {
      role: UserRole.MERCHANT,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (input.page - 1) * input.perPage;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: input.perPage,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          membership: {
            select: {
              role: true,
              merchant: {
                select: { id: true, name: true, status: true, createdAt: true },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total };
  }
}
