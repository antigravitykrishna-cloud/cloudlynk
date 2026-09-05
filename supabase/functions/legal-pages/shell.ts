// Shared page chrome for all legal pages. Kept separate from content so the
// three documents (privacy.ts, terms.ts, guidelines.ts) stay pure text/HTML
// that a non-engineer can edit without touching layout code.

export const APP_NAME = 'Cloudlynk';
export const PACKAGE_NAME = 'com.cloudlynk.app';
export const SUPPORT_EMAIL = 'support@cloudlynk.app';
// The legal entity that operates Cloudlynk, shown wherever the policies say
// "operated by". Confirmed by the owner.
export const DEVELOPER_NAME = 'Sahil Chandpara';
export const LAST_UPDATED = '25 August 2026';

export type LegalNav = 'privacy' | 'terms' | 'guidelines' | 'refund' | 'copyright';

export function renderPage(title: string, bodyHtml: string, activeNav: LegalNav): string {
  const navLink = (href: string, label: string, key: string) =>
    `<a href="${href}" class="${key === activeNav ? 'active' : ''}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ${APP_NAME}</title>
<style>
  :root { color-scheme: light dark; --accent: #E50914; --text: #1a1a1a; --muted: #666; --bg: #fff; --border: #e5e5e5; }
  @media (prefers-color-scheme: dark) { :root { --text: #f2f2f2; --muted: #a0a0a0; --bg: #0a0a0a; --border: #262626; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.65; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 24px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: -0.3px; }
  .brand span { color: var(--accent); }
  nav { display: flex; flex-wrap: wrap; gap: 12px 18px; font-size: 14px; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
  nav a { color: var(--muted); text-decoration: none; font-weight: 600; }
  nav a.active, nav a:hover { color: var(--accent); }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.5px; }
  .updated { color: var(--muted); font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.2px; }
  h3 { font-size: 15px; margin: 20px 0 6px; }
  p, li { font-size: 15px; color: var(--text); }
  ul, ol { padding-left: 22px; }
  li { margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  .callout { background: rgba(229,9,20,0.07); border: 1px solid rgba(229,9,20,0.25); border-radius: 10px; padding: 14px 16px; margin: 20px 0; font-size: 14px; }
  .placeholder { background: #fff4e5; border: 1px solid #f0b429; color: #8a5a00; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
  a { color: var(--accent); }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">Cloud<span>lynk</span></div>
    </header>
    <nav>
      ${navLink('/functions/v1/legal-pages/privacy', 'Privacy Policy', 'privacy')}
      ${navLink('/functions/v1/legal-pages/terms', 'Terms of Service', 'terms')}
      ${navLink('/functions/v1/legal-pages/guidelines', 'Community Guidelines', 'guidelines')}
      ${navLink('/functions/v1/legal-pages/refund', 'Refund Policy', 'refund')}
      ${navLink('/functions/v1/legal-pages/copyright', 'Copyright & IP', 'copyright')}
    </nav>
    ${bodyHtml}
    <footer>
      ${APP_NAME} (${PACKAGE_NAME}) — last updated ${LAST_UPDATED}. Questions? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </footer>
  </div>
</body>
</html>`;
}
