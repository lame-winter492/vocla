// Action sheets, text prompts, confirmations and banners.
// iOS uses the system UI (ActionSheetIOS, Alert.prompt, Alert). Android and the web get a bottom sheet
// drawn here, because Alert.prompt is iOS-only and the web has no Alert at all.
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, SlideInDown, SlideOutDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { haptic } from './feedback';
import { Button, T } from './kit';

export interface SheetAction {
  title: string;
  onPress: () => void;
  destructive?: boolean;
}

type Pending =
  | { kind: 'actions'; title?: string; message?: string; actions: SheetAction[] }
  | { kind: 'prompt'; title: string; initial: string; placeholder?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message?: string; ok: string; destructive: boolean; resolve: (v: boolean) => void };

let pending: Pending | null = null;
let banner: { id: number; text: string; action?: { label: string; onPress: () => void } } | null = null;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const ios = Platform.OS === 'ios';

export function showActions(title: string | undefined, actions: SheetAction[], message?: string): void {
  if (ios) {
    const destructive = actions.map((a, i) => (a.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...actions.map((a) => a.title), 'Cancel'], cancelButtonIndex: actions.length, destructiveButtonIndex: destructive },
      (i) => i < actions.length && actions[i].onPress(),
    );
    return;
  }
  pending = { kind: 'actions', title, message, actions };
  emit();
}

export function askText(title: string, initial = '', placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (ios) {
      Alert.prompt(title, undefined, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'OK', isPreferred: true, onPress: (v?: string) => resolve(v ?? '') },
      ], 'plain-text', initial);
      return;
    }
    pending = { kind: 'prompt', title, initial, placeholder, resolve };
    emit();
  });
}

export function confirm(title: string, message?: string, ok = 'OK', destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    if (ios) {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ]);
      return;
    }
    pending = { kind: 'confirm', title, message, ok, destructive, resolve };
    emit();
  });
}

let seq = 0;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
/** A short message that drops in from the top (like a Dynamic Island notification), optionally with Undo. */
export function toast(text: string, action?: { label: string; onPress: () => void }): void {
  banner = { id: ++seq, text, action };
  emit();
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    banner = null;
    emit();
  }, action ? 4000 : 2400);
}

const close = () => {
  pending = null;
  emit();
};

/** Mounted once at the root: draws the non-iOS sheets and the banner. */
export function DialogHost() {
  useSyncExternalStore(subscribe, () => version);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const p = pending;
  const b = banner;
  return (
    <>
      {b ? (
        <Animated.View
          key={b.id}
          entering={FadeInUp.springify().damping(16)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="box-none"
          style={[styles.bannerWrap, { top: insets.top + 6 }]}
        >
          <View
            accessibilityRole="alert"
            style={[
              styles.banner,
              { backgroundColor: t.design === 'glass' ? (t.dark ? '#2c2c2e' : '#ffffff') : '#ece9e4', shadowColor: '#000' },
            ]}
          >
            <T v="subhead" weight={600} color={t.design === 'glass' ? t.c.fg : '#15181d'} style={{ flexShrink: 1 }}>
              {b.text}
            </T>
            {b.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  b.action!.onPress();
                  banner = null;
                  emit();
                }}
                hitSlop={10}
              >
                <T v="subhead" weight={700} color={t.design === 'glass' ? t.c.accent : '#8a5a00'}>
                  {b.action.label}
                </T>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
      <Modal visible={!!p} transparent animationType="none" onRequestClose={() => cancel(p)} statusBarTranslucent>
        {p ? (
          <View style={StyleSheet.absoluteFill}>
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => cancel(p)} accessibilityLabel="Close" />
            </Animated.View>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
              <Animated.View
                entering={SlideInDown.springify().damping(18).stiffness(180)}
                exiting={SlideOutDown.duration(180)}
                style={[styles.sheet, { backgroundColor: t.c.surface, paddingBottom: insets.bottom + 12, borderColor: t.c.line }]}
              >
                <View style={[styles.grabber, { backgroundColor: t.c.faint }]} />
                <SheetBody p={p} />
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function cancel(p: Pending | null) {
  if (p?.kind === 'prompt') p.resolve(null);
  if (p?.kind === 'confirm') p.resolve(false);
  close();
}

function SheetBody({ p }: { p: Pending }) {
  const t = useTheme();
  const [text, setText] = useState(p.kind === 'prompt' ? p.initial : '');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (p.kind === 'prompt') setTimeout(() => input.current?.focus(), 250);
  }, [p]);
  if (p.kind === 'actions')
    return (
      <View style={{ gap: 8 }}>
        {p.title ? (
          <T v="footnote" color="muted" weight={600} style={{ textAlign: 'center', marginBottom: 4 }}>
            {p.title}
          </T>
        ) : null}
        {p.actions.map((a) => (
          <Button
            key={a.title}
            title={a.title}
            kind={a.destructive ? 'destructive' : 'plain'}
            style={a.destructive ? { backgroundColor: t.c.pill } : undefined}
            onPress={() => {
              close();
              haptic.select();
              a.onPress();
            }}
          />
        ))}
        <Button title="Cancel" kind="ghost" onPress={close} />
      </View>
    );
  if (p.kind === 'prompt') {
    const ok = () => {
      p.resolve(text);
      close();
    };
    return (
      <View style={{ gap: 14 }}>
        <T v="headline">{p.title}</T>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder={p.placeholder}
          placeholderTextColor={t.c.faint}
          onSubmitEditing={ok}
          returnKeyType="done"
          accessibilityLabel={p.title}
          testID="prompt-input"
          style={[{ minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: t.c.bg, color: t.c.fg, fontSize: 17 }, t.font(400)]}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Cancel" style={{ flex: 1 }} onPress={() => cancel(p)} />
          <Button title="OK" kind="primary" style={{ flex: 1 }} onPress={ok} testID="prompt-ok" />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <T v="headline">{p.title}</T>
      {p.message ? <T color="muted">{p.message}</T> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" style={{ flex: 1 }} onPress={() => cancel(p)} />
        <Button
          title={p.ok}
          kind={p.destructive ? 'destructive' : 'primary'}
          style={[{ flex: 1 }, p.destructive ? { backgroundColor: t.c.pill } : null]}
          onPress={() => {
            p.resolve(true);
            close();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 26,
    maxWidth: '92%',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sheet: {
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 30,
    padding: 18,
    paddingTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 12, opacity: 0.6 },
});
