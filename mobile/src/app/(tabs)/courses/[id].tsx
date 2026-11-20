// A course's path: units of lessons, each done / open / locked, unlocked in order.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Circle, Lock } from 'lucide-react-native';
import { View } from 'react-native';

import { allLessons, isUnlocked } from '@core/courses';
import { store, useCol } from '@core/store';
import { stripHtml } from '@core/template';
import { useTheme } from '@/theme';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { Button, Group, Row, Screen, T } from '@/ui/kit';

export default function CourseView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const col = useCol();
  const t = useTheme();
  const course = col.d.courses[id];
  if (!course) return <Screen><T>Course not found.</T></Screen>;
  const prog = col.d.courseProgress;

  return (
    <Screen>
      <Stack.Screen options={{ title: course.title }} />
      {course.units.map((u, ui) => (
        <Group key={u.id} header={`Unit ${ui + 1} · ${u.title}`} footer={u.description}>
          {u.lessons.map((l, li) => {
            const res = prog.lessons[course.id]?.[l.id];
            const open = isUnlocked(course, prog, l.id);
            const Icon = res ? CircleCheck : open ? Circle : Lock;
            return (
              <Row
                key={l.id}
                first={li === 0}
                title={l.title}
                subtitle={res ? `Best ${Math.round(res.best * 100)}% · ${res.times}×` : open ? (l.tips ? 'Tips available' : undefined) : 'Finish the previous lesson to unlock'}
                left={<Icon size={22} color={res ? t.c.good : open ? t.c.accent : t.c.faint} strokeWidth={2} />}
                chevron={open}
                testID={`lesson-${l.id}`}
                onPress={
                  open
                    ? () =>
                        l.tips
                          ? showActions(l.title, [
                              { title: res ? 'Practice' : 'Start Lesson', onPress: () => router.push(`/lesson/${course.id}/${l.id}`) },
                              {
                                title: 'Read Tips',
                                onPress: async () => {
                                  if (await confirm(l.title, stripHtml(l.tips!), res ? 'Practice' : 'Start Lesson')) router.push(`/lesson/${course.id}/${l.id}`);
                                },
                              },
                            ])
                          : router.push(`/lesson/${course.id}/${l.id}`)
                    : () => haptic.warn()
                }
              />
            );
          })}
        </Group>
      ))}
      <View style={{ marginTop: 4 }}>
        <Button
          title="Add all course words to a deck"
          kind="tinted"
          onPress={() => {
            const vocab = allLessons(course).flatMap((l) => l.vocab ?? []);
            const n = store.update('Add Course Words', (c) => c.addVocabToDeck(course.title, vocab, `course::${course.id}`));
            haptic.success();
            toast(n ? `Added ${n} words to "Courses::${course.title}"` : 'All words are already in your deck');
          }}
        />
      </View>
    </Screen>
  );
}
