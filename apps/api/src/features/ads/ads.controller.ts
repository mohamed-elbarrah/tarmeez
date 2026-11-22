import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthUser } from '../../common/types/auth-user.types.js';
import { AdsService } from './ads.service.js';
import { CompleteMetaConnectionDto } from './dto/complete-meta-connection.dto.js';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto.js';
import { AdsQueryDto } from './dto/ads-query.dto.js';

@Controller()
export class AdsController {
  constructor(private readonly ads: AdsService, private readonly config: ConfigService) {}

  @Post('connections/meta/start') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  start(@CurrentUser() user: AuthUser) { return this.ads.startMeta(user.id); }

  @Get('connections/meta/callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Res() response: Response) {
    let result: { intentId?: string; status: string };
    try { result = await this.ads.handleMetaCallback({ code, state, error }); }
    catch { result = { status: 'FAILED' }; }
    const url = new URL('/connections/meta/result', this.config.get<string>('app.frontendUrl'));
    if (result.intentId) url.searchParams.set('intentId', result.intentId);
    url.searchParams.set('status', result.status);
    return response.redirect(HttpStatus.FOUND, url.toString());
  }

  @Get('connections/meta/intents/:intentId') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  intent(@CurrentUser() user: AuthUser, @Param('intentId') id: string) { return this.ads.getIntent(user.id, id); }

  @Post('connections/meta/intents/:intentId/complete') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  complete(@CurrentUser() user: AuthUser, @Param('intentId') id: string, @Body() input: CompleteMetaConnectionDto) { return this.ads.completeMeta(user.id, id, input.accountIds); }

  @Get('connections/ads') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  accounts(@CurrentUser() user: AuthUser) { return this.ads.listAccounts(user.id); }

  @Delete('connections/ads/:accountId') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  disconnect(@CurrentUser() user: AuthUser, @Param('accountId') id: string) { return this.ads.disconnect(user.id, id); }

  @Post('connections/ads/:accountId/sync') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  sync(@CurrentUser() user: AuthUser, @Param('accountId') id: string) { return this.ads.syncAccount(user.id, id); }

  @Get('ads/accounts/:accountId/campaigns') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  campaigns(@CurrentUser() user: AuthUser, @Param('accountId') id: string, @Query() query: AdsQueryDto) { return this.ads.listCampaigns(user.id, id, query.page, query.perPage, query.configuredStatus); }

  @Get('ads/campaigns/:campaignId') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  campaign(@CurrentUser() user: AuthUser, @Param('campaignId') id: string) { return this.ads.campaign(user.id, id); }

  @Patch('ads/campaigns/:campaignId/status') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  @HttpCode(HttpStatus.ACCEPTED)
  status(@CurrentUser() user: AuthUser, @Param('campaignId') id: string, @Body() input: UpdateCampaignStatusDto) { return this.ads.requestStatus(user.id, id, input); }

  @Get('ads/campaigns/:campaignId/status-actions/:actionId') @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.MERCHANT)
  action(@CurrentUser() user: AuthUser, @Param('campaignId') campaignId: string, @Param('actionId') actionId: string) { return this.ads.action(user.id, campaignId, actionId); }
}
