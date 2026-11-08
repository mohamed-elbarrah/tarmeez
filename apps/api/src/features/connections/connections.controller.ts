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
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
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

@Controller()
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly sync: CommerceSyncService,
  ) {}

  @Post('connections/salla/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MERCHANT)
  startSalla(
    @CurrentUser() user: AuthUser,
    @Body() input: StartSallaConnectionDto,
  ) {
    return this.connections.startSalla(user.id, input.storeUrl);
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
