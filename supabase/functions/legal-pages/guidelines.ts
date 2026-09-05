import { APP_NAME, SUPPORT_EMAIL } from './shell.ts';

export const guidelinesHtml = `
<h1>Community Guidelines</h1>
<p class="updated">Last updated 25 August 2026</p>

<p>${APP_NAME} works because people trust what's on it. These guidelines are the practical rulebook behind
our Terms of Service — the specific behaviors and content that get something removed, or an account
suspended. Read them once; they're short enough that there's no excuse not to.</p>

<h2>Never allowed — zero tolerance</h2>
<p>These result in immediate content removal and account termination, no warning, and are reported to law
enforcement where required:</p>
<ul>
  <li><strong>Child sexual abuse material (CSAM)</strong> or any content sexualizing, endangering, or exploiting minors</li>
  <li><strong>Non-consensual sexual content</strong>, including real people depicted without consent</li>
  <li><strong>Credible threats of violence</strong> or content that promotes terrorism or organized violent extremism</li>
</ul>

<h2>Not allowed</h2>
<table>
  <tr><th>Category</th><th>What it covers</th></tr>
  <tr><td>Sexual content</td><td>Explicit sexual content of any kind, whether real or drawn/animated</td></tr>
  <tr><td>Violence</td><td>Graphic violence, gore, or content that glorifies real-world harm</td></tr>
  <tr><td>Hate &amp; harassment</td><td>Attacks based on race, religion, ethnicity, gender, sexual orientation, disability, or other protected traits; targeted harassment or bullying of an individual</td></tr>
  <tr><td>Doxxing</td><td>Sharing someone's private information (address, phone number, ID documents) without consent</td></tr>
  <tr><td>Illegal activity</td><td>Sale of illegal goods/services, drug trafficking instructions, or facilitating other crimes</td></tr>
  <tr><td>Fraud &amp; scams</td><td>Phishing, pyramid schemes, fake giveaways, payment scams</td></tr>
  <tr><td>Malware</td><td>Files or links designed to compromise a device or account</td></tr>
  <tr><td>Copyright infringement</td><td>Content you don't own and don't have a license or permission to share</td></tr>
  <tr><td>Impersonation</td><td>Pretending to be another person, brand, or organization to deceive</td></tr>
  <tr><td>Spam</td><td>Repetitive, unsolicited, or bulk-posted content unrelated to genuine channel activity</td></tr>
  <tr><td>Misinformation</td><td>False claims likely to cause real-world harm (health misinformation, election misinformation, etc.)</td></tr>
  <tr><td>Dangerous activities</td><td>Content that instructs or encourages self-harm, dangerous challenges, or activities likely to cause serious injury</td></tr>
</table>

<h2>How enforcement works</h2>
<p>Not every violation gets the same response — we look at severity, intent, and history:</p>
<ol>
  <li><strong>Warning</strong> — for a first, lower-severity issue (e.g., a borderline spam post).</li>
  <li><strong>Content removal</strong> — the specific post, video, or channel is taken down.</li>
  <li><strong>Channel suspension</strong> — a channel with a pattern of violations is suspended entirely.</li>
  <li><strong>Account suspension</strong> — temporary loss of the ability to post or create channels.</li>
  <li><strong>Account ban</strong> — permanent removal, used for severe or repeated violations, or anything in the zero-tolerance list above.</li>
</ol>
<p>We review reports as they come in and prioritize anything involving the zero-tolerance categories above.
Every report is looked at by a person before action is taken — we don't auto-remove content purely on
report volume.</p>

<h2>Creator responsibility</h2>
<p>If you run a public or private channel, you're responsible for the content and access settings you
control. Upload only lawful content, respect intellectual property, use the correct visibility settings,
respond to legitimate issues with your content, and don't use misleading titles, descriptions, or
thumbnails. This responsibility continues even for content published to a private channel.</p>

<h2>Downloaded content</h2>
<p>Downloading a file or video from ${APP_NAME} doesn't transfer ownership of it. Don't re-upload,
redistribute, sell, or mirror downloaded content where doing so would violate copyright, privacy rights,
${APP_NAME}'s rules, or applicable law, and don't use downloaded content to build unauthorized mirrors or
piracy services.</p>

<h2>Evading enforcement</h2>
<p>Don't try to get around enforcement by creating replacement accounts after a ban, using someone else's
account, re-uploading removed prohibited material, changing file names or identifiers to dodge moderation,
or exploiting technical vulnerabilities. Attempted evasion leads to further restrictions or a permanent
ban.</p>

<h2>Reporting content or a user</h2>
<p>Open any post, video, or profile and use the report option to flag it, choosing the category that best
fits. You can also block a user directly, which immediately hides their content from you regardless of
whether a report is filed. Choose the most accurate reason, don't knowingly submit false information, and
don't use the reporting system to harass someone — repeated misuse of reporting or blocking is itself a
violation.</p>

<h2>Copyright reports</h2>
<p>Rights holders should use the process in our
<a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a>. False or fraudulent copyright
notices may result in enforcement against the reporting account.</p>

<h2>Appeals</h2>
<p>If your content was removed or your account was actioned and you think it was a mistake, email
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with your account email and a description of what
happened. We'll review it — a first review being wrong doesn't happen often, but it happens.</p>

<h2>Related policies</h2>
<p><a href="/functions/v1/legal-pages/terms">Terms of Service</a> ·
<a href="/functions/v1/legal-pages/privacy">Privacy Policy</a> ·
<a href="/functions/v1/legal-pages/refund">Refund Policy</a> ·
<a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a></p>
`;
