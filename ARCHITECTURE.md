# Architecture

How the code is organised, and the rules that keep it that way. Read this before adding a screen,
a query or a server function.

## The three parts

```
 src/                     the Android app (Expo, React Native, TypeScript)
   │  supabase-js, as the signed-in user: row level security applies
   ▼
 supabase/                Postgres + Auth + Storage, and edge functions for anything secret
   │  service-side API calls
   ▼
 Cloudflare Stream        video upload and signed playback
```

The app never holds a secret beyond the public anon key. Whatever needs one (Cloudflare, Google
Play, payment gateways) or must not be trusted to the client (granting Premium) is an edge function
or a `SECURITY DEFINER` RPC. See [`supabase/README.md`](supabase/README.md).

## The app: `src/`

```
src/
  app/              routes only (expo-router). Each file re-exports a feature screen.
  features/<name>/  everything for one area of the product
  components/ui/    the shared design system: Button, TextField, Card, Chip, ScreenHeader, EmptyState...
  lib/              configured clients: supabase, query client, config, edge function caller, media
  theme/            colours, spacing, type scale, radii -- the only place a colour literal may appear
  utils/            pure helpers: formatting, errors, async, base64
  hooks/            hooks shared across features (pull to refresh)
```

### A feature

```
features/premium/
  api/          the only code that talks to Supabase or our edge functions. One object per area
                (plansApi, paymentGatewaysApi), returning typed data or throwing.
  hooks/        state and side effects for screens (usePremiumCheckout, useSubscriptionPlans).
  components/   presentational pieces used by this feature's screens.
  screens/      one file per route, composed from hooks and components.
  __tests__/    unit tests for the pure modules.
  *.ts          pure logic with no React and no I/O (plans.ts, purchaseGate.ts), easy to test.
```

Features: `auth`, `account`, `content` (explore, feed, posts), `channels`, `player`, `upload`,
`files` (the Cloud tab), `notifications`, `premium`, `admin`, `legal`, `geo`.

### Rules

1. **Data flows screen -> hook -> api -> Supabase.** Only `features/*/api/`, `lib/` and the
   payment SDK wrappers in `premium/billing/` import `@/lib/supabase`; ESLint enforces it. A screen
   never builds a query.
2. **Routes are thin.** `src/app/(tabs)/explore.tsx` is
   `export { default } from '@/features/content/screens/ExploreScreen';`. Navigation structure lives
   in `src/app/`, behaviour in features.
3. **Shared UI before local styles.** Buttons, fields, headers, chips, empty states and cards come
   from `components/ui/`. A feature component exists when a piece is specific to that feature.
4. **Colours come from the theme.** `Colors.*` or `withAlpha(Colors.x, 0.2)`, never a hex or
   `rgba()` literal. `scripts/guards.mjs` fails the build otherwise.
5. **Logic that can be pure, is.** Decisions (who may buy, which plan is preselected, how files are
   categorised, when to offer resume) live in plain functions with tests, so hooks and screens only
   wire them up.
6. **Errors are shown, not swallowed.** Catch at the hook or screen, and show
   `errorMessage(err, 'fallback')`. Background work that may fail quietly logs under `__DEV__`.
7. **Types come from the database.** `src/lib/database.types.ts` is generated (`npm run db:types`);
   api modules export named types such as `type Profile = Tables<'profiles'>`.

### Naming

| Thing          | Convention                          | Example                         |
| -------------- | ----------------------------------- | ------------------------------- |
| Screen         | `XScreen.tsx`, default export       | `PremiumScreen.tsx`             |
| Component      | `PascalCase.tsx`, named export      | `PlanOptions.tsx`               |
| Hook           | `useX.ts`                           | `usePremiumCheckout.ts`         |
| API module     | `xApi.ts` exporting `const xApi`    | `plansApi.listActive()`         |
| Pure module    | `camelCase.ts`, named exports       | `purchaseGate.ts`               |
| Imports        | `@/` alias, no barrel files         | `@/features/premium/plans`      |

## Server: `supabase/`

- `migrations/`: the schema, one change per file, applied in order. RLS policies are the security
  boundary for everything the app reads directly.
- `functions/`: one folder per edge function. Each reads parse -> authorize -> act -> respond on
  the helpers in `functions/_shared/` (`servePost`, `requireCaller`, `adminClient`, `streamApi`).

Details: [`supabase/README.md`](supabase/README.md) and
[`supabase/functions/README.md`](supabase/functions/README.md).

## Quality gates

`npm run check` runs what CI runs for the app:

| Step          | Command                              |
| ------------- | ------------------------------------ |
| Types         | `tsc --noEmit` (strict)              |
| Lint          | `eslint src` (includes the layering rule) |
| Format        | `prettier --check`                   |
| Unit tests    | `jest`                               |
| Project rules | `node scripts/guards.mjs`            |

CI also bundles the app (`expo export`) and typechecks every edge function with `deno check`.
