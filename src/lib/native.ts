// Bridges to native iOS features when running inside the Capacitor app.
// In a normal browser every function here falls back to the web behaviour.
import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** One-time setup once the app has loaded its data. */
export async function initNative(): Promise<void> {
  if (!isNative()) return;
  document.documentElement.classList.add("native", `native-${Capacitor.getPlatform()}`);
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* plugin missing: keep the default */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* nothing to hide */
  }
}

export type HapticKind = "tap" | "success" | "error";

/** Native haptics via the Taptic Engine. Returns false when not native, so the caller can fall back. */
export async function nativeHaptic(kind: HapticKind): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "tap") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Error });
  } catch {
    /* no haptics on this device */
  }
  return true;
}

/** Save a file the iOS way: write it to the cache, then open the share sheet (Save to Files, AirDrop, …). */
export async function nativeSaveFile(filename: string, data: string, mime: string): Promise<boolean> {
  if (!isNative()) return false;
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  await Share.share({ title: filename, files: [res.uri], dialogTitle: `Save ${filename}` }).catch(() => {
    /* the person closed the sheet */
  });
  void mime;
  return true;
}

/** Save the collection when the app goes to the background (iOS may suspend it without warning). */
export async function onAppBackground(fn: () => void): Promise<void> {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) fn();
  });
}
