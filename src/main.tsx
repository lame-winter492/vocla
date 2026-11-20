import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { store } from "./lib/store";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "./style.css";
import { initNative, onAppBackground } from "./lib/native";

// TTS helper available to card templates ({{tts en_US:Field}})
(window as any).voclaSpeak = (text: string, lang: string) => {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  const u = new SpeechSynthesisUtterance(text);
  // {{tts auto:Field}} speaks in the language set in Preferences
  u.lang = (lang === "auto" ? store.col.d.prefs.targetLang : lang).replace("_", "-");
  speechSynthesis.speak(u);
};

store.load().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
  void initNative();
  void onAppBackground(() => void store.save());
});
