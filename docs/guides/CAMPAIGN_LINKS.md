# Campaign links — sending ad traffic to the right content

This is the compliant replacement for the client's original point 2
("verify by IP/source, then grant access to hidden channels").

**The rule it is built around:** a campaign decides **where someone starts**.
It never decides **what exists**, and it never decides **what they can watch**.
Everyone sees the same catalogue and hits the same paywall. Nothing is hidden
from anyone, including Play reviewers — which is what
[Play's Deceptive Behavior policy](https://support.google.com/googleplay/android-developer/answer/17006354)
requires, and what the removed cloaking system violated (Finding 0 in
`PLAY_STORE_COMPLIANCE_AUDIT.md`).

---

## What works today

A link of this shape opens the app directly on that channel:

```
https://thecloudlynk.com/c/<channel-id>
```

Use it as the destination URL in Google Ads, Meta, or anywhere else. Someone
who already has the app installed taps the ad and lands on the advertised
channel instead of the home screen.

Implemented in `app/c/[id].tsx`. It does one thing — `router.replace` to the
channel — and deliberately contains no entitlement logic at all, so there is
nothing there for a later change to get wrong.

Nothing about the arrival is recorded. Storing the campaign would be harmless
by itself, but `profiles.acquisition_source` is the exact column the removed
cloaking system read from, and leaving it empty means there is no
half-populated field for anyone to start using again. It also keeps the Data
Safety declaration true: no IP, no location, nothing new collected.

---

## One step left, on the website

`app.json` declares the intent filter with `autoVerify: true`. Android only
honours that — opening the app without showing a "which app?" chooser — if the
domain publicly vouches for the app.

Publish this at **`https://thecloudlynk.com/.well-known/assetlinks.json`**,
served as `application/json` over HTTPS with no redirect:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.cloudlynk.app",
    "sha256_cert_fingerprints": [
      "D8:5B:F0:ED:C0:86:20:47:B1:86:80:7B:96:02:E5:B0:30:A2:07:8A:D2:E8:FA:DF:D9:B2:4B:60:DE:F7:CB:3C"
    ]
  }
}]
```

That fingerprint is this project's **upload key**, read from the signed APK.

> **Important once you publish to Play.** With Play App Signing, Google re-signs
> the app with a *different* key, so the fingerprint above stops matching what
> users install. Take the SHA-256 from **Play Console → Setup → App integrity →
> App signing key certificate** and put **both** fingerprints in the array —
> upload key and app signing key. Keeping both means sideloaded test builds and
> Play installs each verify.

Verify after publishing:

```bash
curl -sSL https://thecloudlynk.com/.well-known/assetlinks.json
```

Until this file is live the link still works — Android just shows a chooser
first, which costs you some of the people who tapped the ad.

---

## What is NOT built: deferred attribution

Today's links cover the case where **the app is already installed**.

They do not cover the harder one: someone without the app taps an ad, goes to
Play, installs, opens — and lands on the home screen, because the link that
brought them was consumed by the Play Store. Closing that needs the **Play
Install Referrer API**, which reports the campaign on first launch.

Deliberately not built yet, for two reasons:

1. It needs a native module (`react-native-play-install-referrer` or similar),
   which means a new native build. This project's Android build is fragile —
   see `BUILD_LOCAL.md` — and adding a native dependency is not a change to
   make on a release day.
2. It only matters once ads are actually running, which cannot happen before
   Play Billing is live.

**If you add it, one rule carries over:** read the campaign name only. Do not
store the IP. The campaign name gives you the marketing signal and changes
nothing in the Data Safety form; an IP is location data and would change the
declaration you have already prepared.

And the same boundary applies — the referrer picks the first screen. It must
never touch `plan_status`, RLS, or anything that decides what a user may watch.
