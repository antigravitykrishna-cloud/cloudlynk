# Play Store listing — Cloudlynk

Copy blocks are ready to paste. Everything below describes what the app
actually does, verified against the code — no claim here needs a feature built
to become true.

**Two things must be settled before submission.** Both are in §6.

---

## 1. App title — 30 characters max

```
Cloudlynk: Store & Stream
```
`25/30`

Both functions in the name. A title that says only "Cloud Storage" is the
mismatch that costs you twice: review sees a storage app and then finds a
subscription video service, and your Meta traffic sees an ad about content
landing on a listing about file backup.

Alternates, if the client prefers:

| Option | Chars |
|---|---:|
| `Cloudlynk — Cloud & Channels` | 28 |
| `Cloudlynk: 15GB + Streaming` | 27 |
| `Cloudlynk: Cloud Video App` | 26 |

---

## 2. Short description — 80 characters max

This is the line under the icon in search results, and it is the single highest
-leverage string in the listing.

```
15 GB free cloud storage, plus movies, series and shorts from creators.
```
`71/80`

Alternates:

| Option | Chars |
|---|---:|
| `Your 15 GB cloud drive and a video library, in one app.` | 55 |
| `Store your files free. Stream movies, series and shorts.` | 56 |
| `15 GB storage free. Premium movies and series when you want them.` | 65 |

Do **not** use the current draft — *"15 GB cloud storage, premium videos, and
public & private channels"* — it leads with the storage and buries the reason
people install.

---

## 3. Full description — 4000 characters max

```
Cloudlynk is two things in one app: a private 15 GB cloud drive, and a place to
watch movies, series and shorts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
15 GB OF STORAGE, FREE FOR EVERYONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every Cloudlynk account gets 15 GB. Not a trial, not a first-month offer — the
same 15 GB whether you ever pay us a rupee or not.

• Back up photos, videos, documents, music and any other file
• Stream your own videos straight from the cloud, no download first
• Organise by type and find things fast with search
• Share a file with a link when you need to
• Your storage never shrinks — a Premium plan does not change it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANNELS AND CREATORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Explore is where Cloudlynk opens. Browse channels by what you are in the mood
for — entertainment, sports, fitness, travel, gaming, devotional, and more.

• Join public channels and follow what they post
• Create your own channel, public or private
• Post shorts, full videos and images to your channel
• Private channels stay invitation-only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREMIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most of Cloudlynk is free. Shorts, posts and community channels cost nothing
and always will.

Premium unlocks the full-length library — movies and series marked Premium:

• Silver — 7 days
• Gold — 1 month
• Platinum — 6 months
• Diamond — 1 year

Premium buys access to Premium-marked content. It does not add storage; every
account keeps the same 15 GB.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFETY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cloudlynk is for adults. You must be 18 or older to create an account, and we
check at signup.

• Report any post or account, from the post itself
• Block anyone — blocked accounts disappear from your feed
• Every upload to a public channel is reviewed before it goes live
• Sexual content, hate speech, harassment and content involving minors are
  banned outright and removed on sight
• Delete your account and everything in it, whenever you want, from Settings

Read our Community Guidelines in the app before you post.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your files are yours. Private files are visible only to you, nothing you upload
to your drive is published anywhere, and account deletion removes your files
from our storage rather than hiding them.

Privacy Policy, Terms, Refund Policy and Copyright Policy are all linked in the
app under Settings.

Cloudlynk — your files and your watchlist, in one place.
```
`2,497 / 4000`

**Why it is not longer.** Play truncates after roughly three lines until
someone taps "more", and keyword stuffing in the description has not helped
ranking for years. Everything above is a claim the app can actually meet, which
is the part that matters when a reviewer opens the app looking for the gap
between the two.

---

## 4. Store settings

| Field | Value | Why |
|---|---|---|
| **Category** | **Entertainment** | The honest answer. The content library is what people install for and what your ads promise. Filing under Productivity to look like a storage tool is the same mismatch as the old title, and Play weighs category fit. |
| **Tags** | Video, Streaming, Cloud storage, Entertainment | |
| **Target age** | 18+ | Enforced at signup, so it is a true statement |
| **Contains ads** | **No** | `ADMOB_ENABLED: false`. Change this the moment ads switch on. |
| **In-app purchases** | **See §6.1** | Depends on the payment decision |
| **Contact email** | `support@cloudlynk.app` | Must be live and monitored before submission |

---

## 5. Content rating questionnaire

Answer honestly; a rating found to be wrong later gets the app pulled, and the
questionnaire is the single most common place a listing quietly lies.

| Question | Answer |
|---|---|
| Does the app contain user-generated content? | **Yes** |
| Can users interact or share content? | **Yes** |
| Does the app have a content moderation system? | **Yes** — pre-publish review queue, plus in-app report and block |
| Sexually explicit content? | **No** — banned by the Community Guidelines |
| Violence / horror? | **Depends on the library** — answer for what is actually published |
| Profanity? | **Depends on the library** |
| Simulated gambling? | **No** |
| Purchase of digital goods? | **See §6.1** |
| Shares user location? | **No** |
| Collects personal info? | **Yes** — email, name, birth year |

That "user-generated content: yes" answer triggers Play's UGC policy, which
requires exactly three things. You have all three: a report mechanism, a block
mechanism, and published community standards. Say so in the review notes.

---

## 6. The two things blocking submission

### 6.1 — The payment decision contradicts the legal pages

You chose to sell subscriptions on the web with UPI. But
`supabase/functions/legal-pages/terms.ts:78` currently reads:

> *"Paid plans are billed through Google Play Billing… Subscriptions renew
> automatically unless canceled through Google Play… Refunds are handled by
> Google."*

That is now false, and it is published at the URL the listing links to as the
app's Terms. A reviewer who opens Terms and sees Play Billing, then finds no
Play Billing product, has found a discrepancy in the listing's own linked
policy.

Whichever way you go, three things move together:

| | Web + UPI | Play Billing |
|---|---|---|
| Terms §10 | rewrite: UPI, your refund process, your cancellation | leave as-is |
| Refund policy | you handle refunds — needs a real process and an SLA | Google handles them |
| "In-app purchases" flag | **No** | **Yes** |
| Data Safety | add payment info collected by your processor | Play handles it |

### 6.2 — Web checkout breaks the funnel you are buying ads for

Worth deciding with eyes open, because it affects the ad spend directly.

Play's anti-steering rules restrict an app from pointing users at an external
payment page for digital content. So the natural flow —

```
Meta ad → install → browse → hit Premium → pay by UPI
```

— is the flow the app is least able to support, because the app cannot
comfortably tell the user where to pay.

The flow that does work:

```
Meta ad → web landing page → UPI checkout → download app → sign in → Premium already active
```

Money is collected before the install, on a surface Play does not govern, and
the app only ever reads an entitlement it did not sell. Your ad already has to
carry a landing page; this just makes the landing page do the selling.

It also changes what the listing should say: with web checkout, the listing
must **not** advertise buying a subscription inside the app, and §3 above is
already written that way — it describes what Premium unlocks and names the
plans without ever saying "subscribe here".

I am not a lawyer and Play's payment rules in India are actively changing.
Confirm the current position with Play Console policy support before spending
on ads — it is a free question with an expensive wrong answer.

---

## 7. Assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | Have it |
| Feature graphic | 1024×500 | Have it — **update the text**, see below |
| Phone screenshots | ≥ 4, 16:9 or 9:16, min 320px | Have them — **restage in the new palette** |
| Privacy Policy URL | public, live | Deployed as an edge function |

**The feature graphic needs one change.** The current one reads *"All
transactions are securely handled through Google Play Billing"* in the store
copy and shows the old orange UI. Both are now wrong. Replace the payment line
with something true — *"15 GB free for every account"* works and is a stronger
hook anyway.

**Screenshots should be restaged** against the v0.7.1 navy palette, since the
current ones show the orange build. Order them by what sells:

1. Explore — the content grid, because it is what the app opens to
2. A premium title's detail page
3. Channels — the public/private split
4. My Files — the 15 GB meter, showing storage is real
5. Settings — report, block, delete account, visibly present

Caption each one. Uncaptioned screenshots are a wasted conversion surface.
