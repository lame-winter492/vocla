import { useEffect, useRef } from "react";

const BASE_CSS = `
:host { display: block; }
.card { padding: 20px; min-height: 100%; }
.cloze { font-weight: bold; color: blue; }
#typeans { font-family: monospace; font-size: inherit; }
input#typeans { width: 90%; max-width: 500px; padding: 4px; }
.typeGood { background: #afa; } .typeBad { background: #faa; } .typeMissed { background: #ccc; }
.tts { border: 1px solid #aaa; border-radius: 50%; background: none; width: 28px; height: 28px; cursor: pointer; font-size: 12px; }
img { max-width: 100%; }
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
    root.innerHTML = `<style>${BASE_CSS}\n${css}</style><div class="${cardClass}">${html}</div>`;
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
