// Two designs, as in the web app:
// - "glass": a stock iOS app (system colours, SF Pro, grouped lists, Liquid Glass chrome). Follows light/dark.
// - "focus": Vocla's own dark design (warm amber on near-black, Geist).
import { Platform, useColorScheme, type TextStyle } from 'react-native';

import { useCol } from '@core/store';

export type Design = 'glass' | 'focus';

export interface Palette {
  bg: string; // screen background (grouped background in glass)
  surface: string; // cards and list rows
  raised: string; // controls on a surface
  fg: string;
  fg2: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  onAccent: string;
  pill: string; // grey capsule (App Store "Get")
  again: string;
  hard: string;
  good: string;
  easy: string;
  newC: string;
  learnC: string;
  revC: string;
  overlay: string;
}

const GLASS_LIGHT: Palette = {
  bg: '#f2f2f7',
  surface: '#ffffff',
  raised: '#ffffff',
  fg: '#000000',
  fg2: 'rgba(60,60,67,0.85)',
  muted: 'rgba(60,60,67,0.6)',
  faint: 'rgba(60,60,67,0.3)',
  line: 'rgba(60,60,67,0.18)',
  accent: '#007aff',
  onAccent: '#ffffff',
  pill: 'rgba(120,120,128,0.16)',
  again: '#ff3b30',
  hard: '#ff9500',
  good: '#34c759',
  easy: '#007aff',
  newC: '#007aff',
  learnC: '#ff3b30',
  revC: '#34c759',
  overlay: 'rgba(0,0,0,0.25)',
};

const GLASS_DARK: Palette = {
  bg: '#000000',
  surface: '#1c1c1e',
  raised: '#2c2c2e',
  fg: '#ffffff',
  fg2: 'rgba(235,235,245,0.85)',
  muted: 'rgba(235,235,245,0.6)',
  faint: 'rgba(235,235,245,0.3)',
  line: 'rgba(84,84,88,0.6)',
  accent: '#0a84ff',
  onAccent: '#ffffff',
  pill: 'rgba(120,120,128,0.24)',
  again: '#ff453a',
  hard: '#ff9f0a',
  good: '#30d158',
  easy: '#0a84ff',
  newC: '#0a84ff',
  learnC: '#ff453a',
  revC: '#30d158',
  overlay: 'rgba(0,0,0,0.5)',
};

// the web app's Focus tokens (src/style.css)
const FOCUS: Palette = {
  bg: '#0f1115',
  surface: '#15181d',
  raised: '#1b1f25',
  fg: '#ece9e4',
  fg2: '#c9c5bf',
  muted: '#8f949c',
  faint: '#4a505a',
  line: '#23272f',
  accent: '#f2b84b',
  onAccent: '#1a1406',
  pill: '#1f232b',
  again: '#ee6d64',
  hard: '#dfa23c',
  good: '#5cbf7c',
  easy: '#5aa6e2',
  newC: '#8fb0f5',
  learnC: '#ee8a82',
  revC: '#74cf92',
  overlay: 'rgba(0,0,0,0.6)',
};

export interface Theme {
  design: Design;
  dark: boolean;
  c: Palette;
  /** text style for a weight: SF Pro in glass, Geist in focus */
  font: (weight?: 400 | 500 | 600 | 700) => TextStyle;
  mono: TextStyle;
  radius: { sm: number; md: number; lg: number; card: number };
}

const GEIST: Record<number, string> = { 400: 'Geist_400Regular', 500: 'Geist_500Medium', 600: 'Geist_600SemiBold', 700: 'Geist_700Bold' };
const ROUNDED = Platform.select({ ios: 'ui-rounded', default: undefined });

export function currentDesign(pref?: Design): Design {
  return pref ?? 'glass';
}

export function makeTheme(design: Design, dark: boolean): Theme {
  if (design === 'focus')
    return {
      design,
      dark: true,
      c: FOCUS,
      font: (w = 400) => ({ fontFamily: GEIST[w] }),
      mono: { fontFamily: 'GeistMono_400Regular' },
      radius: { sm: 8, md: 10, lg: 12, card: 14 },
    };
  return {
    design,
    dark,
    c: dark ? GLASS_DARK : GLASS_LIGHT,
    font: (w = 400) => ({ fontWeight: String(w) as TextStyle['fontWeight'] }),
    mono: { fontVariant: ['tabular-nums'] },
    radius: { sm: 10, md: 14, lg: 22, card: 26 },
  };
}

/** The current theme; re-renders when the design preference or the system appearance changes. */
export function useTheme(): Theme {
  const col = useCol();
  const scheme = useColorScheme();
  return makeTheme(currentDesign(col.d.prefs.design), scheme === 'dark');
}

/** Font family/weight for navigation-bar titles (they accept nothing else). */
export function headerFont(t: Theme, w: 600 | 700): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const f = t.font(w);
  return f.fontFamily ? { fontFamily: f.fontFamily } : { fontWeight: f.fontWeight };
}

/** Rounded system font for big numbers (SF Pro Rounded on iOS). */
export const roundedFont: TextStyle = ROUNDED ? { fontFamily: ROUNDED } : {};
