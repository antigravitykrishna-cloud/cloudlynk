import { sabpaisaFormHtml } from '@/features/premium/api/paymentGatewaysApi';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/metaAds', () => ({ metaDeviceSignals: jest.fn() }));

const order = {
  orderId: 'ord_1',
  provider: 'sabpaisa' as const,
  method: 'sabpaisa' as const,
  url: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  encData: 'ABC123',
  clientCode: 'CLOUD',
};

describe('sabpaisaFormHtml', () => {
  it('posts the encrypted payload to the gateway URL and submits itself', () => {
    const html = sabpaisaFormHtml(order as Parameters<typeof sabpaisaFormHtml>[0]);
    expect(html).toContain(`action="${order.url}"`);
    expect(html).toContain('name="encData" value="ABC123"');
    expect(html).toContain('name="clientCode" value="CLOUD"');
    expect(html).toContain("document.getElementById('f').submit()");
  });

  it('escapes values so they cannot break out of the form', () => {
    const html = sabpaisaFormHtml({
      ...order,
      encData: '"><script>alert(1)</script>',
    } as Parameters<typeof sabpaisaFormHtml>[0]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('value="&quot;>&lt;script>alert(1)&lt;/script>"');
  });
});
