// The HTML document a card is shown in (WebView on iOS/Android, iframe on the web).
// Card templates are Anki HTML + CSS + optional scripts, so they get a real browser engine. The page
// stays loaded for the whole session: new cards and the answer side are swapped in with __vocla.set()
// instead of reloading, so nothing flashes, and the answer fades in below the line.
import type { Theme } from '@/theme';

export interface CardContent {
  html: string;
  css: string;
  cardClass: string;
  /** play {{tts}} buttons automatically */
  autoplay: boolean;
  /** this update reveals the answer of the card already shown */
  reveal: boolean;
}

export type CardMessage =
  | { type: 'tap' }
  | { type: 'enter' }
  | { type: 'typed'; value: string }
  | { type: 'speak'; items: { text: string; lang: string }[] }
  | { type: 'ready' };

const baseCss = (t: Theme) => `
:root { color-scheme: ${t.dark ? 'dark' : 'light'}; --accent: ${t.c.accent}; --fg: ${t.c.fg}; --muted: ${t.c.muted}; --line: ${t.c.line}; --surface: ${t.c.surface}; --bg: ${t.c.bg}; }
html, body { margin: 0; padding: 0; background: transparent; color: var(--fg); -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
body { min-height: 100vh; display: flex; font-family: ${t.design === 'focus' ? '"Geist", ' : ''}-apple-system, system-ui, "SF Pro Text", Roboto, sans-serif; }
#wrap { margin: auto; width: 100%; box-sizing: border-box; padding: 28px 22px; }
.card { line-height: 1.35; background: transparent !important; color: inherit; }
.cloze { font-weight: 600; color: var(--accent); }
hr#answer { width: 40px; height: 2px; border: 0; background: var(--accent); margin: 22px auto; }
#typeans { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 18px; }
input#typeans { width: 90%; max-width: 420px; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: inherit; font-size: 17px; outline: none; box-sizing: border-box; }
input#typeans:focus { border-color: var(--accent); }
.typeGood { background: rgba(52,199,89,.22); } .typeBad { background: rgba(255,59,48,.22); } .typeMissed { background: rgba(142,142,147,.25); }
.tts { border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: inherit; width: 38px; height: 38px; font-size: 12px; vertical-align: middle; }
a { color: var(--accent); }
img { max-width: 100%; height: auto; }
.nightMode .cloze { color: var(--accent); }
/* the answer arrives: everything below the line rises in */
.revealing hr#answer, .revealing hr#answer ~ * { animation: rise .32s cubic-bezier(.2,.9,.3,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .revealing hr#answer, .revealing hr#answer ~ * { animation: none; } }
`;

const bridge = `
(function () {
  function post(m) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.parent !== window) window.parent.postMessage({ vocla: m }, '*');
  }
  // {{tts}} buttons call this
  window.voclaSpeak = function (text, lang) { post({ type: 'speak', items: [{ text: text, lang: lang }] }); };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('button, a, input, textarea, select, [onclick]')) return;
    post({ type: 'tap' });
  });
  function wire(autoplay) {
    var input = document.getElementById('typeans');
    if (input && input.tagName === 'INPUT') {
      input.addEventListener('input', function () { post({ type: 'typed', value: input.value }); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); post({ type: 'enter' }); } });
      setTimeout(function () { input.focus(); }, 60);
    }
    if (autoplay) {
      var items = [];
      document.querySelectorAll('button.tts').forEach(function (b) { items.push({ text: b.dataset.text, lang: b.dataset.lang }); });
      if (items.length) post({ type: 'speak', items: items });
    }
  }
  window.__vocla = {
    set: function (c) {
      document.getElementById('note-css').textContent = c.css;
      var card = document.getElementById('card');
      card.className = c.cardClass;
      card.innerHTML = c.html;
      document.body.classList.toggle('revealing', !!c.reveal);
      // run template scripts, as Anki does
      card.querySelectorAll('script').forEach(function (old) {
        var s = document.createElement('script');
        s.textContent = old.textContent;
        for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
        old.replaceWith(s);
      });
      window.scrollTo(0, 0);
      wire(c.autoplay);
    },
    replay: function () {
      var items = [];
      document.querySelectorAll('button.tts').forEach(function (b) { items.push({ text: b.dataset.text, lang: b.dataset.lang }); });
      if (items.length) post({ type: 'speak', items: items });
    },
  };
  window.__vocla.set(window.__voclaInitial);
  post({ type: 'ready' });
})();
`;

/** The full document; `initial` is shown first, later content arrives through __vocla.set(). */
export function cardDocument(t: Theme, initial: CardContent): string {
  const night = t.dark ? ' nightMode night_mode' : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<style>${baseCss(t)}</style><style id="note-css"></style></head>
<body${night ? ` class="${night.trim()}"` : ''}><div id="wrap"><div id="card"></div></div>
<script>window.__voclaInitial = ${JSON.stringify(initial).replace(/</g, '\\u003c')};</script>
<script>${bridge}</script></body></html>`;
}

/** JS that swaps in new content (for WebView.injectJavaScript). */
export const setScript = (c: CardContent) => `window.__vocla && window.__vocla.set(${JSON.stringify(c).replace(/</g, '\\u003c')}); true;`;
