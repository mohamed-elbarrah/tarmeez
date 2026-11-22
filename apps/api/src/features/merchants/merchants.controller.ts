import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthUser } from '../../common/types/auth-user.types.js';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto.js';
import { UpdateMerchantDto } from './dto/update-merchant.dto.js';
import { MerchantsService } from './merchants.service.js';

@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MERCHANT)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('me')
  getMyMerchant(@CurrentUser() user: AuthUser) {
    return this.merchantsService.getMyMerchant(user.id);
  }

  @Get('me/team')
  getTeam(@CurrentUser() user: AuthUser) {
    return this.merchantsService.getTeam(user.id);
  }

  @Get('me/team/invitations')
  getInvitations(@CurrentUser() user: AuthUser) {
    return this.merchantsService.getInvitations(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/team/invitations')
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Body() input: CreateTeamInvitationDto,
  ) {
    return this.merchantsService.createInvitation(user.id, input.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/team/invitations/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  resendInvitation(
    @CurrentUser() user: AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.merchantsService.resendInvitation(user.id, invitationId);
  }

  @Delete('me/team/invitations/:invitationId')
  @HttpCode(HttpStatus.OK)
  revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.merchantsService.revokeInvitation(user.id, invitationId);
  }

  @Delete('me/team/:membershipId')
  @HttpCode(HttpStatus.OK)
  removeTeamMember(
    @CurrentUser() user: AuthUser,
    @Param('membershipId') membershipId: string,
  ) {
    return this.merchantsService.removeTeamMember(user.id, membershipId);
  }

  @Patch('me')
  updateMyMerchant(
    @CurrentUser() user: AuthUser,
    @Body() input: UpdateMerchantDto,
  ) {
    return this.merchantsService.updateMyMerchantName(user.id, input.name);
  }
}
