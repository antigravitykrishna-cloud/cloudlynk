import { APP_NAME, DEVELOPER_NAME, SUPPORT_EMAIL } from './shell.ts';

export const privacyPolicyHtml = `
<h1>Privacy Policy</h1>
<p class="updated">Last updated 25 August 2026</p>

<p>${APP_NAME} is a personal cloud storage and channel-sharing app. This page explains, in plain language,
exactly what we collect, why we collect it, who else ever sees it, and what say you have over it. If a
sentence here feels vague, that's a bug — email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and
we'll fix the wording.</p>

<div class="callout">
  <strong>The short version:</strong> we collect what we need to run your account, store your files, and
  process a subscription if you buy one. We don't sell your data. Everything below exists to make that
  promise checkable, not to bury it.
</div>

<h2>1. Who we are</h2>
<p>${APP_NAME} is operated by ${DEVELOPER_NAME}. For any privacy question,
data request, or complaint, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> — this is also
our designated contact for grievances under India's Digital Personal Data Protection Act, 2023, for users
in India.</p>

<h2>2. Information we collect</h2>

<h3>2.1 What you give us directly</h3>
<ul>
  <li><strong>Account details</strong> — name, email address, and password (stored as a salted hash, never in plain text) when you sign up.</li>
  <li><strong>Birth year</strong> — used solely to confirm you're 18 or older, which is required to use ${APP_NAME}. We store the year, not a full date of birth.</li>
  <li><strong>Content you upload</strong> — files in your personal cloud storage, and any channel, post, video, or thumbnail you create or upload publicly.</li>
  <li><strong>Payment-related information</strong> — if you subscribe to a paid plan, Google Play Billing handles your actual payment method; we never see or store your card details. We do receive a purchase token and subscription status from Google so we know to unlock your plan.</li>
  <li><strong>Anything you send us directly</strong> — support emails, in-app reports you file against content or another user, and copyright complaints.</li>
</ul>

<h3>2.2 What we collect automatically</h3>
<ul>
  <li><strong>Usage data</strong> — which screens you open, what you watch and for how long (so "continue watching" works), and basic app diagnostics if something crashes.</li>
  <li><strong>Device and connection information</strong> — device type, operating system version, and app version, used for compatibility and debugging.</li>
  <li><strong>Approximate location (country only)</strong> — resolved from your connecting IP address at the network edge (see §4) to apply regional restrictions where legally required. We do not resolve or store city-level or precise GPS location, and your raw IP address is not retained by us afterward.</li>
</ul>

<h3>2.3 Advertising data (only if ads are enabled)</h3>
<p>${APP_NAME}'s current release does not intentionally enable in-app advertising. If advertising or an
advertising SDK is enabled in a future release, ${APP_NAME} may show ads served by Google AdMob to keep the
free tier sustainable; when ads are active, Google AdMob may collect an advertising identifier and
interaction data (impressions, clicks) under its own privacy policy — see
<a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google's Privacy Policy</a>.
We would update this policy and our Google Play Data Safety declarations before or when such a change is
introduced. You can manage ad personalization for your device in your phone's system settings.</p>

<h3>2.4 Camera, microphone, photos, and media access</h3>
<p>If you use features that require them, ${APP_NAME} may request access to your camera (to capture
content), your microphone (when recording video or audio that requires it), and your selected
photos/videos or device media (to upload or manage content). These permissions are used only for the
associated functionality, and you can manage them through your device settings.</p>

<h2>3. Why we collect it</h2>
<table>
  <tr><th>Purpose</th><th>What it relies on</th></tr>
  <tr><td>Creating and securing your account</td><td>Email, password, birth year</td></tr>
  <tr><td>Storing and serving your files/videos</td><td>Uploaded content</td></tr>
  <tr><td>Processing a subscription</td><td>Purchase token from Google Play Billing</td></tr>
  <tr><td>Keeping the app free of illegal or abusive content</td><td>Reports you file, moderation review of public content</td></tr>
  <tr><td>Confirming you're old enough to use the app</td><td>Birth year</td></tr>
  <tr><td>Complying with regional legal restrictions</td><td>Country resolved via §4</td></tr>
  <tr><td>Showing ads to fund the free tier (optional feature)</td><td>Advertising identifier, only if ads are enabled</td></tr>
  <tr><td>Fixing bugs and improving the app</td><td>Usage data, crash diagnostics</td></tr>
</table>

<h2>4. Who we share it with</h2>
<p>We don't sell your personal data, and we don't share it with anyone for their own marketing purposes. We
do use a small number of service providers to actually run the app — each only receives what it needs to do
its job:</p>
<table>
  <tr><th>Provider</th><th>What they receive</th><th>Purpose</th></tr>
  <tr><td>Supabase</td><td>Account data, uploaded file metadata, app database</td><td>Authentication, database, and personal file storage</td></tr>
  <tr><td>Cloudflare (Stream)</td><td>Video files you upload to channels</td><td>Video transcoding and playback delivery</td></tr>
  <tr><td>Cloudflare (Workers)</td><td>Your connecting IP address, at the network edge only</td><td>Resolving your country for regional restrictions — not logged or stored by us</td></tr>
  <tr><td>Google Play Billing</td><td>Purchase/subscription information</td><td>Processing payments for paid plans</td></tr>
  <tr><td>Google AdMob <em>(only if ads are enabled)</em></td><td>Advertising identifier, ad interaction data</td><td>Serving and measuring ads</td></tr>
</table>
<p>We may also disclose information if required by law, to protect the rights or safety of ${APP_NAME}, our
users, or the public, or in connection with a merger, acquisition, or sale of assets — in which case this
policy would continue to apply to your data under the new operator.</p>

<h2>5. How long we keep it</h2>
<ul>
  <li><strong>Account and profile data</strong> — kept while your account is active, deleted within 30 days of account deletion (see §7).</li>
  <li><strong>Uploaded content</strong> — kept while your account is active or until you delete it; removed permanently, including from Cloudflare Stream, when your account is deleted.</li>
  <li><strong>Moderation and report records</strong> — kept for up to 12 months after resolution, to detect repeat violations and comply with legal retention expectations for UGC platforms.</li>
  <li><strong>Billing records</strong> — kept as required by tax and accounting law even after account deletion, limited to what's needed for that purpose.</li>
  <li><strong>Country resolution (§4)</strong> — not stored server-side at all; your device caches the result locally for 24 hours purely to avoid repeat lookups.</li>
</ul>

<h2>6. Security</h2>
<p>Passwords are hashed, not stored in plain text. Data in transit is encrypted (HTTPS/TLS). Access to
production data is restricted to what's operationally necessary, and privileged account changes (like
granting admin access or premium status) can only be made through server-side checks — never by a client
app calling an API directly. No system is perfectly secure, and if we ever learn of a breach affecting your
data, we'll notify affected users and relevant authorities as required by law.</p>

<h2>7. Your rights and choices</h2>
<ul>
  <li><strong>Access & export</strong> — request a copy of your data any time from Settings → Export My Data, or by emailing us.</li>
  <li><strong>Correction</strong> — update your profile directly in the app.</li>
  <li><strong>Deletion</strong> — delete your account in-app (Settings → Delete Account), or without installing the app at all via our
    <a href="/functions/v1/account-deletion">external account deletion page</a>. Either path permanently removes your account, uploaded
    files, and channel data, including from our video and storage providers.</li>
  <li><strong>Ad personalization</strong> — controllable from your device's system-level ad settings, independent of this app.</li>
  <li><strong>Withdrawing consent</strong> — you can stop using the app and delete your account at any time; some data (see §5) is retained
    only as long as legally required afterward.</li>
</ul>

<h2>8. Children's privacy</h2>
<p>${APP_NAME} is restricted to users 18 years of age and older, enforced at signup and rechecked on the
server for every account. We do not knowingly collect data from anyone under 18. If we learn that an
account belongs to someone under 18, we will delete it.</p>

<h2>9. Third-party services</h2>
<p>${APP_NAME} relies on third-party infrastructure and services to operate parts of the product. These
currently include Supabase (authentication, database, backend functions), Cloudflare R2 (file storage),
Cloudflare Stream (video transcoding and delivery), Cloudflare network/security services (including
edge-based country resolution), Google Play and Google Play Billing (Android distribution and purchases),
and Google Sign-In where enabled. Other providers may be introduced for hosting, security, communications,
analytics, or operational support, and we will update this policy when our material data practices change.
Each provider handles data under its own policies, which you should also review.</p>

<h2>10. Copyright and intellectual-property reports</h2>
<p>If you believe content on ${APP_NAME} infringes your copyright or other intellectual-property rights,
see our <a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a> for how to submit a
report and what to include. We retain information about copyright complaints to process the report, enforce
our policies, prevent repeat infringement, and satisfy legal obligations.</p>

<h2>11. International users</h2>
<p>Our infrastructure providers (Supabase, Cloudflare, Google) operate data centers in multiple countries,
so your data may be processed outside your home country. Where required by applicable law, we use
appropriate safeguards for cross-border transfers. Each provider maintains its own data-protection
safeguards; see their respective policies for details.</p>

<h2>12. Changes to this policy</h2>
<p>If we materially change what we collect or how we use it, we'll update the "last updated" date above and,
for significant changes, prompt you to review and re-accept the policy the next time you open the app (see
our Terms of Service for how policy-version acceptance works).</p>

<h2>13. Contact us</h2>
<p>Questions, requests, or complaints about this policy: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
Related policies: <a href="/functions/v1/legal-pages/terms">Terms of Service</a>,
<a href="/functions/v1/legal-pages/guidelines">Community Guidelines</a>,
<a href="/functions/v1/legal-pages/refund">Refund Policy</a>,
<a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a>.</p>
`;
