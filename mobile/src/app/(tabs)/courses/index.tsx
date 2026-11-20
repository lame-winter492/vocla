// Courses: App Store-style rows (icon, title, progress, "Open" capsule); import a course from a JSON file.
import { router, Stack } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { allLessons, streak, validateCourse, type Course } from '@core/courses';
import { store, useCol } from '@core/store';
import { useTheme } from '@/theme';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions } from '@/ui/HeaderActions';
import { pickTextFile, shareFile } from '@/ui/io';
import { Button, Monogram, PressScale, Screen, T } from '@/ui/kit';
import { Surface } from '@/ui/material';

export async function importCourseFile() {
  const f = await pickTextFile();
  if (!f) return;
  let data: unknown;
  try {
    data = JSON.parse(f.text);
  } catch {
    return toast('That file is not valid JSON.');
  }
  const list = (Array.isArray(data) ? data : [data]) as Course[];
  for (const c of list) {
    const err = validateCourse(c);
    if (err) return toast(`${c?.title ?? 'Course'}: ${err}`);
  }
  store.update('Import Course', (cc) => list.forEach((c) => (cc.d.courses[c.id] = c)));
  haptic.success();
  toast(`Imported ${list.length} course${list.length > 1 ? 's' : ''}`);
}

export default function Courses() {
  const col = useCol();
  const t = useTheme();
  const p = col.d.courseProgress;
  const courses = Object.values(col.d.courses);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Courses' }} />
      <HeaderActions items={[{ label: 'Import course', sf: 'plus', Icon: Plus, onPress: () => void importCourseFile() }]} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
        {[
          [`${p.xp}`, 'XP'],
          [`${streak(p.days, col.today())}`, 'day streak'],
        ].map(([n, l]) => (
          <Surface key={l} radius={18} style={styles.chip}>
            <T v="headline" color="accent" style={t.mono}>
              {n}
            </T>
            <T v="subhead" color="muted">
              {l}
            </T>
          </Surface>
        ))}
      </View>
      {courses.length === 0 ? <T color="muted">No courses yet. Import one with the + button.</T> : null}
      {courses.map((c, i) => {
        const lessons = allLessons(c);
        const done = lessons.filter((l) => p.lessons[c.id]?.[l.id]).length;
        const frac = lessons.length ? done / lessons.length : 0;
        return (
          <PressScale
            key={c.id}
            scaleTo={0.98}
            onPress={() => router.push(`/courses/${c.id}`)}
            onLongPress={() =>
              showActions(c.title, [
                { title: 'Export', onPress: () => void shareFile(`${c.id}.course.json`, JSON.stringify(c, null, 2)) },
                {
                  title: 'Delete Course',
                  destructive: true,
                  onPress: async () => {
                    if (!(await confirm(`Delete "${c.title}"?`, 'Your progress in it is removed too.', 'Delete', true))) return;
                    store.update('Delete Course', (cc) => {
                      delete cc.d.courses[c.id];
                      delete cc.d.courseProgress.lessons[c.id];
                    });
                  },
                },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel={`${c.title}, ${done} of ${lessons.length} lessons`}
            testID={`course-${c.id}`}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.c.line }]}
          >
            <Monogram name={c.title} text={c.targetLang.slice(0, 2)} size={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="headline" numberOfLines={1}>
                {c.title}
              </T>
              {c.description ? (
                <T v="footnote" color="muted" numberOfLines={2}>
                  {c.description}
                </T>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.c.pill, overflow: 'hidden' }}>
                  <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: t.c.good, borderRadius: 2 }} />
                </View>
                <T v="caption" color="muted" style={t.mono}>
                  {done}/{lessons.length}
                </T>
              </View>
            </View>
            <View pointerEvents="none">
              <Button title="Open" kind="tinted" size="sm" />
            </View>
          </PressScale>
        );
      })}
      <T v="footnote" color="muted" style={{ marginTop: 24, marginHorizontal: 4 }}>
        Courses are JSON files (format: docs/course-format.md). Long-press a course to export or delete it.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
});
