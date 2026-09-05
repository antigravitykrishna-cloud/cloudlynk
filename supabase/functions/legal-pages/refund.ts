import { APP_NAME, SUPPORT_EMAIL } from './shell.ts';

export const refundPolicyHtml = `
<h1>Refund Policy</h1>
<p class="updated">Last updated 31 August 2026</p>

<p>${APP_NAME} provides cloud storage, public and private channels, user-generated content, and access to
specially designated Premium videos and other Premium content. This Refund Policy explains how refunds,
cancellations, and Premium access work for purchases made through Google Play.</p>

<div class="callout">
  <strong>The short version:</strong> Premium is sold only through Google Play Billing. Refunds follow
  Google Play's own refund process and your local consumer law. ${APP_NAME} never sells Premium through
  UPI, bank transfer, or manual payment approval — if someone offers that, it's a scam.
</div>

<h2>1. Premium in ${APP_NAME}</h2>
<p>Every ${APP_NAME} account — free or Premium — includes 15 GB of cloud storage. Premium does
<strong>not</strong> increase the storage allocation. Premium provides access to specially designated
Premium videos and other Premium content while your Premium entitlement is active, and may also be subject
to channel membership and other access controls.</p>

<h2>2. How Android Premium purchases work</h2>
<p>Premium purchases made inside the Android version of ${APP_NAME} are processed through Google Play
Billing. ${APP_NAME} does not operate a separate UPI, bank-transfer, or manual screenshot-based payment
flow for Android Premium purchases. Google Play handles the payment transaction and provides the
purchase/subscription information ${APP_NAME} needs to determine your Premium entitlement. Google Play's
guidance states that refund eligibility depends on factors such as the type of purchase, how long ago it
was made, the payment method, and your location.</p>

<h2>3. How to request a refund</h2>
<p>For a Google Play Premium purchase, use Google's official refund process first:</p>
<ul>
  <li><strong>Google Play refund help:</strong>
    <a href="https://support.google.com/googleplay/workflow/9813244" target="_blank" rel="noopener">support.google.com/googleplay/workflow/9813244</a></li>
</ul>
<p>You can also contact ${APP_NAME} Support at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> for
purchase-related assistance. We can help investigate billing or entitlement problems, but a refund decision
may ultimately be made by Google according to the applicable Google Play refund process and the
circumstances of the purchase.</p>

<h2>4. Refund eligibility</h2>
<p>Refund eligibility is determined under the applicable Google Play refund rules, any rights provided by
applicable law, and any additional refund rights ${APP_NAME} chooses to provide. In general:</p>
<ul>
  <li>some purchases may be eligible for a refund depending on when and how they were purchased;</li>
  <li>users may request refunds through Google Play;</li>
  <li>some refund requests may be handled by the developer; and</li>
  <li>refund rules can differ by country or region.</li>
</ul>
<p>Nothing in this Policy removes a consumer right that cannot lawfully be excluded.</p>

<h2>5. Cancelling a subscription</h2>
<p>If a ${APP_NAME} Premium product is an auto-renewing Google Play subscription, you can cancel it through
Google Play's subscription-management tools. Generally, cancelling a subscription stops future renewals
while access continues through the already-paid billing period. Some countries provide different
cancellation or refund rights under applicable law. ${APP_NAME} does not treat cancellation of an
auto-renewing subscription as an automatic refund of the current paid period — cancel before the next
renewal date if you do not want the subscription to renew.</p>

<h2>6. Managing or cancelling a Google Play subscription</h2>
<p>You can manage eligible ${APP_NAME} subscriptions through Google Play's subscription-management tools.
Within the app, the account/settings area provides a route to Google Play's subscription management.</p>

<h2>7. Refunds and Premium access</h2>
<p>If a refund is approved, Google Play may revoke the associated purchase or entitlement. ${APP_NAME}
receives the relevant purchase-status information and updates Premium access accordingly. A refunded,
revoked, or otherwise invalid purchase may result in loss of Premium access. A refund or Premium expiry
does <strong>not</strong> change your standard 15 GB storage entitlement.</p>

<h2>8. Cancellation, expiration, and your personal files</h2>
<p>Cancelling or losing Premium access does not reduce your storage allocation below 15 GB. If your Premium
entitlement expires, you continue to receive the standard ${APP_NAME} service and 15 GB of storage.
Premium-only content may become inaccessible when the entitlement is no longer active, but your existing
personal files are not automatically deleted merely because Premium access ends.</p>

<h2>9. Duplicate or accidental purchases</h2>
<p>If you believe you were charged more than once for the same intended purchase, or that a purchase was
made accidentally, contact Google Play through its refund/support process, and contact ${APP_NAME} Support
at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> if you need help identifying the relevant
transaction.</p>

<h2>10. Unauthorized transactions</h2>
<p>If you see a Google Play charge that you did not make and that was not made by someone you know, report
the unauthorized charge through Google's official process as soon as possible — Google's guidance is to
report unauthorized Google Play charges within 120 days of the transaction. For additional help, contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Never send your full card number, CVV, UPI PIN,
password, or other sensitive payment credentials to ${APP_NAME} Support.</p>

<h2>11. Failed or pending purchases</h2>
<p>A Google Play purchase may temporarily appear as pending or may fail. If a purchase is pending, do not
repeatedly purchase the same product unless Google Play indicates another purchase is necessary; allow
Google Play time to complete processing; and contact ${APP_NAME} Support if the Play transaction appears
successful but Premium access has not been granted after a reasonable processing period. ${APP_NAME} may
verify the transaction with Google before granting or restoring Premium access.</p>

<h2>12. Purchase verification</h2>
<p>${APP_NAME} verifies Google Play purchase information before granting Premium access. This may include
validation of the product identifier, purchase token, purchase state, acknowledgement state, renewal
status, expiration, cancellation, refund, and revocation. ${APP_NAME} does not grant Premium solely
because a client application claims that a purchase was successful.</p>

<h2>13. Refunds for technical problems</h2>
<p>If you paid for Premium but a technical problem prevents you from receiving the Premium benefit, contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with your ${APP_NAME} account email, the Google Play
order or transaction reference (where available), and a description of the problem. Do not send
payment-card details or authentication secrets. ${APP_NAME} may investigate the issue, restore a valid
entitlement when appropriate, or direct you to Google Play's refund process. Where applicable law gives you
a mandatory refund or remedy, that right is not affected by this section.</p>

<h2>14. Content availability and refunds</h2>
<p>${APP_NAME} is a user-generated content platform. Premium access provides an entitlement to access
designated Premium content available under the service rules — it does not guarantee that every particular
video, channel, creator, or item will remain available for the entire life of a subscription. Content may
become unavailable because of creator removal, copyright complaints, moderation enforcement, legal
requirements, security or safety action, or technical failures. ${APP_NAME} will handle refund requests
arising from unavailable or materially deficient paid content in accordance with applicable Google Play
policies, our policies, and applicable law.</p>

<h2>15. Geographic and legal rights</h2>
<p>Refund rules may vary by country or region, and you may have mandatory consumer or statutory rights
that provide additional cancellation or refund protections — for example, Google publishes separate refund
information for users in the European Economic Area and the United Kingdom. Nothing in this Refund Policy
limits rights that cannot legally be waived.</p>

<h2>16. No refund through UPI or direct bank transfer</h2>
<p>For the Android Google Play version of ${APP_NAME}, Premium purchases use Google Play Billing.
${APP_NAME} does not accept Android Premium payments through UPI screenshot submission, direct bank
transfer, manual payment approval, or any other alternative payment flow intended to replace Google Play
Billing. If you encounter a person claiming to sell ${APP_NAME} Premium outside the official app/store
purchase flow, do not provide payment credentials and report the issue to
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>

<h2>17. Account deletion does not cancel Google Play</h2>
<p>Deleting your ${APP_NAME} account does not necessarily cancel an active Google Play subscription. Before
deleting your ${APP_NAME} account, manage or cancel any active Premium subscription through Google Play.
Google's subscription system controls the billing relationship, while ${APP_NAME} controls the account and
entitlement associated with it. See our
<a href="/functions/v1/account-deletion">account deletion page</a>.</p>

<h2>18. Support for billing problems</h2>
<p>For billing or entitlement issues, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and
include your ${APP_NAME} account email, the Google Play order ID or transaction reference (if available),
the approximate purchase date, the product name/ID if visible, and a description of the problem. Do not
include full card numbers, CVV, UPI PIN, your Google password, your ${APP_NAME} password, or authentication
codes.</p>

<h2>19. Changes to this Refund Policy</h2>
<p>We may update this Refund Policy when our Premium products change, Google Play billing requirements
change, our support/refund process changes, applicable law changes, or operational requirements change.
Material changes may be communicated through the app or another appropriate method. The "last updated" date
identifies the current version.</p>

<h2>20. Contact</h2>
<p>Billing and refund questions: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Related policies:
<a href="/functions/v1/legal-pages/privacy">Privacy Policy</a>,
<a href="/functions/v1/legal-pages/terms">Terms of Service</a>,
<a href="/functions/v1/legal-pages/guidelines">Community Guidelines</a>,
<a href="/functions/v1/legal-pages/copyright">Copyright &amp; IP Policy</a>.</p>
`;
