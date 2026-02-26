# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Overview

Baza Pilates is a full-stack studio management app built as an Expo monorepo. It serves three user roles: Admin, Trainer, and Client. The app runs on iOS, Android, and Web from a single codebase with server-side API routes.

## Architecture

### Monorepo Layout

- `apps/mobile/` - Main Expo app with file-based routing and API routes
- `packages/types/` - Shared Zod validation schemas
- `packages/i18n/` - Shared internationalization utilities
- `docs/` - Specifications and runbooks

### Key Conventions

- **Routing:** Expo Router 6 file-based routing. Role-specific screens live in `app/(admin)/`, `app/(trainer)/`, `app/(client)/`. API routes live in `app/api/`.
- **Styling:** Tamagui component library. Theme colors: background `#fdf7f4`, brand `#2e5b42`, accent `#6e1644`. Font: Inter.
- **State management:** TanStack React Query for server state. Query factories are in `lib/queries/`.
- **Validation:** Zod schemas shared between client and server via `@baza/types`.
- **Database:** Prisma ORM with PostgreSQL. Schema at `apps/mobile/prisma/schema.prisma`.
- **Auth:** Better Auth with session-based cookies. Invite-only registration (no public sign-up).
- **i18n:** Serbian (default) and English. Translation files in `apps/mobile/locales/`.
- **Email:** React Email templates in `apps/mobile/emails/`, sent via Resend.

### Server-Side Patterns

- API route handlers are in `apps/mobile/app/api/`.
- Auth guards use `requireAuth()` and `requireRole()` from `lib/server/auth-guards.ts`.
- Prisma client is initialized in `lib/server/prisma.ts`.
- Notifications go through `lib/server/notifications.ts` (push via Expo, persisted in-app).
- Cron jobs are triggered via POST with `x-cron-token` header. Support `dryRun` and `mode` params.

### Client-Side Patterns

- Query factories in `lib/queries/` return `queryOptions()` objects for TanStack Query.
- Mutations use `useMutation` with query invalidation on success.
- Auth client is in `lib/auth-client.ts`.
- UI components are in `components/ui/` (Button, Card, Input, Sheet, etc.).
- Screen layouts use `ScreenContainer` wrapper.

## Development

### Running Locally

```bash
pnpm install
docker compose up -d          # PostgreSQL on port 5434
pnpm --filter mobile exec prisma migrate dev
pnpm dev                      # Expo dev server on port 8010
```

### Package Manager

Use `pnpm`. Do not use npm or yarn.

### Linting and Formatting

- Linter: Oxlint (`pnpm lint:all`)
- Formatter: Oxfmt (`pnpm format:check`)
- Type checking: `pnpm check-types`

### Database Changes

1. Edit `apps/mobile/prisma/schema.prisma`
2. Run `pnpm --filter mobile exec prisma migrate dev --name <migration_name>`
3. Run `pnpm --filter mobile exec prisma generate`
4. Update Zod schemas in `packages/types/` if needed

### Adding API Routes

1. Create route file in `apps/mobile/app/api/`
2. Export async handler functions (`GET`, `POST`, `PATCH`, `DELETE`)
3. Add auth guards with `requireAuth()` / `requireRole()`
4. Validate request bodies with Zod schemas from `@baza/types`
5. Update `docs/api-contract.md`

### Adding Translations

1. Add keys to both `apps/mobile/locales/sr.json` and `apps/mobile/locales/en.json`
2. Use `useTranslation()` hook in components
3. Keep key structure consistent across languages

## Testing

No test framework is currently configured. When adding tests, prefer Vitest for unit/integration and Maestro for E2E mobile testing.

## Deployment

- Mobile: EAS Build + EAS Update
- Server/Web: EAS Hosting
- Database: Neon Postgres

See `docs/deployment-runbook.md` for production procedures.
