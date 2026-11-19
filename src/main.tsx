import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { store } from "./lib/store";
import "./style.css";

// TTS helper available to card templates ({{tts en_US:Field}})
(window as any).voclaSpeak = (text: string, lang: string) => {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang.replace("_", "-");
  speechSynthesis.speak(u);
};

store.load().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
