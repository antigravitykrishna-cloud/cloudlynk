import { Colors } from '@/theme';
import type { SabpaisaOrder } from '@/features/premium/api/paymentGatewaysApi';

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The page that starts a Sabpaisa checkout: a form that posts itself, as Sabpaisa's docs ask. */
export function sabpaisaFormHtml(order: SabpaisaOrder): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:${Colors.bg};color:${Colors.textSecondary};font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Opening Sabpaisa…</p>
<form id="f" method="post" action="${escapeAttribute(order.url)}">
<input type="hidden" name="encData" value="${escapeAttribute(order.encData)}">
<input type="hidden" name="clientCode" value="${escapeAttribute(order.clientCode)}">
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`;
}
