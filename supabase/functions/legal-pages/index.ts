// legal-pages — hosts the Privacy Policy, Terms of Service, Community
// Guidelines, Refund Policy, and Copyright & IP Policy as public pages with
// real, working URLs, which Play Console's listing (App content > Privacy
// policy) requires.
//
// Deploy: npx supabase functions deploy legal-pages --no-verify-jwt
// (must be reachable without a Supabase session, since Play's reviewers and
// the public open these without ever logging in).
//
// URLs once deployed:
//   https://<project-ref>.supabase.co/functions/v1/legal-pages/privacy
//   https://<project-ref>.supabase.co/functions/v1/legal-pages/terms
//   https://<project-ref>.supabase.co/functions/v1/legal-pages/guidelines
//   https://<project-ref>.supabase.co/functions/v1/legal-pages/refund
//   https://<project-ref>.supabase.co/functions/v1/legal-pages/copyright
//
// Content lives in privacy.ts / terms.ts / guidelines.ts / refund.ts /
// copyright.ts as plain HTML strings — edit those files to change wording
// without touching this router. Legal identity (developer name, governing
// law) is set in shell.ts.

import { renderPage } from './shell.ts';
import type { LegalNav } from './shell.ts';
import { privacyPolicyHtml } from './privacy.ts';
import { termsHtml } from './terms.ts';
import { guidelinesHtml } from './guidelines.ts';
import { refundPolicyHtml } from './refund.ts';
import { copyrightPolicyHtml } from './copyright.ts';

const PAGES: Record<string, { title: string; html: string; nav: LegalNav }> = {
  privacy: { title: 'Privacy Policy', html: privacyPolicyHtml, nav: 'privacy' },
  terms: { title: 'Terms of Service', html: termsHtml, nav: 'terms' },
  guidelines: { title: 'Community Guidelines', html: guidelinesHtml, nav: 'guidelines' },
  refund: { title: 'Refund Policy', html: refundPolicyHtml, nav: 'refund' },
  copyright: { title: 'Copyright & IP Policy', html: copyrightPolicyHtml, nav: 'copyright' },
};

Deno.serve((req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  // Strip the function name prefix (`/legal-pages`) if present, so this works
  // whether Supabase routes with or without it in `pathname`.
  const slug = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const page = PAGES[slug] ?? PAGES.privacy;

  return new Response(renderPage(page.title, page.html, page.nav), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
