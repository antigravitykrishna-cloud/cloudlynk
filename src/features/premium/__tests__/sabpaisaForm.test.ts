import type { SabpaisaOrder } from '@/features/premium/api/paymentGatewaysApi';
import { sabpaisaFormHtml } from '@/features/premium/billing/sabpaisaForm';

const order: SabpaisaOrder = {
  orderId: 'ord_1',
  provider: 'sabpaisa',
  method: 'sabpaisa',
  url: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  encData: 'ABC123',
  clientCode: 'CLOUD',
  callbackUrl: 'https://example.com/payments/sabpaisa-callback',
};

describe('sabpaisaFormHtml', () => {
  it('posts the encrypted payload to the gateway URL and submits itself', () => {
    const html = sabpaisaFormHtml(order);
    expect(html).toContain(`action="${order.url}"`);
    expect(html).toContain('name="encData" value="ABC123"');
    expect(html).toContain('name="clientCode" value="CLOUD"');
    expect(html).toContain("document.getElementById('f').submit()");
  });

  it('escapes values so they cannot break out of the form', () => {
    const html = sabpaisaFormHtml({ ...order, encData: '"><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('value="&quot;>&lt;script>alert(1)&lt;/script>"');
  });
});
