// The fields of a note as an iOS form: one grouped section per field, tags at the end.
// Cloze note types get a [...] button that wraps the selection in the next {{cN::…}}.
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { clozeNumbers } from '@core/template';
import type { Note, NoteType } from '@core/types';
import { useTheme } from '@/theme';
import { haptic } from './feedback';
import { T } from './kit';

export function NoteFields({ note, nt, onChange, dupe, autoFocus }: { note: Note; nt: NoteType; onChange: (n: Note) => void; dupe?: boolean; autoFocus?: boolean }) {
  const t = useTheme();
  const sel = useRef<Record<number, { start: number; end: number }>>({});
  const [focused, setFocused] = useState<number | null>(null);

  const setField = (i: number, v: string) => onChange({ ...note, fields: note.fields.map((f, j) => (j === i ? v : f)) });
  const cloze = (i: number) => {
    const nums = note.fields.flatMap((f) => clozeNumbers(f));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const v = note.fields[i] ?? '';
    const s = sel.current[i] ?? { start: v.length, end: v.length };
    setField(i, `${v.slice(0, s.start)}{{c${n}::${v.slice(s.start, s.end)}}}${v.slice(s.end)}`);
    haptic.select();
  };

  const box = {
    backgroundColor: t.c.surface,
    borderRadius: t.design === 'glass' ? 14 : t.radius.md,
    borderWidth: t.design === 'glass' ? 0 : StyleSheet.hairlineWidth,
    color: t.c.fg,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    ...t.font(400),
  };

  return (
    <View style={{ gap: 18 }}>
      {nt.fields.map((f, i) => (
        <View key={f.name} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 6 }}>
            <T v="footnote" color="muted" style={{ flex: 1 }}>
              {f.name}
            </T>
            {nt.kind === 'cloze' ? (
              <Pressable onPress={() => cloze(i)} accessibilityRole="button" accessibilityLabel={`Cloze in ${f.name}`} hitSlop={8}>
                <T v="footnote" weight={600} color="accent">
                  [...]
                </T>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            value={note.fields[i] ?? ''}
            onChangeText={(v) => setField(i, v)}
            onSelectionChange={(e) => (sel.current[i] = e.nativeEvent.selection)}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            multiline
            autoFocus={autoFocus && i === 0}
            autoCapitalize="none"
            accessibilityLabel={f.name}
            testID={`field-${i}`}
            style={[box, { minHeight: 48, borderColor: focused === i ? t.c.accent : t.c.line, outlineWidth: 0 }, focused === i && t.design === 'glass' ? { borderWidth: 2, borderColor: t.c.accent } : null]}
          />
          {i === 0 && dupe ? (
            <T v="footnote" color="again" style={{ marginHorizontal: 6 }}>
              A note with this first field already exists.
            </T>
          ) : null}
        </View>
      ))}
      <View style={{ gap: 6 }}>
        <T v="footnote" color="muted" style={{ marginHorizontal: 6 }}>
          Tags
        </T>
        <TextInput
          value={note.tags.join(' ')}
          onChangeText={(v) => onChange({ ...note, tags: v.split(/\s+/).filter((x, i, a) => x || i === a.length - 1) })}
          placeholder="space separated"
          placeholderTextColor={t.c.faint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Tags"
          testID="field-tags"
          style={[box, { minHeight: 46, borderColor: t.c.line, outlineWidth: 0 }]}
        />
      </View>
    </View>
  );
}
