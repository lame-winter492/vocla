// Two looks, both in iOS's own visual language and both following light/dark mode:
// - "liquid": Liquid Glass (iOS 26). Controls and cards are clear glass that bends and lights up the
//   content behind it; the tab bar is the system's floating glass bar with its lens.
// - "frosted": the frosted materials of iOS 18 and earlier: soft blur, no refraction.
import { Platform, useColorScheme, type TextStyle } from 'react-native';

import { useCol } from '@core/store';

export type Look = 'liquid' | 'frosted';

export interface Palette {
  bg: string; // behind everything (the ambient backdrop is drawn on top of it)
  surface: string; // solid fill where a material isn't possible
  raised: string;
  fill: string; // text fields and quiet controls on top of a material
  fg: string;
  fg2: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  onAccent: string;
  pill: string;
  again: string;
  hard: string;
  good: string;
  easy: string;
  newC: string;
  learnC: string;
  revC: string;
  overlay: string;
  /** colours of the soft light behind the glass */
  glow: [string, string, string];
}

const LIGHT: Palette = {
  bg: '#eef0f6',
  surface: '#ffffff',
  raised: '#ffffff',
  fill: 'rgba(118,118,128,0.12)',
  fg: '#000000',
  fg2: 'rgba(60,60,67,0.85)',
  muted: 'rgba(60,60,67,0.62)',
  faint: 'rgba(60,60,67,0.32)',
  line: 'rgba(60,60,67,0.16)',
  accent: '#007aff',
  onAccent: '#ffffff',
  pill: 'rgba(120,120,128,0.16)',
  again: '#ff3b30',
  hard: '#ff9500',
  good: '#34c759',
  easy: '#007aff',
  newC: '#007aff',
  learnC: '#ff3b30',
  revC: '#28a745',
  overlay: 'rgba(0,0,0,0.22)',
  glow: ['#7ab8ff', '#c9a6ff', '#8ee6d8'],
};

const DARK: Palette = {
  bg: '#000000',
  surface: '#1c1c1e',
  raised: '#2c2c2e',
  fill: 'rgba(118,118,128,0.24)',
  fg: '#ffffff',
  fg2: 'rgba(235,235,245,0.85)',
  muted: 'rgba(235,235,245,0.6)',
  faint: 'rgba(235,235,245,0.3)',
  line: 'rgba(84,84,88,0.55)',
  accent: '#0a84ff',
  onAccent: '#ffffff',
  pill: 'rgba(120,120,128,0.26)',
  again: '#ff453a',
  hard: '#ff9f0a',
  good: '#30d158',
  easy: '#0a84ff',
  newC: '#409cff',
  learnC: '#ff6961',
  revC: '#30d158',
  overlay: 'rgba(0,0,0,0.5)',
  glow: ['#0a3d91', '#4b1f7a', '#0b5c57'],
};

export interface Theme {
  look: Look;
  dark: boolean;
  c: Palette;
  /** SF Pro at a weight */
  font: (weight?: 400 | 500 | 600 | 700) => TextStyle;
  mono: TextStyle;
}

export function currentLook(pref?: Look): Look {
  return pref ?? 'liquid';
}

export function makeTheme(look: Look, dark: boolean): Theme {
  return {
    look,
    dark,
    c: dark ? DARK : LIGHT,
    font: (w = 400) => ({ fontWeight: String(w) as TextStyle['fontWeight'] }),
    mono: { fontVariant: ['tabular-nums'] },
  };
}

/** The current theme; re-renders when the look preference or the system appearance changes. */
export function useTheme(): Theme {
  const col = useCol();
  const scheme = useColorScheme();
  return makeTheme(currentLook(col.d.prefs.look), scheme === 'dark');
}

/** Font weight for navigation-bar titles (they accept nothing else). */
export function headerFont(t: Theme, w: 600 | 700): Pick<TextStyle, 'fontWeight'> {
  return { fontWeight: t.font(w).fontWeight };
}

/** SF Pro Rounded, for big numbers (iOS; other platforms use their system font). */
export const roundedFont: TextStyle = Platform.select({ ios: { fontFamily: 'ui-rounded' }, web: { fontFamily: 'ui-rounded, system-ui' }, default: {} });
