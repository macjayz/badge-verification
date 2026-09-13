/**
 * These tests execute the script from the generated page in a sandbox with
 * attacker-style inputs. Passing means the input is treated as data: it is
 * delivered intact, and nothing in it runs.
 */
import vm from 'vm';
import { escapeHtml, renderOAuthCallbackPage, renderOAuthErrorPage } from './oauth-pages';

const ORIGIN = 'https://badges.example';

const ATTACKS = [
  "x';alert('HACKED');//",
  '</script><script>alert("HACKED")</script>',
  '"},alert("HACKED"),{"',
  '<img src=x onerror=alert("HACKED")>',
  ' alert("HACKED") ',
];

function scriptsIn(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function runPage(html: string, { withOpener }: { withOpener: boolean }) {
  const postMessage = jest.fn();
  const alert = jest.fn();
  const elements: Record<string, any> = {};
  const document = {
    getElementById: (id: string) =>
      (elements[id] ??= { textContent: '', hidden: true, addEventListener: jest.fn() }),
  };
  const window = {
    opener: withOpener ? { postMessage } : null,
    location: { origin: ORIGIN },
    close: jest.fn(),
  };
  const context = vm.createContext({ window, document, alert, setTimeout: () => 0, navigator: {} });

  const scripts = scriptsIn(html);
  for (const script of scripts) vm.runInContext(script, context);
  return { postMessage, alert, elements, scriptCount: scripts.length };
}

describe('renderOAuthCallbackPage', () => {
  describe.each(['twitter', 'discord'] as const)('%s', (provider) => {
    it.each(ATTACKS)('does not run code smuggled in as state: %s', (attack) => {
      const html = renderOAuthCallbackPage({ provider, code: 'abc', state: attack });
      const { postMessage, alert, scriptCount } = runPage(html, { withOpener: true });

      expect(scriptCount).toBe(1);
      expect(alert).not.toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith(
        { type: `${provider.toUpperCase()}_OAUTH_SUCCESS`, code: 'abc', state: attack },
        ORIGIN,
      );
    });

    it.each(ATTACKS)('does not run code smuggled in as code: %s', (attack) => {
      const html = renderOAuthCallbackPage({ provider, code: attack, state: 'abc' });
      const { alert, postMessage } = runPage(html, { withOpener: true });
      expect(alert).not.toHaveBeenCalled();
      expect(postMessage.mock.calls[0][0].code).toBe(attack);
    });

    it('only sends the code to our own origin, never "*"', () => {
      const html = renderOAuthCallbackPage({ provider, code: 'abc', state: 'def' });
      const { postMessage } = runPage(html, { withOpener: true });
      expect(postMessage.mock.calls[0][1]).toBe(ORIGIN);
      expect(html).not.toContain("'*'");
    });

    it('shows the values as plain text when there is no opener', () => {
      const attack = ATTACKS[3];
      const html = renderOAuthCallbackPage({ provider, code: 'abc', state: attack });
      const { alert, elements } = runPage(html, { withOpener: false });

      expect(alert).not.toHaveBeenCalled();
      expect(elements.fallback.textContent).toContain(attack);
      expect(elements.fallback.hidden).toBe(false);
      expect(html).not.toContain('innerHTML');
    });
  });
});

describe('renderOAuthErrorPage', () => {
  it.each(ATTACKS)('escapes the message in the page and in the script: %s', (attack) => {
    const html = renderOAuthErrorPage({ provider: 'twitter', message: attack });
    const { alert, postMessage, scriptCount } = runPage(html, { withOpener: true });

    expect(scriptCount).toBe(1);
    expect(alert).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'TWITTER_OAUTH_ERROR', error: attack }, ORIGIN);
    expect(html).toContain(`<div class="message">${escapeHtml(attack)}</div>`);
  });
});

describe('escapeHtml', () => {
  it('escapes every character that can change the meaning of markup', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});
