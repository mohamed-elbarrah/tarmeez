import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthUser } from '../../common/types/auth-user.types.js';
import { StartSallaConnectionDto } from './dto/start-salla-connection.dto.js';
import { ConnectionsService } from './connections.service.js';
import { CommerceSyncService } from './commerce-sync.service.js';
import { StartSyncDto } from './dto/start-sync.dto.js';
import { CommerceDataQueryDto } from './dto/commerce-data-query.dto.js';
import { SallaCallbackDto } from './dto/salla-callback.dto.js';

@Controller()
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly sync: CommerceSyncService,
    private readonly config: ConfigService,
  ) {}

  @Post('connections/salla/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  startSalla(
    @CurrentUser() user: AuthUser,
    @Body() _input: StartSallaConnectionDto,
  ) {
    return this.connections.startSalla(user.id);
  }

  @Get('connections/salla/callback')
  async sallaCallback(
    @Query() input: SallaCallbackDto,
    @Res() response: Response,
  ) {
    try {
      const result = await this.connections.handleSallaCallback(input);
      return this.redirectSallaResult(response, result);
    } catch (error) {
      const status = callbackStatus(error);
      const reason = callbackFailureReason(error);
      return this.redirectSallaResult(response, {
        status,
        reason: status === 'CANCELLED' ? undefined : reason,
        intentId: callbackIntentId(error),
      });
    }
  }

  private redirectSallaResult(
    response: Response,
    result: { intentId?: string; status: string; reason?: string },
  ) {
    const frontendUrl = this.config.get<string>('app.frontendUrl');
    const redirect = new URL('/connections/salla/result', frontendUrl);
    if (result.intentId) redirect.searchParams.set('intentId', result.intentId);
    redirect.searchParams.set('status', result.status);
    if (result.reason) redirect.searchParams.set('reason', result.reason);
    return response.redirect(HttpStatus.FOUND, redirect.toString());
  }

  @Get('connections/salla/intents/:intentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  intentStatus(
    @CurrentUser() user: AuthUser,
    @Param('intentId') intentId: string,
  ) {
    return this.connections.getSallaIntentStatus(user.id, intentId);
  }

  @Delete('connections/salla/intents/:intentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  cancelIntent(
    @CurrentUser() user: AuthUser,
    @Param('intentId') intentId: string,
  ) {
    return this.connections.cancelSallaIntent(user.id, intentId);
  }

  @Post('webhooks/salla/app-events')
  receiveSallaEvent(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-salla-signature') signature: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-salla-security-strategy') strategy: string | undefined,
    @Body() body: unknown,
  ) {
    return this.connections.receiveSallaAppEvent(
      { signature, authorization, strategy },
      request.rawBody,
      body,
    );
  }

  @Post('connections/:connectionId/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  startSync(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Body() input: StartSyncDto,
  ) {
    return this.sync.enqueue(user.id, connectionId, input.resource);
  }

  @Get('connections/:connectionId/sync-runs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  getSyncRuns(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
  ) {
    return this.sync.status(user.id, connectionId);
  }

  @Get('connections/:connectionId/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  products(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Query() query: CommerceDataQueryDto,
  ) {
    return this.sync.data(
      user.id,
      connectionId,
      'PRODUCTS',
      query.page,
      query.perPage,
    );
  }

  @Get('connections/:connectionId/customers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  customers(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Query() query: CommerceDataQueryDto,
  ) {
    return this.sync.data(
      user.id,
      connectionId,
      'CUSTOMERS',
      query.page,
      query.perPage,
    );
  }

  @Get('connections/:connectionId/orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  orders(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
    @Query() query: CommerceDataQueryDto,
  ) {
    return this.sync.data(
      user.id,
      connectionId,
      'ORDERS',
      query.page,
      query.perPage,
    );
  }

  @Get('connections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  list(@CurrentUser() user: AuthUser) {
    return this.connections.list(user.id);
  }

  @Delete('connections/:connectionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  @HttpCode(HttpStatus.OK)
  disconnect(
    @CurrentUser() user: AuthUser,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connections.disconnect(user.id, connectionId);
  }
}

function callbackFailureReason(
  error: unknown,
): 'state_invalid' | 'workspace_owner_required' | 'oauth_failed' {
  if (error instanceof Error && 'key' in error) {
    const key = error.key;
    if (key === 'errors.connections.workspace_owner_required')
      return 'workspace_owner_required';
    if (key === 'errors.connections.salla_state_invalid')
      return 'state_invalid';
  }
  return 'oauth_failed';
}

function callbackStatus(error: unknown): 'FAILED' | 'CANCELLED' {
  return error instanceof Error &&
    'key' in error &&
    error.key === 'errors.connections.salla_intent_cancelled'
    ? 'CANCELLED'
    : 'FAILED';
}

function callbackIntentId(error: unknown): string | undefined {
  return error instanceof Error &&
    'intentId' in error &&
    typeof error.intentId === 'string'
    ? error.intentId
    : undefined;
}
