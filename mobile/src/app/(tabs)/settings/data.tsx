// Import and export, through the Files picker and the share sheet. One "Import File" button works out
// what it was given: a Vocla deck package, a full backup, a course, or a text/CSV list of notes.
import { Stack } from 'expo-router';

import { validateCourse, type Course } from '@core/courses';
import { exportDeckPackage, exportNotesText, importDeckPackage, importRows, parseDelimited, type DeckPackage } from '@core/importexport';
import { store, useCol } from '@core/store';
import type { Collection } from '@core/types';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { pickTextFile, shareFile } from '@/ui/io';
import { Group, Row, Screen } from '@/ui/kit';

async function importFile() {
  const f = await pickTextFile();
  if (!f) return;
  if (/\.json$/i.test(f.name) || f.text.trimStart().startsWith('{') || f.text.trimStart().startsWith('[')) {
    let d: unknown;
    try {
      d = JSON.parse(f.text);
    } catch {
      return toast('That file is not valid JSON.');
    }
    const o = d as Record<string, unknown>;
    if (o && o.format === 'vocla-deck') {
      const r = store.update('Import', (c) => importDeckPackage(c, d as DeckPackage));
      haptic.success();
      return toast(`Imported ${r.notes} notes (${r.cards} cards)${r.updated ? `, updated ${r.updated}` : ''}`);
    }
    if (o && o.cards && o.notes && o.decks && o.notetypes) {
      if (!(await confirm('Replace your collection?', 'This is a full backup. Importing it replaces everything currently in Vocla.', 'Replace', true))) return;
      store.replace(d as Collection);
      haptic.success();
      return toast('Backup restored', { label: 'Undo', onPress: () => store.undo() });
    }
    const list = (Array.isArray(d) ? d : [d]) as Course[];
    if (list.every((c) => !validateCourse(c))) {
      store.update('Import Course', (cc) => list.forEach((c) => (cc.d.courses[c.id] = c)));
      haptic.success();
      return toast(`Imported ${list.length} course${list.length > 1 ? 's' : ''}`);
    }
    return toast('This JSON is not a Vocla deck, backup or course.');
  }
  // text: one note per line, columns go into the fields in order
  const parsed = parseDelimited(f.text);
  const col = store.col;
  const nt = (parsed.notetype && col.notetypes().find((n) => n.name === parsed.notetype)) || col.notetype(col.d.prefs.lastNoteType) || col.notetypes()[0];
  const deck = (parsed.deck && col.deckByName(parsed.deck)) || col.deck(col.d.prefs.currentDeck) || col.deck(1)!;
  const width = Math.max(0, ...parsed.rows.map((r) => r.length));
  const mapping = Array.from({ length: width }, (_, i) => (parsed.tagsColumn && i === parsed.tagsColumn - 1 ? -2 : i < nt.fields.length ? i : -1));
  const r = store.update('Import', (c) => importRows(c, parsed.rows, { ntid: nt.id, did: deck.id, mapping, html: parsed.html, dupes: 'update', extraTags: [] }));
  haptic.success();
  toast(`${r.added} added, ${r.updated} updated, ${r.skipped} skipped → ${deck.name}`, { label: 'Undo', onPress: () => store.undo() });
}

export default function Data() {
  const col = useCol();
  const stamp = new Date().toISOString().slice(0, 10);
  const pickDeck = (title: string, then: (did: number | null, name: string) => void) =>
    showActions(title, [
      { title: 'All decks', onPress: () => then(null, 'all') },
      ...col
        .decks()
        .filter((d) => !d.dyn)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ title: d.name, onPress: () => then(d.id, d.name) })),
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Import & Export', headerLargeTitle: false }} />
      <Group header="Import" footer="Vocla deck packages (.json), full backups, courses, or plain text/CSV with one note per line (Anki's #separator, #deck and #notetype headers work).">
        <Row first title="Import File…" chevron onPress={() => void importFile()} testID="import-file" />
      </Group>
      <Group header="Export" footer="Files open in the share sheet: save them to Files, AirDrop them, or send them to another app.">
        <Row
          first
          title="Deck Package"
          subtitle="Cards with their scheduling, to move decks between devices"
          chevron
          onPress={() => pickDeck('Export which deck?', (did, name) => void shareFile(`${name.replace(/[^\w-]+/g, '_')}.vocla.json`, JSON.stringify(exportDeckPackage(col, did, true))))}
        />
        <Row
          title="Notes as Text"
          subtitle="Tab-separated, one note per line"
          chevron
          onPress={() =>
            pickDeck('Export which deck?', (did, name) => {
              const ids = did ? new Set(col.deckAndChildren(did).map((d) => d.id)) : null;
              const nids = [...new Set(Object.values(col.d.cards).filter((c) => !ids || ids.has(c.did)).map((c) => c.nid))];
              void shareFile(`${name.replace(/[^\w-]+/g, '_')}.txt`, exportNotesText(col, nids, { html: false, tags: true, deckCol: false, ntCol: false }), 'text/plain');
            })
          }
        />
        <Row title="Full Backup" subtitle="Everything: decks, notes, history, courses, settings" chevron onPress={() => void shareFile(`vocla-backup-${stamp}.json`, JSON.stringify(col.d))} />
      </Group>
    </Screen>
  );
}
