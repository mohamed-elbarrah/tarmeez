# Tarmeez — Frontend Structure Contract
**Version:** 1.0
**Stack:** Next.js 14 (App Router) · shadcn/ui · RTK Query · Redux Toolkit
**Status:** Mandatory reference for all developers

> This document is the law. Any code that does not follow this structure is not acceptable in code review.

---

## 1. Folder Structure

```
src/
├── app/                          # Next.js App Router — pages only
│   ├── (auth)/                   # Route Group — not visible in URL
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/              # Route Group — merchant dashboard
│   │   ├── layout.tsx            # Shared Sidebar + Header
│   │   ├── overview/
│   │   │   └── page.tsx
│   │   ├── connections/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── analytics/
│   │   │   ├── sales/
│   │   │   │   └── page.tsx
│   │   │   └── ads/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── (admin)/                  # Route Group — Admin Panel
│   │   ├── layout.tsx
│   │   └── merchants/
│   │       └── page.tsx
│   └── layout.tsx                # Root layout (fonts, providers)
│
├── components/
│   ├── ui/                       # shadcn/ui — do not edit manually
│   ├── common/                   # Shared components across the app
│   │   ├── AppSidebar.tsx
│   │   ├── AppHeader.tsx
│   │   ├── DataTable.tsx
│   │   ├── StatCard.tsx
│   │   ├── StatusBadge.tsx
│   │   └── EmptyState.tsx
│   ├── features/                 # Feature-specific components
│   │   ├── connections/
│   │   │   ├── ConnectionCard.tsx
│   │   │   └── ConnectionStatus.tsx
│   │   ├── analytics/
│   │   │   ├── SalesChart.tsx
│   │   │   └── MetricCard.tsx
│   │   └── merchants/            # Admin only
│   │       └── MerchantRow.tsx
│   └── layouts/
│       ├── DashboardLayout.tsx
│       └── AuthLayout.tsx
│
├── store/                        # Redux Store
│   ├── index.ts                  # configureStore
│   ├── hooks.ts                  # useAppDispatch, useAppSelector
│   └── slices/                   # UI State only
│       ├── uiSlice.ts            # sidebar open/close, theme
│       └── authSlice.ts          # logged-in user data
│
├── services/                     # RTK Query — all API calls
│   ├── baseApi.ts                # root createApi
│   ├── authApi.ts
│   ├── merchantApi.ts
│   ├── connectionsApi.ts
│   └── analyticsApi.ts
│
├── lib/
│   ├── utils.ts                  # cn() and other shadcn utilities
│   └── constants.ts              # project-wide constants
│
├── hooks/                        # Custom Hooks
│   ├── useAuth.ts
│   └── usePermissions.ts
│
└── types/                        # TypeScript Types
    ├── merchant.types.ts
    ├── analytics.types.ts
    └── api.types.ts
```

---

## 2. File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `StatCard.tsx` |
| Pages (Next.js) | lowercase | `page.tsx` |
| Hooks | camelCase + use prefix | `useAuth.ts` |
| Slices | camelCase + Slice suffix | `uiSlice.ts` |
| API services | camelCase + Api suffix | `analyticsApi.ts` |
| Types | camelCase + .types | `merchant.types.ts` |
| Constants | camelCase | `constants.ts` |

---

## 3. Redux — Strict Rules

### What goes in Redux (UI State only):
- Sidebar open/closed state
- Logged-in user data (id, name, role, token)
- Theme (light/dark)
- Any modal/dialog state that affects more than one component

### What does NOT go in Redux (Server State → RTK Query):
- API data (orders, merchants, analytics...)
- Loading / error states for API calls
- Anything that comes from the backend

### Mandatory Slice Pattern:
```typescript
// store/slices/uiSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
}

const initialState: UIState = {
  sidebarOpen: true,
  theme: 'light',
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload
    },
  },
})

export const { toggleSidebar, setTheme } = uiSlice.actions
export default uiSlice.reducer
```

### Typed Hooks — always use these, never the raw hooks:
```typescript
// store/hooks.ts
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './index'

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

// ✅ Correct
const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen)

// ❌ Wrong — never use useSelector directly
const sidebarOpen = useSelector((state: any) => state.ui.sidebarOpen)
```

---

## 4. RTK Query — Strict Rules

### Core rule: one baseApi only
```typescript
// services/baseApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { RootState } from '@/store'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  tagTypes: ['Merchant', 'Connection', 'Analytics', 'Order'],
  endpoints: () => ({}),
})
```

### Every API service extends baseApi:
```typescript
// services/connectionsApi.ts
import { baseApi } from './baseApi'
import { Connection } from '@/types/merchant.types'

export const connectionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getConnections: builder.query<Connection[], void>({
      query: () => '/connections',
      providesTags: ['Connection'],
    }),
    addConnection: builder.mutation<Connection, Partial<Connection>>({
      query: (body) => ({
        url: '/connections',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Connection'],
    }),
    deleteConnection: builder.mutation<void, string>({
      query: (id) => ({
        url: `/connections/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Connection'],
    }),
  }),
})

export const {
  useGetConnectionsQuery,
  useAddConnectionMutation,
  useDeleteConnectionMutation,
} = connectionsApi
```

### RTK Query Naming Convention:
| Type | Convention | Example |
|------|-----------|---------|
| Query | get + noun | `getConnections` |
| Mutation POST | add / create | `addConnection` |
| Mutation PUT/PATCH | update | `updateConnection` |
| Mutation DELETE | delete / remove | `deleteConnection` |

---

## 5. Page Structure — Mandatory Pattern

### Every page = clean Server Component + separate Client Components

```typescript
// app/(dashboard)/connections/page.tsx
// ✅ Server Component — no 'use client' here
import { ConnectionsList } from '@/components/features/connections/ConnectionsList'

export const metadata = {
  title: 'Connections — Tarmeez',
}

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="text-muted-foreground">
          Manage your connected stores and ad accounts
        </p>
      </div>
      <ConnectionsList />
    </div>
  )
}
```

```typescript
// components/features/connections/ConnectionsList.tsx
'use client' // ← 'use client' lives here, not in the page

import { useGetConnectionsQuery } from '@/services/connectionsApi'
import { ConnectionCard } from './ConnectionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'

export function ConnectionsList() {
  const { data: connections, isLoading, isError, refetch } = useGetConnectionsQuery()

  if (isLoading) return <ConnectionsListSkeleton />
  if (isError) return (
    <EmptyState
      icon="alert"
      title="Failed to load connections"
      description="Please try again"
      action={{ label: 'Retry', onClick: refetch }}
    />
  )
  if (!connections?.length) return (
    <EmptyState
      icon="plug"
      title="No connections yet"
      description="Connect your store to get started"
    />
  )

  return (
    <div className="grid gap-4">
      {connections.map((connection) => (
        <ConnectionCard key={connection.id} connection={connection} />
      ))}
    </div>
  )
}

function ConnectionsListSkeleton() {
  return (
    <div className="grid gap-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
```

---

## 6. Component Rules

### Mandatory pattern for every component:
```typescript
// components/features/connections/ConnectionCard.tsx
'use client'

import { Connection } from '@/types/merchant.types'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// 1. Interface first — always
interface ConnectionCardProps {
  connection: Connection
  onDisconnect?: (id: string) => void
}

// 2. Named export — never default export
export function ConnectionCard({ connection, onDisconnect }: ConnectionCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium">{connection.name}</p>
          <p className="text-sm text-muted-foreground">{connection.platform}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={connection.status} />
          {onDisconnect && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDisconnect(connection.id)}
            >
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

### Mandatory component rules:
1. **Named export always** — no `export default` for components
2. **Interface before the component** — always
3. **No API logic inside a component** — only in container components or pages
4. **Keep props simple** — more than 5 props is a signal to split the component
5. **No inline styles** — everything through Tailwind

---

## 7. TypeScript Types

```typescript
// types/merchant.types.ts

// ✅ Use interface for objects
export interface Merchant {
  id: string
  name: string
  email: string
  status: MerchantStatus
  createdAt: string
}

// ✅ Use type for unions and computed types
export type MerchantStatus = 'active' | 'suspended' | 'trial'

export type ConnectionPlatform = 'salla' | 'zid' | 'meta' | 'tiktok' | 'google'

export interface Connection {
  id: string
  merchantId: string
  platform: ConnectionPlatform
  status: 'connected' | 'error' | 'expired'
  lastSyncAt: string | null
}

// ✅ Unified API response wrapper
export interface ApiResponse<T> {
  data: T
  meta?: {
    total: number
    page: number
    perPage: number
  }
}

export interface ApiError {
  message: string
  code: string
  details?: Record<string, string>
}
```

---

## 8. Three-State Handling — Mandatory in Every Data Component

Every component that displays API data **must** handle all three states:

```typescript
// ✅ Mandatory pattern
const { data, isLoading, isError, refetch } = useGetMerchantsQuery()

if (isLoading) return <TableSkeleton rows={5} />

if (isError) return (
  <EmptyState
    icon="alert"
    title="Failed to load data"
    description="Please try again"
    action={{ label: 'Retry', onClick: refetch }}
  />
)

if (!data?.length) return (
  <EmptyState
    icon="inbox"
    title="No merchants yet"
    description="Merchants will appear here after they sign up"
  />
)
```

---

## 9. Providers — Order in layout.tsx

```typescript
// app/layout.tsx
import { ReduxProvider } from '@/components/providers/ReduxProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ReduxProvider>      {/* 1. Redux first */}
          <ThemeProvider>    {/* 2. Theme */}
            {children}
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  )
}
```

```typescript
// components/providers/ReduxProvider.tsx
'use client'
import { Provider } from 'react-redux'
import { store } from '@/store'

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}
```

---

## 10. Quick Reference — Every Developer Must Know This

| Rule | ✅ Do | ❌ Don't |
|------|-------|---------|
| Exports | `export function X` | `export default X` |
| API calls | RTK Query only | fetch / axios directly |
| Server state | RTK Query | Redux slice |
| UI state | Redux slice | complex useState in component |
| Styles | Tailwind classes | inline styles |
| Types | Separate files in `/types` | types inside component files |
| `'use client'` | Leaf components only | Pages or layouts |
| Loading state | Skeleton component | Plain "Loading..." text |
| Error state | EmptyState component | No handling |
| TypeScript | Strict types always | `any` |

---

## 11. Code Review Checklist

Before opening any Pull Request, verify:

- [ ] File is in the correct folder for its type
- [ ] File name follows the naming convention
- [ ] All types are defined in `/types`
- [ ] No `any` in TypeScript
- [ ] Component handles loading + error + empty states
- [ ] No API calls outside RTK Query
- [ ] No server state stored in Redux
- [ ] `'use client'` used only when truly necessary
- [ ] Named export used, not default export

---

*Last updated: November 2026 — Review this document whenever a major stack change is made*
