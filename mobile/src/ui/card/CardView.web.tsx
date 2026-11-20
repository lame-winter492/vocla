// Web: the same card document in an iframe (srcdoc), talking through postMessage.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { cardDocument, type CardContent, type CardMessage } from './cardDoc';

export interface CardViewHandle {
  replay(): void;
}

type VoclaWindow = Window & { __vocla?: { set(c: CardContent): void; replay(): void } };

export const CardView = forwardRef<CardViewHandle, { content: CardContent; onMessage: (m: CardMessage) => void; style?: StyleProp<ViewStyle> }>(
  function CardView({ content, onMessage, style }, ref) {
    const t = useTheme();
    const frame = useRef<HTMLIFrameElement | null>(null);
    const first = useRef(content);
    const doc = useMemo(() => cardDocument(t, first.current), [t.design, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useRef(content);
    const ready = useRef(false);
    const onMsg = useRef(onMessage);
    onMsg.current = onMessage;
    const latest = useRef(content);
    latest.current = content;

    useEffect(() => {
      const h = (e: MessageEvent) => {
        if (e.source !== frame.current?.contentWindow || !e.data?.vocla) return;
        const m = e.data.vocla as CardMessage;
        if (m.type === 'ready') {
          ready.current = true;
          if (shown.current !== latest.current) {
            shown.current = latest.current;
            (frame.current?.contentWindow as VoclaWindow | null)?.__vocla?.set(latest.current);
          }
        }
        onMsg.current(m);
      };
      window.addEventListener('message', h);
      return () => window.removeEventListener('message', h);
    }, []);

    useEffect(() => {
      if (!ready.current || shown.current === content) return;
      shown.current = content;
      (frame.current?.contentWindow as VoclaWindow | null)?.__vocla?.set(content);
    }, [content]);

    useImperativeHandle(ref, () => ({ replay: () => (frame.current?.contentWindow as VoclaWindow | null)?.__vocla?.replay() }), []);

    return (
      <View style={[{ flex: 1 }, style]}>
        <iframe
          ref={frame}
          srcDoc={doc}
          title="Card"
          data-testid="card-frame"
          style={{ border: 0, width: '100%', height: '100%', background: 'transparent', colorScheme: t.dark ? 'dark' : 'light' }}
        />
      </View>
    );
  },
);
