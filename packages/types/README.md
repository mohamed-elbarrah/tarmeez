# `@tarmeez/types`

Shared, dependency-free TypeScript contracts for Tarmeez API consumers. The package contains types only; API runtime behavior and Prisma-generated types remain in `apps/api`.

## Imports

```typescript
import type {
  ApiResponse,
  AuthSessionResponse,
  MerchantProfileResponse,
  MerchantTeamMember,
} from '@tarmeez/types';
```

The package exports contracts for the implemented auth and merchant APIs. Add types for future features only after their API shapes are defined. Build the package before compiling a consumer; the workspace build pipeline handles this dependency automatically.
