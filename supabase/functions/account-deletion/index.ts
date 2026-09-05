// account-deletion — external, no-app-install-required account deletion page.
//
// Google Play requires an external web resource where a user can request
// account deletion without having the app installed (separate from in-app
// deletion, which already exists via `delete-account`). This function serves
// that page and does the actual work by reusing `delete-account` — it does
// NOT re-implement deletion logic.
//
// Flow: visitor enters their email → we send a Supabase magic-link OTP →
// they click the link, which logs them in on this same page → the page calls
// the existing `delete-account` function with the resulting session token.
// No new deletion logic, no password required, no long-lived secrets in the
// page (only the public anon key, same as the mobile app ships).
//
// Deploy and then set this function's URL as the "Delete account" link in
// Play Console (App content > Data safety > Account deletion) and in the
// privacy policy: `https://<project-ref>.supabase.co/functions/v1/account-deletion`.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_NAME = Deno.env.get("APP_NAME") ?? "Cloudlynk";
const DELETE_ACCOUNT_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/delete-account`;

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Delete your ${APP_NAME} account</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 440px; margin: 48px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 20px; }
  p.muted { color: #767676; font-size: 14px; }
  input { width: 100%; box-sizing: border-box; padding: 12px; font-size: 15px; border: 1px solid #ccc; border-radius: 8px; margin: 8px 0; }
  button { width: 100%; padding: 12px; font-size: 15px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; margin-top: 6px; }
  button.primary { background: #E50914; color: #fff; }
  button.danger { background: #b00020; color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  #status { font-size: 14px; margin-top: 14px; white-space: pre-wrap; }
  .hidden { display: none; }
  .warn { background: #fff4e5; border: 1px solid #f0b429; border-radius: 8px; padding: 12px; font-size: 13px; margin: 16px 0; }
</style>
</head>
<body>
  <h1>Delete your ${APP_NAME} account</h1>
  <p class="muted">This permanently deletes your account, uploaded files, channels, and subscription history. This does not require the app to be installed.</p>

  <div id="step-email">
    <input id="email" type="email" placeholder="you@example.com" autocomplete="email" />
    <button class="primary" id="send-link-btn">Send me a login link</button>
  </div>

  <div id="step-sent" class="hidden">
    <p>Check your email for a sign-in link, then come back to this tab (it stays open) — it will confirm automatically.</p>
  </div>

  <div id="step-confirm" class="hidden">
    <p>Signed in as <strong id="confirm-email"></strong>.</p>
    <div class="warn">This cannot be undone. All your data will be permanently deleted.</div>
    <button class="danger" id="delete-btn">Permanently delete my account</button>
  </div>

  <div id="step-done" class="hidden">
    <p>Your account has been deleted.</p>
  </div>

  <pre id="status"></pre>

  <script type="module">
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

    const supabase = createClient('${SUPABASE_URL}', '${SUPABASE_ANON_KEY}');
    const statusEl = document.getElementById('status');
    const show = (id) => { for (const s of ['step-email','step-sent','step-confirm','step-done']) document.getElementById(s).classList.toggle('hidden', s !== id); };
    const setStatus = (msg) => { statusEl.textContent = msg ?? ''; };

    document.getElementById('send-link-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      if (!email) { setStatus('Enter your email first.'); return; }
      setStatus('Sending…');
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      if (error) { setStatus('Error: ' + error.message); return; }
      setStatus('');
      show('step-sent');
    });

    document.getElementById('delete-btn').addEventListener('click', async () => {
      const btn = document.getElementById('delete-btn');
      btn.disabled = true;
      setStatus('Deleting your account…');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus('Your session expired — refresh and sign in again.'); btn.disabled = false; return; }
      try {
        const res = await fetch('${DELETE_ACCOUNT_FUNCTION_URL}', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Deletion failed');
        await supabase.auth.signOut();
        setStatus('');
        show('step-done');
      } catch (err) {
        setStatus('Error: ' + err.message);
        btn.disabled = false;
      }
    });

    // If we arrived here via the magic-link redirect, Supabase's client
    // picks the session up from the URL automatically on load.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        document.getElementById('confirm-email').textContent = session.user.email;
        show('step-confirm');
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        document.getElementById('confirm-email').textContent = session.user.email;
        show('step-confirm');
      }
    });
  </script>
</body>
</html>`;
}

Deno.serve((req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("This page is not configured yet (missing SUPABASE_URL/SUPABASE_ANON_KEY).", { status: 500 });
  }
  return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
