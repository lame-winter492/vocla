// Saving a file from the web app: the iOS share sheet inside the Capacitor app, a download in a browser.
import { nativeSaveFile } from "../lib/native";

export async function download(filename: string, data: string, type = "application/json"): Promise<void> {
  // in the iOS app, files go through the share sheet (Save to Files, AirDrop, …)
  if (await nativeSaveFile(filename, data, type)) return;
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
