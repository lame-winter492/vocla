// Add: a sheet over whatever you were doing. Note type and deck are pickers at the top (native menus on
// iOS); the type and deck you used last are remembered, tags stay for the next note, like Anki.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { store, useCol } from '@core/store';
import { stripHtml } from '@core/template';
import type { Note } from '@core/types';
import { useTheme } from '@/theme';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions } from '@/ui/HeaderActions';
import { Group, Row, T } from '@/ui/kit';
import { NoteFields } from '@/ui/NoteFields';

export default function Add() {
  const col = useCol();
  const t = useTheme();
  const params = useLocalSearchParams<{ did?: string }>();
  const prefs = col.d.prefs;
  const [ntid, setNtid] = useState(col.notetype(prefs.lastNoteType) ? prefs.lastNoteType : col.notetypes()[0].id);
  const initialDid = params.did ? Number(params.did) : col.deck(prefs.lastAddDeck) && !col.deck(prefs.lastAddDeck)!.dyn ? prefs.lastAddDeck : 1;
  const [did, setDid] = useState(initialDid);
  const nt = col.notetype(ntid) ?? col.notetypes()[0];
  const [note, setNote] = useState<Note>(() => col.newNote(nt));
  const [key, setKey] = useState(0); // remounts the fields to refocus the first one after adding
  const [added, setAdded] = useState(0);

  // switching type keeps what was typed (and the tags), like Anki
  const changeType = (id: number) => {
    const next = store.col.notetype(id);
    if (!next) return;
    setNtid(id);
    setNote((old) => ({ ...store.col.newNote(next), tags: old.tags, fields: next.fields.map((_, i) => old.fields[i] ?? '') }));
  };

  const dupe = useMemo(() => col.findDupes(note).length > 0, [col, note]);

  const add = async () => {
    if (!stripHtml(note.fields[0] ?? '').trim() && !note.fields[0]?.includes('<img')) {
      haptic.error();
      return toast('The first field is empty.');
    }
    if (nt.kind === 'cloze' && !note.fields.some((f) => /\{\{c\d+::/.test(f))) {
      if (!(await confirm('No cloze deletions', 'This is a cloze note type, but nothing is marked with [...]. Add it anyway?', 'Add'))) return;
    }
    const n = store.update('Add Note', (c) => {
      c.d.prefs.lastNoteType = ntid;
      c.d.prefs.lastAddDeck = did;
      return c.addNote(structuredClone({ ...note, tags: note.tags.filter(Boolean) }), did);
    });
    if (n === 0) return toast('This would make no cards.');
    haptic.success();
    setAdded((x) => x + n);
    setNote({ ...store.col.newNote(nt), tags: note.tags });
    setKey((k) => k + 1);
    toast(`Added ${n} card${n === 1 ? '' : 's'}`);
  };

  const decks = col.decks().filter((d) => !d.dyn).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: added ? `Add · ${added} added` : 'Add' }} />
      <HeaderActions placement="left" items={[{ label: added ? 'Done' : 'Cancel', sf: 'xmark', Icon: X, text: true, onPress: () => router.back() }]} />
      <HeaderActions items={[{ label: 'Add', sf: 'checkmark', Icon: Check, prominent: true, onPress: add, testID: 'add-note' }]} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" testID="add-sheet">
        <Group>
          <Row
            first
            title="Type"
            value={nt.name}
            chevron
            onPress={() => showActions('Note type', col.notetypes().map((x) => ({ title: x.name, onPress: () => changeType(x.id) })))}
          />
          <Row
            title="Deck"
            value={col.deck(did)?.name ?? ''}
            chevron
            onPress={() => showActions('Deck', decks.map((d) => ({ title: d.name, onPress: () => setDid(d.id) })))}
          />
        </Group>
        {nt.name === 'Vocabulary' ? (
          <T v="footnote" color="muted" style={{ marginHorizontal: 6, marginTop: -14, marginBottom: 18 }}>
            Makes two cards: recognise (word → meaning) and recall (meaning → word). An example sentence gives the word context, which makes it stick.
          </T>
        ) : null}
        <NoteFields key={key} note={note} nt={nt} onChange={setNote} dupe={dupe} autoFocus />
        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
