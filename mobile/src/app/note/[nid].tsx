// Edit a note (from the reviewer or Browse). Done saves; swiping the sheet away discards.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Check, Ellipsis, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { store, useCol } from '@core/store';
import type { Note } from '@core/types';
import { useTheme } from '@/theme';
import { confirm, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions } from '@/ui/HeaderActions';
import { T } from '@/ui/kit';
import { NoteFields } from '@/ui/NoteFields';

export default function EditNote() {
  const { nid } = useLocalSearchParams<{ nid: string }>();
  const col = useCol();
  const t = useTheme();
  const original = col.d.notes[Number(nid)];
  const [note, setNote] = useState<Note | null>(() => (original ? structuredClone(original) : null));
  if (!note || !original) return <T style={{ padding: 20 }}>This note no longer exists.</T>;
  const nt = col.d.notetypes[note.ntid];

  const save = () => {
    store.update('Edit Note', (c) => c.updateNote({ ...note, tags: note.tags.filter(Boolean) }));
    haptic.success();
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Edit Note' }} />
      <HeaderActions placement="left" items={[{ label: 'Cancel', sf: 'xmark', Icon: X, text: true, onPress: () => router.back() }]} />
      <HeaderActions
        items={[
          {
            label: 'More',
            sf: 'ellipsis.circle',
            Icon: Ellipsis,
            menu: [
              {
                title: 'Delete Note',
                sf: 'trash',
                destructive: true,
                onPress: async () => {
                  if (!(await confirm('Delete this note?', 'All of its cards are deleted too.', 'Delete', true))) return;
                  store.update('Delete Note', (c) => c.removeNotes([original.id]));
                  toast('Note deleted', { label: 'Undo', onPress: () => store.undo() });
                  router.back();
                },
              },
            ],
          },
          { label: 'Done', sf: 'checkmark', Icon: Check, prominent: true, onPress: save, testID: 'save-note' },
        ]}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <T v="footnote" color="muted" style={{ marginHorizontal: 6, marginBottom: 14 }}>
          {nt?.name} · {col.cardsOfNote(original.id).length} card{col.cardsOfNote(original.id).length === 1 ? '' : 's'}
        </T>
        <NoteFields note={note} nt={nt} onChange={setNote} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
