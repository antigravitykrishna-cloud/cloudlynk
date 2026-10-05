# Documentation

Code-level documentation lives next to the code: [`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`supabase/README.md`](../supabase/README.md), [`supabase/functions/README.md`](../supabase/functions/README.md)
and [`scripts/README.md`](../scripts/README.md). This folder holds everything else.

## `guides/` — how to do things today

| Guide                                                    | For                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- |
| [WHAT_I_NEED_FROM_YOU.md](guides/WHAT_I_NEED_FROM_YOU.md) | What the owner still has to provide before launch         |
| [STATUS.md](guides/STATUS.md), [OPEN_ITEMS.md](guides/OPEN_ITEMS.md) | Where things stand and what is left               |
| [BUILD_LOCAL.md](guides/BUILD_LOCAL.md), [BUILD.md](guides/BUILD.md), [BUILD_AND_TEST.md](guides/BUILD_AND_TEST.md) | Building and installing the Android app |
| [AAB_READINESS.md](guides/AAB_READINESS.md)              | Everything between a build and a Play release              |
| [DEPLOY_V57_V58.md](guides/DEPLOY_V57_V58.md)            | Applying the v57-v60 migrations and functions, with checks |
| [TURN_ON_PAYMENTS.md](guides/TURN_ON_PAYMENTS.md)        | Switching on Google Play billing and the gateways          |
| [BACKEND_REFERENCE.md](guides/BACKEND_REFERENCE.md)      | Long-form backend notes: billing, Stream, deletion, RLS    |
| [ADMIN_ACCESS.md](guides/ADMIN_ACCESS.md), [ADMIN_WORKFLOW_STATUS.md](guides/ADMIN_WORKFLOW_STATUS.md) | Getting into and using the admin panel |
| [TEST_PLAN.md](guides/TEST_PLAN.md)                      | Manual test plan for a release                             |
| [CAMPAIGN_LINKS.md](guides/CAMPAIGN_LINKS.md)            | Ad links that open specific content                        |
| [HANDOVER.md](guides/HANDOVER.md)                        | The 2026-09-05 handover snapshot (credentials warning)     |

## `play-store/`

Store listing text, Data safety answers, App access instructions, the compliance audit and
screenshots.

## `audits/`

Point-in-time security, database and player reviews. Each is dated; later code may have fixed what
they found.

## `history/`

Handoffs, release notes and design notes from earlier phases of the project (some from when it was
called Jollify and then Streamly). Kept for context; file paths and decisions in them may be out of
date.
