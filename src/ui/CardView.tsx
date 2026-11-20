import { useEffect, useRef } from "react";

const BASE_CSS = `
:host { display: block; }
.card { padding: 40px 28px; min-height: 100%; line-height: 1.35; }
.cloze { font-weight: 600; color: #f2b84b; }
hr#answer { width: 40px; height: 2px; border: 0; background: #f2b84b; margin: 24px auto; }
#typeans { font-family: "Geist Mono", ui-monospace, monospace; font-size: 18px; }
input#typeans { width: 90%; max-width: 480px; padding: 10px 12px; border-radius: 10px; border: 1px solid #2e333c; background: #15181d; color: #ece9e4; outline: none; }
input#typeans:focus { border-color: #f2b84b; }
.typeGood { background: #1e3a28; color: #8fe0a8; } .typeBad { background: #45231f; color: #ffb4ab; } .typeMissed { background: #2a2e36; color: #c9c5bf; }
.tts { border: 1px solid #2e333c; border-radius: 10px; background: #15181d; color: #ece9e4; width: 36px; height: 36px; cursor: pointer; font-size: 12px; vertical-align: middle; }
a { color: #f2b84b; }
img { max-width: 100%; }
/* The app is dark: neutralise light backgrounds from note-type styling (Anki's night mode). */
.card.nightMode { background-color: transparent; color: inherit; }
.nightMode .cloze { color: #f2b84b; }
`;


/** Renders card HTML in a shadow root so note-type CSS doesn't leak into the app. */
export function CardView({
  html,
  css,
  cardClass = "card",
  onTypeEnter,
  autoplay,
}: {
  html: string;
  css: string;
  cardClass?: string;
  onTypeEnter?: () => void;
  autoplay?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const enterRef = useRef(onTypeEnter);
  enterRef.current = onTypeEnter;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const night = " nightMode night_mode"; // the app is dark-only
    root.innerHTML = `<style>${BASE_CSS}\n${css}</style><div class="${cardClass}${night}">${html}</div>`;
    // run template scripts like Anki does
    root.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      s.textContent = old.textContent;
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      old.replaceWith(s);
    });
    const input = root.querySelector<HTMLInputElement>("input#typeans");
    if (input) {
      input.focus();
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          enterRef.current?.();
        }
      });
    }
    if (autoplay) {
      speechSynthesis?.cancel();
      root.querySelectorAll<HTMLButtonElement>("button.tts").forEach((b) => b.click());
    }
  }, [html, css, cardClass, autoplay]);

  return <div ref={host} className="cardview" />;
}

/** Read the value typed into a {{type:}} box inside a CardView. */
export function readTyped(container: HTMLElement | null): string | undefined {
  const host = container?.querySelector("div.cardview");
  const input = host?.shadowRoot?.querySelector<HTMLInputElement>("input#typeans");
  return input ? input.value : undefined;
}
