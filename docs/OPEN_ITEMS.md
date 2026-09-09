# Open items — 2026-09-10

Things found during the login/subscription/Play-readiness work that are **not
done**, with enough analysis attached that each is a short job rather than a
fresh investigation.

Ordered by how much they matter.

---

## 1. Signing up makes the premium catalogue disappear

**This is the one to fix first.** It is a product bug and it partly defeats
requirement 2 ("user can only see preview content set by the backend; full
content will remain locked").

### What happens

| Who | Sees premium posts? |
|---|---|
| Guest (not signed in) | **Yes** — locked. Title, thumbnail, access level. No `video_url`. |
| Signed in, no subscription | **No.** They vanish entirely. |
| Signed in, subscribed | Yes, in full. |

So the funnel runs backwards. A guest browses a wall of locked premium titles —
the reason to subscribe — then creates an account and the entire catalogue
disappears. The person who has just shown the most intent sees the least.

### Why

Two policies, written at different times, disagree.

- `channel_posts_select_anon` (v61/v66) has **no `access_level` test**. Guests
  reach every approved post in a public active channel. Premium rows are safe
  to show because the column-level `GRANT` withholds `video_url` from `anon` —
  they get `title, thumbnail_url, access_level` and nothing playable. The
  locked catalogue is deliberate; v61's own comment calls it "the signup
  incentive".

- `channel_posts_select_v57` gates on
  `access_level = 'free' OR is_plan_active(...) OR has_content_access(...)`,
  which filters premium rows out of the result for anyone without a
  subscription.

Nobody designed this. v61 added guest browsing to a policy set that already had
the v57 entitlement test, and the two were never reconciled.

### Why I did not fix it tonight

The fix is not "relax the v57 policy". RLS is row-level, so admitting the row
also admits every column the role can read — and `authenticated` **can** read
`video_url` (verified: `anon` is granted `access_level, thumbnail_url, title`;
`authenticated` additionally gets `media_url, video_url`). Loosening the policy
alone would hand every signed-in free user the premium `video_url`.

The correct shape is to make `authenticated` look like `anon`:

1. Revoke `SELECT (video_url, media_url)` on `channel_posts` from `authenticated`.
2. Let free content resolve through `public.free_post_media`, which is already
   granted to `authenticated` and already pins `access_level = 'free'`.
3. Let premium content resolve only through `stream-playback-token`, which
   already checks `is_plan_active` and `account_status`.
4. Then relax the v57 entitlement branch so premium rows are *visible* but not
   *playable*.

That is coherent — it is the model the guest path already uses — but step 1
changes how **video playback resolves for every signed-in user**, and
`lib/posts.ts` builds unsigned URLs directly from `video_url` on the free path.
Blast radius is "all playback". It needs a device test, and I could not run one.

**Do not ship this without playing: a free video as a signed-in free user, a
premium video as a subscriber, and a premium video as a signed-in free user
(must fail).**

---

## 2. Preview clips do not exist

Requirement 2 says *"user can only see preview content set by the backend"*.
What ships today is a **metadata preview**: title, thumbnail, genre, duration,
with a lock badge. There is no trailer, and no "first 30 seconds" clip.

If "preview" was meant literally, it is a real feature, not a setting:

- a `trailer_url` / preview asset per post (the column referenced in
  `delete-account`'s comments suggests one was once contemplated),
- an admin upload path for it,
- a player that serves the trailer to non-subscribers and the full asset to
  subscribers.

Worth confirming with the client which they meant before building it.

---

## 3. AdMob ships linked but dead

`react-native-google-mobile-ads` is a dependency, its plugin is configured in
`app.json`, and the unit IDs there are **Google's public test IDs**
(`ca-app-pub-3940256099942544/...`). Nothing renders an ad — `lib/adsConfig.ts`
says so directly.

v78's permission work strips `AD_ID` and the three `ACCESS_ADSERVICES_*`
permissions so the Data Safety form can honestly say no advertising ID is
collected. That is correct **while ads are off**.

Pick one before launch:

- **Not doing ads yet** → consider dropping the dependency entirely. It is dead
  weight in the bundle and a permanent footnote on every Data Safety review.
- **Doing ads** → replace the test IDs with real ones, remove the four ad
  entries from `plugins/withRemoveAndroidPermissions.js`, and update Data
  Safety to declare Device or other IDs. All three together, or the app either
  serves test ads in production or gets flagged for an inaccurate declaration.

---

## 4. ESLint cannot run

`npx eslint` crashes on **any** file that imports a package:

```
EslintPluginImportResolveError: typescript with invalid interface loaded as resolver
Rule: "import/namespace"
```

Pre-existing and unrelated to this work — untouched files like `lib/storage.ts`
fail identically, while files with only relative imports (`lib/channels.ts`)
pass. `eslint-config-expo` pins an `eslint-plugin-import` whose resolver
interface does not match the installed `eslint-import-resolver-typescript`.

Consequence: `tsc --noEmit` is currently the only static gate. It does not
catch unused variables, missing hook dependencies, or accidental shadowing —
and the old login screen shipped a `showAlert` that shadowed its own import and
recursed until the stack overflowed, which is exactly the class of bug lint
exists to catch.

---

## 5. `signup.tsx` is now a legacy path

The login rebuild made `/(auth)/login` the one-tap chooser that also creates
accounts. `/(auth)/signup` — email, password, name, birth year — is no longer
linked from anywhere in the normal flow (the two prompts that still pointed at
it were repointed).

It is kept because accounts created before the change still have passwords and
`signInWithPassword` still works. But it is now unreachable UI carrying its own
validation logic. Either surface it deliberately ("sign in with a password
instead") or delete it once no one relies on it.
