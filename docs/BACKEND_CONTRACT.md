# Tarmeez — Backend Structure Contract
**Version:** 1.0
**Stack:** NestJS · Prisma · PostgreSQL · BullMQ · JWT + Refresh Tokens
**Status:** Mandatory reference for all developers

> This document is the law. Any code that does not follow this structure is not acceptable in code review.

---

## 1. Project Structure

Feature-based, not layer-based. Every feature owns its full vertical slice.

```
src/
├── main.ts
├── app.module.ts
│
├── common/                          # Shared across all features
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── filters/
│   │   └── global-exception.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── interceptors/
│   │   └── response.interceptor.ts
│   ├── pipes/
│   │   └── validation.pipe.ts
│   └── types/
│       ├── api-response.types.ts
│       └── pagination.types.ts
│
├── config/                          # All configuration — single source of truth
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   ├── bull.config.ts
│   └── config.module.ts
│
├── prisma/                          # Prisma — single instance
│   ├── prisma.module.ts
│   ├── prisma.service.ts
│   └── schema.prisma
│
├── features/                        # One folder per feature
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── jwt-refresh.strategy.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── refresh-token.dto.ts
│   │
│   ├── merchants/
│   │   ├── merchants.module.ts
│   │   ├── merchants.controller.ts
│   │   ├── merchants.service.ts
│   │   ├── merchants.repository.ts
│   │   └── dto/
│   │       ├── create-merchant.dto.ts
│   │       └── update-merchant.dto.ts
│   │
│   ├── connections/
│   │   ├── connections.module.ts
│   │   ├── connections.controller.ts
│   │   ├── connections.service.ts
│   │   ├── connections.repository.ts
│   │   ├── providers/               # Platform-specific logic
│   │   │   ├── salla.provider.ts
│   │   │   └── zid.provider.ts
│   │   └── dto/
│   │       └── create-connection.dto.ts
│   │
│   ├── analytics/
│   │   ├── analytics.module.ts
│   │   ├── analytics.controller.ts
│   │   ├── analytics.service.ts
│   │   └── analytics.repository.ts
│   │
│   └── admin/
│       ├── admin.module.ts
│       ├── admin.controller.ts
│       └── admin.service.ts
│
└── jobs/                            # BullMQ — all background jobs
    ├── jobs.module.ts
    ├── queues/
    │   ├── sync.queue.ts
    │   └── analytics.queue.ts
    └── processors/
        ├── salla-sync.processor.ts
        ├── zid-sync.processor.ts
        └── analytics.processor.ts
```

---

## 2. API Response Format

Every endpoint returns the same envelope — no exceptions.

### Success Response
```typescript
// common/types/api-response.types.ts

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: PaginationMeta
}

export interface PaginationMeta {
  total: number
  page: number
  perPage: number
  totalPages: number
}
```

### Error Response
```typescript
export interface ApiErrorResponse {
  success: false
  error: {
    key: string          // translation key — e.g. "errors.connection.not_found"
    statusCode: number
    details?: Record<string, string[]>  // field-level validation errors
  }
}
```

### Response Interceptor — applied globally
```typescript
// common/interceptors/response.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, map } from 'rxjs'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data?.data ?? data,
        ...(data?.meta ? { meta: data.meta } : {}),
      })),
    )
  }
}
```

### Translation Key Convention
```
errors.<feature>.<description>        # API errors
  errors.auth.invalid_credentials
  errors.connection.not_found
  errors.merchant.already_exists

success.<feature>.<description>       # Success messages (when needed)
  success.connection.created
  success.connection.disconnected
```

---

## 3. Error Handling

### Custom Exception Classes
```typescript
// common/exceptions/app.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common'

export class AppException extends HttpException {
  constructor(
    key: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, string[]>,
  ) {
    super({ key, statusCode, details }, statusCode)
  }
}

// Usage
throw new AppException('errors.connection.not_found', HttpStatus.NOT_FOUND)
throw new AppException('errors.auth.invalid_credentials', HttpStatus.UNAUTHORIZED)
```

### Global Exception Filter
```typescript
// common/filters/global-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR
    let key = 'errors.server.internal'
    let details: Record<string, string[]> | undefined

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const body = exception.getResponse() as any
      key = body?.key ?? 'errors.server.unknown'
      details = body?.details
    } else {
      this.logger.error('Unhandled exception', exception)
    }

    response.status(statusCode).json({
      success: false,
      error: { key, statusCode, details },
    })
  }
}
```

### Register globally in main.ts
```typescript
// main.ts
app.useGlobalFilters(new GlobalExceptionFilter())
app.useGlobalInterceptors(new ResponseInterceptor())
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
```

---

## 4. Validation

All validation lives in DTOs using `class-validator`. No validation inside controllers or services.

```typescript
// features/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string
}
```

```typescript
// features/connections/dto/create-connection.dto.ts
import { IsEnum, IsString } from 'class-validator'
import { ConnectionPlatform } from '@prisma/client'

export class CreateConnectionDto {
  @IsEnum(ConnectionPlatform)
  platform: ConnectionPlatform

  @IsString()
  authCode: string
}
```

### DTO Naming Convention
| Action | Name |
|--------|------|
| Create | `create-<resource>.dto.ts` |
| Update | `update-<resource>.dto.ts` |
| Query/Filter | `<resource>-filter.dto.ts` |
| Pagination | `pagination.dto.ts` (shared in common/) |

---

## 5. Authentication & Authorization

### JWT + Refresh Token Flow
- **Access Token**: short-lived (15 minutes)
- **Refresh Token**: long-lived (7 days), stored hashed in DB

```typescript
// features/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('jwt.accessSecret'),
    })
  }

  validate(payload: { sub: string; role: string }) {
    return { id: payload.sub, role: payload.role }
  }
}
```

### Roles
```typescript
// common/types/roles.enum.ts
export enum UserRole {
  MERCHANT = 'merchant',
  ADMIN = 'admin',
}
```

```typescript
// common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common'
import { UserRole } from '../types/roles.enum'

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles)
```

### Usage in controllers
```typescript
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
findAllMerchants() { ... }

@Get('me')
@UseGuards(JwtAuthGuard)          // no role restriction — any authenticated user
getProfile(@CurrentUser() user: AuthUser) { ... }
```

---

## 6. Repository Pattern

Controllers call Services. Services call Repositories. Repositories call Prisma. No Prisma calls outside repositories.

```typescript
// features/connections/connections.repository.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { Connection, Prisma } from '@prisma/client'

@Injectable()
export class ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Connection | null> {
    return this.prisma.connection.findUnique({ where: { id } })
  }

  findAllByMerchant(merchantId: string): Promise<Connection[]> {
    return this.prisma.connection.findMany({ where: { merchantId } })
  }

  create(data: Prisma.ConnectionCreateInput): Promise<Connection> {
    return this.prisma.connection.create({ data })
  }

  update(id: string, data: Prisma.ConnectionUpdateInput): Promise<Connection> {
    return this.prisma.connection.update({ where: { id }, data })
  }

  delete(id: string): Promise<Connection> {
    return this.prisma.connection.delete({ where: { id } })
  }
}
```

### Service calls Repository — never Prisma directly
```typescript
// features/connections/connections.service.ts
@Injectable()
export class ConnectionsService {
  constructor(private readonly connectionsRepository: ConnectionsRepository) {}

  async findOrFail(id: string, merchantId: string): Promise<Connection> {
    const connection = await this.connectionsRepository.findById(id)

    if (!connection || connection.merchantId !== merchantId) {
      throw new AppException('errors.connection.not_found', HttpStatus.NOT_FOUND)
    }

    return connection
  }
}
```

---

## 7. Database Conventions (Prisma + PostgreSQL)

```prisma
// prisma/schema.prisma

model Merchant {
  id           String       @id @default(uuid())
  email        String       @unique
  name         String
  status       MerchantStatus @default(TRIAL)
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")
  connections  Connection[]

  @@map("merchants")
}

model Connection {
  id           String             @id @default(uuid())
  merchantId   String             @map("merchant_id")
  platform     ConnectionPlatform
  status       ConnectionStatus   @default(CONNECTED)
  accessToken  String             @map("access_token")
  refreshToken String?            @map("refresh_token")
  lastSyncAt   DateTime?          @map("last_sync_at")
  createdAt    DateTime           @default(now()) @map("created_at")
  updatedAt    DateTime           @updatedAt @map("updated_at")
  merchant     Merchant           @relation(fields: [merchantId], references: [id])

  @@map("connections")
}

enum MerchantStatus {
  TRIAL
  ACTIVE
  SUSPENDED
}

enum ConnectionPlatform {
  SALLA
  ZID
  META
  TIKTOK
  GOOGLE
}

enum ConnectionStatus {
  CONNECTED
  ERROR
  EXPIRED
}
```

### Database Naming Rules
| Item | Convention | Example |
|------|-----------|---------|
| Table names | snake_case plural | `merchants`, `connections` |
| Column names | snake_case | `merchant_id`, `created_at` |
| Prisma model | PascalCase singular | `Merchant`, `Connection` |
| Prisma field | camelCase | `merchantId`, `createdAt` |
| Enums | SCREAMING_SNAKE_CASE | `TRIAL`, `CONNECTED` |

---

## 8. Pagination Convention

All list endpoints use the same cursor-based pagination.

```typescript
// common/types/pagination.types.ts
export interface PaginationDto {
  page?: number    // default: 1
  perPage?: number // default: 20, max: 100
}

export interface PaginationMeta {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface PaginatedResult<T> {
  data: T[]
  meta: PaginationMeta
}
```

```typescript
// Usage in repository
async findPaginated(page = 1, perPage = 20): Promise<PaginatedResult<Merchant>> {
  const skip = (page - 1) * perPage

  const [data, total] = await Promise.all([
    this.prisma.merchant.findMany({ skip, take: perPage, orderBy: { createdAt: 'desc' } }),
    this.prisma.merchant.count(),
  ])

  return {
    data,
    meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
  }
}
```

---

## 9. Background Jobs (BullMQ)

### Queue Definition
```typescript
// jobs/queues/sync.queue.ts
export const SYNC_QUEUE = 'sync'

export const SyncJobName = {
  SALLA_FULL_SYNC: 'salla:full-sync',
  SALLA_ORDERS_SYNC: 'salla:orders-sync',
  ZID_FULL_SYNC: 'zid:full-sync',
} as const
```

### Processor Pattern
```typescript
// jobs/processors/salla-sync.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { SYNC_QUEUE, SyncJobName } from '../queues/sync.queue'

@Processor(SYNC_QUEUE)
export class SallaSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SallaSyncProcessor.name)

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job: ${job.name} | id: ${job.id}`)

    switch (job.name) {
      case SyncJobName.SALLA_FULL_SYNC:
        await this.handleFullSync(job.data)
        break
      case SyncJobName.SALLA_ORDERS_SYNC:
        await this.handleOrdersSync(job.data)
        break
      default:
        this.logger.warn(`Unknown job name: ${job.name}`)
    }
  }

  private async handleFullSync(data: { connectionId: string }) {
    // sync logic here
  }

  private async handleOrdersSync(data: { connectionId: string; since: string }) {
    // sync logic here
  }
}
```

### Job Dispatch Convention
```typescript
// Always dispatch through the service, never directly from controller
await this.syncQueue.add(SyncJobName.SALLA_FULL_SYNC, { connectionId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,   // keep failed jobs for inspection
})
```

---

## 10. Logging & Auditing

### Structured Logging — use NestJS Logger with context
```typescript
// Always instantiate with class name
private readonly logger = new Logger(ConnectionsService.name)

// Log levels:
this.logger.log('Connection created')           // info
this.logger.warn('Token expiring soon')         // warning
this.logger.error('Sync failed', error.stack)   // error
this.logger.debug('Raw API response', payload)  // debug (dev only)
```

### Audit Trail — sensitive actions must be recorded
```prisma
model AuditLog {
  id         String   @id @default(uuid())
  merchantId String?  @map("merchant_id")
  adminId    String?  @map("admin_id")
  action     String   // "connection.created", "subscription.changed"
  target     String   // "Connection:uuid"
  meta       Json?
  createdAt  DateTime @default(now()) @map("created_at")

  @@map("audit_logs")
}
```

### Actions that must be audited:
- `connection.created` / `connection.deleted`
- `merchant.suspended` / `merchant.activated`
- `subscription.changed`
- `admin.login`
- Any write operation performed by an admin on a merchant's data

---

## 11. Environment & Configuration

All config accessed through `ConfigService` — no `process.env` scattered in code.

```typescript
// config/jwt.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}))
```

```typescript
// ✅ Correct — typed config access
constructor(private readonly config: ConfigService) {}
const secret = this.config.get<string>('jwt.accessSecret')

// ❌ Wrong — direct env access
const secret = process.env.JWT_ACCESS_SECRET
```

### Required .env keys
```
# App
NODE_ENV=
PORT=
FRONTEND_URL=

# Database
DATABASE_URL=

# JWT
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis (BullMQ)
REDIS_HOST=
REDIS_PORT=

# Salla
SALLA_CLIENT_ID=
SALLA_CLIENT_SECRET=
SALLA_WEBHOOK_SECRET=

# Zid
ZID_CLIENT_ID=
ZID_CLIENT_SECRET=

# Meta
META_APP_ID=
META_APP_SECRET=
```

---

## 12. Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `connections.service.ts` |
| Classes | PascalCase | `ConnectionsService` |
| Methods | camelCase | `findOrFail()` |
| Variables | camelCase | `merchantId` |
| Constants | SCREAMING_SNAKE_CASE | `SYNC_QUEUE` |
| Enums | PascalCase (name) / SCREAMING (values) | `UserRole.ADMIN` |
| DTOs | PascalCase + Dto suffix | `CreateConnectionDto` |
| Modules | kebab-case | `connections.module.ts` |

---

## 13. Quick Reference — Every Developer Must Know This

| Rule | ✅ Do | ❌ Don't |
|------|-------|---------|
| API errors | Throw `AppException` with a key | Throw raw `Error` or `HttpException` |
| Error messages | Translation key string | Hardcoded text |
| DB access | Through Repository only | Prisma in controller or service |
| Config access | `ConfigService` | `process.env` directly |
| Validation | DTO + `class-validator` | Manual checks in service |
| Background jobs | BullMQ via service | Direct async calls for long tasks |
| Logging | `Logger` with class context | `console.log` |
| Sensitive actions | Write to audit_logs | Leave no trace |
| Pagination | Shared `PaginationDto` + `PaginatedResult` | Custom shape per endpoint |

---

## 14. Code Review Checklist

Before opening any Pull Request, verify:

- [ ] Feature has its own folder under `features/`
- [ ] No Prisma calls outside Repository
- [ ] No `process.env` outside `config/`
- [ ] All errors use `AppException` with a translation key
- [ ] DTOs used for all incoming data with `class-validator`
- [ ] List endpoints return `PaginatedResult` shape
- [ ] Sensitive actions written to `audit_logs`
- [ ] Logger used with class name context
- [ ] Long-running tasks dispatched to BullMQ
- [ ] No `console.log` in production code
- [ ] No `any` in TypeScript

---

*Last updated: November 2026 — Review this document whenever a major stack change is made*
