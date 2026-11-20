// Navigation-bar buttons and pull-down menus.
// iOS: real bar button items (Stack.Toolbar) — Liquid Glass capsules on iOS 26, native UIMenus with
// SF Symbols, checkmarks and destructive items. Android and web: icon buttons (Lucide) and our sheet.
import { Stack } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import type { LucideIcon } from 'lucide-react-native';
import { Platform, Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { showActions } from './dialogs';
import { T } from './kit';

export interface MenuItem {
  title: string;
  sf?: SFSymbol;
  onPress: () => void;
  destructive?: boolean;
  isOn?: boolean;
}
export interface HeaderItem {
  label: string;
  sf: SFSymbol;
  Icon: LucideIcon;
  onPress?: () => void;
  /** filled accent button (e.g. Done, Add) */
  prominent?: boolean;
  /** show the label instead of the icon */
  text?: boolean;
  menu?: MenuItem[];
  testID?: string;
}

export function HeaderActions({ items, placement = 'right' }: { items: HeaderItem[]; placement?: 'left' | 'right' }) {
  const t = useTheme();
  if (Platform.OS === 'ios') {
    return (
      <Stack.Toolbar placement={placement}>
        {items.map((it) =>
          it.menu ? (
            <Stack.Toolbar.Menu key={it.label} icon={it.sf} accessibilityLabel={it.label}>
              {it.menu.map((m) => (
                <Stack.Toolbar.MenuAction key={m.title} icon={m.sf} isOn={m.isOn} destructive={m.destructive} onPress={m.onPress}>
                  {m.title}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          ) : (
            <Stack.Toolbar.Button
              key={it.label}
              icon={it.text ? undefined : it.sf}
              onPress={it.onPress}
              variant={it.prominent ? 'prominent' : undefined}
              tintColor={it.prominent ? t.c.accent : undefined}
              accessibilityLabel={it.label}
            >
              {it.text ? it.label : undefined}
            </Stack.Toolbar.Button>
          ),
        )}
      </Stack.Toolbar>
    );
  }
  const render = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: Platform.OS === 'web' ? 12 : 0 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          testID={it.testID}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          hitSlop={8}
          onPress={() =>
            it.menu
              ? showActions(
                  it.label,
                  it.menu.map((m) => ({ title: (m.isOn ? '✓ ' : '') + m.title, onPress: m.onPress, destructive: m.destructive })),
                )
              : it.onPress?.()
          }
          style={({ pressed }) => ({
            height: 36,
            minWidth: 36,
            paddingHorizontal: it.text ? 14 : 0,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: it.prominent ? t.c.accent : pressed ? t.c.pill : 'transparent',
          })}
        >
          {it.text ? (
            <T v="body" weight={600} color={it.prominent ? t.c.onAccent : t.c.accent}>
              {it.label}
            </T>
          ) : (
            <it.Icon size={22} color={it.prominent ? t.c.onAccent : t.c.accent} strokeWidth={2} />
          )}
        </Pressable>
      ))}
    </View>
  );
  return <Stack.Screen options={placement === 'right' ? { headerRight: render } : { headerLeft: render }} />;
}
