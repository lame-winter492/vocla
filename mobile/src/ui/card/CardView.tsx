// iOS / Android: the card in a WebView (WebKit / Chromium), transparent so the app's card surface shows.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ComponentRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '@/theme';
import { cardDocument, setScript, type CardContent, type CardMessage } from './cardDoc';

export interface CardViewHandle {
  replay(): void;
}

export const CardView = forwardRef<CardViewHandle, { content: CardContent; onMessage: (m: CardMessage) => void; style?: StyleProp<ViewStyle> }>(
  function CardView({ content, onMessage, style }, ref) {
    const t = useTheme();
    const web = useRef<ComponentRef<typeof WebView>>(null);
    const ready = useRef(false);
    // the document is built once per theme; content changes are injected
    const first = useRef(content);
    const doc = useMemo(() => cardDocument(t, first.current), [t.design, t.dark]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useRef(content);

    useEffect(() => {
      if (!ready.current || shown.current === content) return;
      shown.current = content;
      web.current?.injectJavaScript(setScript(content));
    }, [content]);

    useImperativeHandle(ref, () => ({ replay: () => web.current?.injectJavaScript('window.__vocla && window.__vocla.replay(); true;') }), []);

    const handle = (e: WebViewMessageEvent) => {
      let m: CardMessage;
      try {
        m = JSON.parse(e.nativeEvent.data) as CardMessage;
      } catch {
        return;
      }
      if (m.type === 'ready') {
        ready.current = true;
        // content may have changed while the page was loading
        if (shown.current !== content) {
          shown.current = content;
          web.current?.injectJavaScript(setScript(content));
        }
      }
      onMessage(m);
    };

    return (
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html: doc }}
        onMessage={handle}
        style={[{ backgroundColor: 'transparent', flex: 1 }, style]}
        containerStyle={{ backgroundColor: 'transparent' }}
        // type-in answers get the keyboard without a second tap
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        textInteractionEnabled={false}
        testID="card-webview"
      />
    );
  },
);
