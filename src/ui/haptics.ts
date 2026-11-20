// Light haptic feedback.
// - Android & other browsers with the Vibration API: navigator.vibrate.
// - iOS Safari has no Vibration API, but since iOS 18 toggling a native `<input type=checkbox switch>`
//   plays the system haptic tick, so we click a hidden one. If Apple changes that, this silently does nothing.
import { store } from "../lib/store";

type Kind = "tap" | "success" | "error";

let iosSwitch: HTMLLabelElement | null = null;
const coarse = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

function tick() {
  if (!iosSwitch) {
    iosSwitch = document.createElement("label");
    iosSwitch.setAttribute("aria-hidden", "true");
    iosSwitch.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    iosSwitch.appendChild(input);
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.click();
}

export function haptic(kind: Kind = "tap"): void {
  try {
    if (!store.col.d.prefs.haptics || !coarse()) return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "error" ? [24, 60, 24] : kind === "success" ? [12, 40, 12] : 10);
      return;
    }
    tick();
    if (kind !== "tap") setTimeout(tick, 90);
  } catch {
    // haptics are a nicety; never let them break an answer
  }
}
