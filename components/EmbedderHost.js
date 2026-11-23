/**
 * components/EmbedderHost.js
 * Invisible WebView that hosts the on-device ML model (see lib/ml/embedder.js).
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import EMBEDDER_HTML from '../lib/ml/embedderHtml';
import { attachEmbedder, detachEmbedder, handleEmbedderMessage } from '../lib/ml/embedder';

export default function EmbedderHost() {
  const ref = useRef(null);

  useEffect(() => () => detachEmbedder(), []);

  const onMessage = (e) => {
    const data = e.nativeEvent.data;
    if (data && data.startsWith('{"type":"boot"')) {
      attachEmbedder((msg) => ref.current?.postMessage(JSON.stringify(msg)));
    }
    handleEmbedderMessage(data);
  };

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html: EMBEDDER_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        // A crashed/killed web process (memory pressure) gets a fresh page and reload
        onContentProcessDidTerminate={() => { detachEmbedder(); ref.current?.reload(); }}
        onRenderProcessGone={() => { detachEmbedder(); ref.current?.reload(); }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  web: { width: 1, height: 1, backgroundColor: 'transparent' },
});
