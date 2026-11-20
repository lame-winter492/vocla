// Runs before the app renders (imported first by the root layout).
// Storage: on iOS/Android the collection lives in a JSON file in the app's documents folder.
// On the web the shared store keeps using IndexedDB.
import './polyfill';

import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { setStorage } from '@core/store';
import type { Collection } from '@core/types';

if (Platform.OS !== 'web') {
  const file = () => new File(Paths.document, 'collection.json');
  setStorage({
    async get() {
      const f = file();
      if (!f.exists) return undefined;
      return JSON.parse(await f.text()) as Collection;
    },
    async set(data) {
      // write a temporary file and move it over the old one, so a crash mid-write can't corrupt it
      const tmp = new File(Paths.document, 'collection.tmp.json');
      if (!tmp.exists) tmp.create();
      await tmp.write(JSON.stringify(data));
      await tmp.move(file(), { overwrite: true });
    },
  });
}
