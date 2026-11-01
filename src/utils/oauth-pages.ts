//
// HTML returned to the OAuth popup after Twitter/Discord redirect back.
//
// Everything that reaches these pages comes from the query string, so it is
// attacker-controlled. Values are never spliced into markup or script source:
// they go into a JSON blob (with `<` escaped so a `</script>` can't close the
// tag early) and are shown with textContent, not innerHTML.

export type OAuthProvider = 'twitter' | 'discord';

const PROVIDERS: Record<OAuthProvider, { label: string; accent: string; background: string }> = {
  twitter: {
    label: 'Twitter',
    accent: '#1DA1F2',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  discord: {
    label: 'Discord',
    accent: '#5865F2',
    background: 'linear-gradient(135deg, #5865F2 0%, #7289DA 100%)',
  },
};

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON that is safe to place inside a <script> element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function page(title: string, provider: OAuthProvider, body: string, script: string): string {
  const { accent, background } = PROVIDERS[provider];
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: ${background}; color: white; }
    .container { background: rgba(255,255,255,0.1); border-radius: 15px; padding: 40px; max-width: 500px; margin: 0 auto; }
    .success { color: ${accent}; font-size: 28px; margin-bottom: 20px; }
    .error { color: #FF6B6B; font-size: 24px; margin-bottom: 20px; }
    .message { margin: 20px 0; font-size: 16px; }
    .code { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; font-family: monospace; font-size: 12px; word-break: break-all; white-space: pre-wrap; }
    button { background: ${accent}; color: white; border: none; padding: 12px 30px; border-radius: 25px; font-size: 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">${body}</div>
  <script>${script}</script>
</body>
</html>`;
}

/**
 * Popup page shown after the provider redirects back with ?code=&state=.
 * Hands the values to the page that opened the popup, which then POSTs them
 * to /callback where the state is checked against the server-side record.
 */
export function renderOAuthCallbackPage(opts: {
  provider: OAuthProvider;
  code: string;
  state: string;
}): string {
  const { label } = PROVIDERS[opts.provider];
  const type = `${opts.provider.toUpperCase()}_OAUTH_SUCCESS`;
  const data = jsonForScript({ type, code: opts.code, state: opts.state });

  const body = `
    <div class="success">${label} Authorization Received</div>
    <div class="message" id="message">Completing verification automatically...</div>
    <div class="code" id="fallback" hidden></div>
    <button id="copy" hidden>Copy Authorization Data</button>`;

  const script = `
    var data = ${data};
    if (window.opener) {
      // Only the app's own pages may receive the authorization code.
      window.opener.postMessage(data, window.location.origin);
      setTimeout(function () { window.close(); }, 1000);
    } else {
      document.getElementById('message').textContent =
        'Please copy this authorization code and return to the main window:';
      var fallback = document.getElementById('fallback');
      fallback.textContent = 'Code: ' + data.code + '\\nState: ' + data.state;
      fallback.hidden = false;
      var copy = document.getElementById('copy');
      copy.hidden = false;
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(JSON.stringify({ code: data.code, state: data.state }));
        alert('Authorization data copied to clipboard!');
      });
    }`;

  return page(`${label} Verification - Complete Setup`, opts.provider, body, script);
}

export function renderOAuthErrorPage(opts: { provider: OAuthProvider; message: string }): string {
  const { label } = PROVIDERS[opts.provider];
  const data = jsonForScript({ type: `${opts.provider.toUpperCase()}_OAUTH_ERROR`, error: opts.message });

  const body = `
    <div class="error">${label} Verification Failed</div>
    <div class="message">${escapeHtml(opts.message)}</div>
    <div class="message">Please try again.</div>`;

  const script = `
    if (window.opener) {
      window.opener.postMessage(${data}, window.location.origin);
    }`;

  return page(`${label} Verification Failed`, opts.provider, body, script);
}
