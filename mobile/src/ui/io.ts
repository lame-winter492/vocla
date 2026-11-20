// Getting files in and out: the share sheet on iOS/Android, a download on the web.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function shareFile(filename: string, data: string, mimeType = 'application/json'): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  await f.write(data);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: filename, UTI: mimeType === 'application/json' ? 'public.json' : 'public.plain-text' });
}

/** Let the person pick a file and return its name and text, or null if they cancel. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt,.csv,.tsv';
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { name: f.name, text: await f.text() } : null);
      };
      input.click();
    });
  }
  const r = await File.pickFileAsync();
  if (r.canceled) return null;
  return { name: r.result.name, text: await r.result.text() };
}
