# Scripts

Tools run from the project root with `node scripts/<name>`. None of them is part of the app bundle.

## Checks (static, safe to run anytime)

| Script                    | What it checks                                                                                  | When                              |
| ------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------- |
| `guards.mjs`              | Rules tsc and eslint cannot express: no reads of the dead `plan` column, no `select('*')` on partially granted tables, the reanimated babel plugin, colours only from the theme, plus release-readiness notes. Each rule names the defect it came from. | Every commit; CI runs it          |
| `audit-apk.mjs <file>`    | A built APK or AAB itself: signing certificate, version, permissions, debug flags               | Before uploading a release to Play |
| `audit-admin-guards.mjs`  | Every admin RPC in the SQL re-checks the caller in its own body                                 | After adding an admin RPC         |
| `audit-schema-sources.mjs`| Inventory of where every table, policy and function is defined across `migrations/` and `legacy-sql/` | When working on `supabase/BASELINE.md` |

## Live verification (talks to the production Supabase project)

These need `.env` and the dependencies in this folder (`npm install --prefix scripts`).

| Script                    | What it proves                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `verify-guest-access.mjs` | What a signed-out visitor can and cannot read. Read-only.                                          |
| `verify-stream-access.mjs`| Premium video protection end to end. **Writes test rows**, so it refuses to run without `--yes-write-to-production`, and cleans up after itself. |

## Build support

| File                          | Used by                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `untracked-cmake.init.gradle` | The release Gradle command in the root README (`-I ../scripts/untracked-cmake.init.gradle`) |
