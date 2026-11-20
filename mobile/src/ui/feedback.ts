// Haptics and speech.
// Haptics follow Apple's guidance: a light impact for each answer, success/error notifications for
// results, a selection tick for pickers, and nothing for routine scrolling. The Preferences switch
// turns them off.
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { store } from '@core/store';

const on = () => Platform.OS !== 'web' && store.col.d.prefs.haptics !== false;

export const haptic = {
  tap: () => void (on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  firm: () => void (on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  select: () => void (on() && Haptics.selectionAsync()),
  success: () => void (on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => void (on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warn: () => void (on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

/** Speak text; "auto" uses the language set in Preferences (like {{tts auto:Field}} on the web). */
export function speak(text: string, lang = 'auto'): void {
  if (!text.trim()) return;
  const language = (lang === 'auto' ? store.col.d.prefs.targetLang : lang).replace('_', '-');
  void Speech.stop();
  Speech.speak(text, { language });
}
export const stopSpeaking = () => void Speech.stop();

/** Speak several {{tts}} fields one after another (the system queues utterances). */
export function speakAll(items: { text: string; lang: string }[]): void {
  void Speech.stop();
  for (const i of items) {
    if (!i.text?.trim()) continue;
    const language = (i.lang === 'auto' ? store.col.d.prefs.targetLang : i.lang).replace('_', '-');
    Speech.speak(i.text, { language });
  }
}
