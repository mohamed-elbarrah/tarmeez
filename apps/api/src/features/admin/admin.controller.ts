import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ListMerchantUsersDto } from './dto/list-merchant-users.dto.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listMerchantUsers(@Query() query: ListMerchantUsersDto) {
    return this.adminService.listMerchantUsers(
      query.page,
      query.perPage,
      query.search,
    );
  }
}
