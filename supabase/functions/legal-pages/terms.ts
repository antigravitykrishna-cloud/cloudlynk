import { APP_NAME, DEVELOPER_NAME, SUPPORT_EMAIL } from './shell.ts';

export const termsHtml = `
<h1>Terms of Service</h1>
<p class="updated">Last updated 25 August 2026</p>

<p>These terms govern your use of ${APP_NAME}, operated by ${DEVELOPER_NAME}.
By checking "I agree" at signup, you're accepting all of the sections below — not just the sentence next to
the checkbox. We keep a record of exactly which version of these terms you accepted and when, so if we
change something significant, we'll ask you to accept again.</p>

<h2>1. Eligibility</h2>
<p>You must be at least 18 years old to create an account or use ${APP_NAME}. By signing up, you confirm
you meet this requirement. We verify this at signup and may re-verify it at any time.</p>

<h2>2. Your account</h2>
<p>You're responsible for keeping your password confidential and for all activity under your account.
Tell us immediately at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> if you believe your account
has been compromised.</p>

<h2>3. Cloud storage</h2>
<p>Every account — free or Premium — includes 15 GB of personal cloud storage. Storage is for content you
own or have the right to store — not a general file-locker for redistributing other people's copyrighted
material.</p>

<h2>4. Channels and public content</h2>
<p>A channel is a space you create to publish content to other users, either publicly or to invited members.
Creating a channel or posting content requires that you've accepted the current version of these Terms and
our Community Guidelines, and that you're at least 18 — this is enforced automatically, not just requested.
All public content passes through a review queue before it's visible to anyone but you.</p>

<h2>5. User-generated content — ownership and license</h2>
<p>You keep ownership of everything you upload. By posting content publicly, you grant ${APP_NAME} a
non-exclusive, worldwide, royalty-free license to host, store, transmit, and display that content solely for
the purpose of operating the app (e.g., serving it to viewers, generating thumbnails, transcoding video for
playback). This license ends when you delete the content or your account, except for copies already
delivered to other users' devices before that point, or content we're required to retain for legal or
moderation-record purposes as described in our Privacy Policy.</p>

<h2>6. Prohibited content and conduct</h2>
<p>The following are never allowed on ${APP_NAME}, without exception:</p>
<ul>
  <li>Child sexual abuse material (CSAM), or any content that sexualizes or endangers minors in any way</li>
  <li>Non-consensual sexual content, or sexual content involving real people without their consent</li>
  <li>Content that threatens, incites, or glorifies violence, or promotes terrorism</li>
  <li>Hate speech or content that promotes discrimination or hostility based on protected characteristics</li>
  <li>Harassment, bullying, doxxing, or stalking of any individual</li>
  <li>Illegal activity of any kind, including the sale of illegal goods or services</li>
  <li>Malware, phishing, or content designed to compromise a device or account</li>
  <li>Copyright or trademark infringement — content you don't own or have a license to distribute</li>
  <li>Impersonation of another person, brand, or organization</li>
  <li>Spam, scams, or fraudulent schemes</li>
  <li>Deliberate misinformation likely to cause real-world harm</li>
  <li>Instructions or promotion of dangerous or self-harmful activities</li>
</ul>
<p>See our <a href="/functions/v1/legal-pages/guidelines">Community Guidelines</a> for how we define and
enforce these categories in practice.</p>

<h2>7. Reporting and blocking</h2>
<p>Every piece of public content and every user profile can be reported in-app for review. You can also
block another user, which hides their content from you and prevents further interaction. Filing a report
starts a human review — not an automatic removal — so please describe the issue accurately.</p>

<h2>8. Copyright complaints</h2>
<p>If you believe content on ${APP_NAME} infringes your copyright or other intellectual-property rights,
see our <a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a> for how to submit a
complaint and exactly what to include. We remove content in response to valid notices and may terminate
accounts of repeat infringers.</p>

<h2>9. Moderation and enforcement</h2>
<p>We review reports and take action appropriate to what we find — that can mean removing content, issuing
a warning, suspending a channel, suspending an account, or permanently banning an account, depending on
severity and history. We aim to review reports promptly, but we don't promise a fixed turnaround time,
since serious reports are prioritized ahead of minor ones. Suspended or banned accounts' public content is
hidden from other users immediately.</p>

<h2>10. Subscriptions and billing</h2>
<p>Paid plans are billed through Google Play Billing. Pricing, billing cycle, and renewal terms are shown
before you purchase. A Premium subscription unlocks content that creators or ${APP_NAME} have designated
as Premium (movies, series, or shorts) for as long as the subscription is active — it does not increase
your storage allocation, which stays 15 GB for every account regardless of plan. Subscriptions renew
automatically unless canceled through Google Play before the renewal date. Refunds are handled by Google
Play under its own refund policies — ${APP_NAME} does not process refunds directly for Play Store
purchases. See our <a href="/functions/v1/legal-pages/refund">Refund Policy</a> for details.</p>

<h2>11. Account termination</h2>
<p>You can stop using ${APP_NAME} at any time. We may suspend or terminate accounts that violate these
Terms or our Community Guidelines, pose a security risk, or where required by law.</p>

<h2>12. Account deletion</h2>
<p>You can delete your account in-app or through our external
<a href="/functions/v1/account-deletion">account deletion page</a> without needing the app installed. See
our Privacy Policy for exactly what's deleted and what's retained afterward.</p>

<h2>13. Downloads and sharing</h2>
<p>Where ${APP_NAME} provides download or sharing functionality for eligible content, you remain
responsible for complying with applicable laws and rights restrictions. Downloading content does not
transfer ownership to you, and public availability does not grant you a license to use copyrighted content
beyond the rights available to you. Do not redistribute content unlawfully or in violation of the
creator's rights. We may limit, disable, or remove download or share functionality for content or accounts
where necessary.</p>

<h2>14. Security and acceptable use</h2>
<p>You must not: attempt to circumvent authentication or authorization; probe or exploit vulnerabilities
without authorization; bypass Premium or channel-access controls; access or exfiltrate another user's
data; reverse engineer or tamper with security controls for abusive purposes; overload, disrupt, or attack
${APP_NAME} infrastructure; use automated tools to scrape or abuse the service at scale without permission;
upload malware; or interfere with another user's access. Report security vulnerabilities responsibly to
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

<h2>15. Disclaimers</h2>
<p>${APP_NAME} is provided "as is" and "as available." We don't guarantee the app will be uninterrupted,
error-free, or that content uploaded by other users is accurate, legal, or appropriate — we moderate what
we can, but we can't pre-screen everything before it's reported. We don't guarantee that every feature
will always be available, that content will always remain available, or that your stored content will
always be accessible without interruption. Nothing here excludes a legal right or protection that cannot
lawfully be excluded.</p>

<h2>16. Limitation of liability</h2>
<p>To the maximum extent permitted by law, ${APP_NAME} and its operator aren't liable for indirect,
incidental, special, consequential, or punitive damages arising from your use of the app, including loss
of data, content, or access. Where liability cannot be excluded, it is limited to the extent permitted by
applicable law, and nothing here limits liability where the law doesn't allow it to be limited.</p>

<h2>17. Indemnity</h2>
<p>To the extent permitted by applicable law, you agree to defend, indemnify, and hold harmless
${APP_NAME} and its operator, personnel, and service providers from claims, losses, liabilities, and
reasonable costs arising from your violation of these Terms, your unlawful use of ${APP_NAME}, content you
upload or distribute, your infringement of another person's rights, or your misuse of the service.</p>

<h2>18. Beta and experimental features</h2>
<p>Some features may be introduced as beta, preview, or experimental functionality. Such features may be
changed or removed without notice and may not have the same reliability or availability as established
features.</p>

<h2>19. Appeals</h2>
<p>Where ${APP_NAME} provides an appeal or reconsideration process for a particular enforcement decision,
you may follow the instructions presented with that decision, or email
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Not every action has an appeal route, especially
where immediate action is required for safety, security, legal, or fraud-prevention reasons.</p>

<h2>20. Changes to these terms</h2>
<p>We may update these Terms as the product changes. Material changes require you to re-accept the new
version before you can continue creating channels or posting content — your account isn't locked out
entirely, just gated from new UGC creation until you do. The updated version will carry a new
"last updated" date.</p>

<h2>21. Governing law</h2>
<p>These Terms are governed by the laws of India, and the courts of Surat, Gujarat, India shall have
exclusive jurisdiction over any disputes arising from these Terms, without regard to conflict-of-law
principles, except where mandatory local law provides otherwise.</p>

<h2>22. Severability, waiver, and entire agreement</h2>
<p>If any provision of these Terms is found invalid or unenforceable, it will be limited or removed to the
minimum extent necessary and the rest will continue to apply. Our failure to enforce a provision is not a
waiver of our right to enforce it later. These Terms, together with the
<a href="/functions/v1/legal-pages/privacy">Privacy Policy</a>,
<a href="/functions/v1/legal-pages/guidelines">Community Guidelines</a>,
<a href="/functions/v1/legal-pages/refund">Refund Policy</a>, and
<a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a>, form the agreement governing
your use of ${APP_NAME}, except where mandatory law provides otherwise.</p>

<h2>23. Contact</h2>
<p>Questions about these Terms: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`;
