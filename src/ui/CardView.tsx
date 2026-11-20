import { useEffect, useRef } from "react";

const BASE_CSS = `
:host { display: block; }
.card { padding: 28px 24px; min-height: 100%; }
.cloze { font-weight: bold; color: blue; }
#typeans { font-family: monospace; font-size: inherit; }
input#typeans { width: 90%; max-width: 500px; padding: 4px; }
.typeGood { background: #afa; } .typeBad { background: #faa; } .typeMissed { background: #ccc; }
.tts { border: 1px solid #aaa; border-radius: 50%; background: none; width: 28px; height: 28px; cursor: pointer; font-size: 12px; }
img { max-width: 100%; }
.card.nightMode { background-color: #191c21; color: #e5e7ea; }
.nightMode .cloze { color: #7fb2ff; }
`;

/** Matches the app theme: explicit data-theme wins, otherwise the OS setting (like Anki's night mode). */
function isDark(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

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
    const night = isDark() ? " nightMode night_mode" : "";
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
