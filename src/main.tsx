import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { store } from "./lib/store";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "./springs.css";
import "./style.css";
import "./glass.css";
import "./patterns.css";
import "./looks.css";
import "./motion.css";
import { initNative, onAppBackground } from "./lib/native";
import { installInteractiveGlass, installTapThrough } from "./ui/motion";

// TTS helper available to card templates ({{tts en_US:Field}})
(window as any).voclaSpeak = (text: string, lang: string) => {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  const u = new SpeechSynthesisUtterance(text);
  // {{tts auto:Field}} speaks in the language set in Preferences
  u.lang = (lang === "auto" ? store.col.d.prefs.targetLang : lang).replace("_", "-");
  speechSynthesis.speak(u);
};

// lets the iOS preview page switch looks from outside the React tree
(window as any).voclaSetLook = (l: "liquid" | "frosted") => store.mutate((c) => (c.d.prefs.look = l));

installInteractiveGlass();
installTapThrough();

store.load().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
  void initNative();
  void onAppBackground(() => void store.save());
});
