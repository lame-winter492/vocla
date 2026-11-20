# Vocla for iOS and Android (React Native / Expo)

The native version of Vocla, built with Expo SDK 58 and Expo Router. It uses the same core as the web
app (`../src/lib`: collection, FSRS/SM-2 scheduling, Anki search, card templates, courses), so both
behave identically. Only the UI is native.

## Run it on your iPhone

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the Camera app (it opens **Expo Go**). If something native is missing in Expo Go,
make a development build instead: `npx expo run:ios` (needs Xcode on a Mac) or
`npx eas-cli@latest build --profile development --platform ios` (builds in the cloud).

`npx expo start --web` runs the same app in a browser.

## What's native

- **Tab bar**: the system tab bar (`expo-router/native-tabs`). On iOS 26 it is Liquid Glass and
  minimizes while you scroll. Icons are SF Symbols (iOS) and Material Symbols (Android).
- **Navigation**: native stacks with large titles that collapse into the bar, swipe-back, the native
  search bar in Browse, and sheets for Add / Edit / Deck Options that swipe down to dismiss.
- **Menus**: real UIMenus in the navigation bar (`Stack.Toolbar.Menu`) and long-press context menus
  with a preview on deck rows (`Link.Menu` / `Link.Preview`).
- **Zoom transition**: the Today card and Study Now zoom into the session (`Link.AppleZoom`, iOS 18+).
- **Reviewer**: cards render in a WebView, so Anki templates, CSS and `{{type:}}` / `{{tts}}` work. Tap
  to reveal, swipe right for Good and left for Again (Reanimated + Gesture Handler, on the UI thread),
  with haptics (expo-haptics) and speech (expo-speech).
- **Files**: the collection is a JSON file in the app's documents folder; import goes through the Files
  picker and export through the share sheet.

Two looks (Settings → Appearance), both following light and dark mode:

- **Liquid Glass**: the iOS 26 material everywhere. Cards, lists, buttons and sheets are real
  `GlassView`s that refract the soft coloured light behind them and light up under your finger; the tab
  bar is the system's floating glass bar with its lens. (Older iOS, Android and web get a clear blur.)
- **Frosted**: the thicker blurred materials of earlier iOS, with a floating frosted tab bar.

## Layout

- `src/app/`: screens (Expo Router). `(tabs)/` holds Today, Courses, Browse, Stats and Settings;
  `study/`, `lesson/`, `add`, `note/` and `deck-options/` are presented over the tabs.
- `src/ui/`: shared UI (kit, dialogs, header actions, card view, widgets).
- `src/theme.ts`: both designs' colours and fonts.
- `metro.config.js`: lets Metro bundle `../src/lib` and resolves its `react` import to this app's copy.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform ios --platform android   # compiles the native bundles
```
