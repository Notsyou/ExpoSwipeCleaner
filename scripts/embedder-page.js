/* global ort */
// Runs inside the hidden WebView (see lib/ml/embedder.js). Plain browser JS.
// Inlined after onnxruntime-web by scripts/build-embedder.mjs, which defines window.ort.
//
// Protocol (all messages are JSON strings):
//   RN -> page  { type: 'chunk', kind: 'wasm'|'model', index, total, data }   base64, in order
//               { type: 'init', weights }                                    mlp_weights.json
//               { type: 'embed', id, jpeg }                                  224x224 JPEG, base64
//   page -> RN  { type: 'boot' }  { type: 'ack', kind, index }  { type: 'loaded', ms }
//               { type: 'result', id, vec, probs, ms }   vec = base64 Int8Array (standardized, L2-normalized)
//               { type: 'error', id?, message }
(function () {
  const send = (msg) => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];
  const SIZE = 224;

  const parts = { wasm: [], model: [] };
  let session = null;
  let mlp = null;
  let weightsJson = null;
  let queue = Promise.resolve();

  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const f32 = (b64) => new Float32Array(b64ToBytes(b64).buffer);
  const concat = (arrays) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    return out;
  };

  const loadMlp = (w) => ({
    classes: w.classes, selected: Int32Array.from(w.selected), hidden: w.hidden,
    mean: f32(w.mean), scale: f32(w.scale), W1: f32(w.W1), b1: f32(w.b1), W2: f32(w.W2), b2: f32(w.b2),
  });

  const tryStart = async () => {
    if (session || !weightsJson || !parts.wasm.done || !parts.model.done) return;
    const t0 = performance.now();
    try {
      ort.env.wasm.wasmBinary = concat(parts.wasm).buffer;
      ort.env.wasm.numThreads = 1;   // no SharedArrayBuffer / workers in a WebView
      ort.env.wasm.proxy = false;
      session = await ort.InferenceSession.create(concat(parts.model), {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      });
      mlp = loadMlp(weightsJson);
      parts.wasm = []; parts.model = [];
      send({ type: 'loaded', ms: Math.round(performance.now() - t0) });
    } catch (e) {
      send({ type: 'error', message: 'load: ' + (e && e.message || e) });
    }
  };

  const decode = async (b64) => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let drawn = false;
    if (window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(new Blob([b64ToBytes(b64)], { type: 'image/jpeg' }),
          { colorSpaceConversion: 'none' });
        ctx.drawImage(bmp, 0, 0, SIZE, SIZE);
        bmp.close?.();
        drawn = true;
      } catch {}
    }
    if (!drawn) {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
    }
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const plane = SIZE * SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = (px[i * 4] / 255 - MEAN[0]) / STD[0];
      input[plane + i] = (px[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
      input[2 * plane + i] = (px[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    }
    return input;
  };

  // VarianceThreshold -> StandardScaler -> MLP(ReLU) -> softmax, as in the sklearn pipeline
  const classify = (emb) => {
    const { selected, mean, scale, W1, b1, W2, b2, hidden } = mlp;
    const n = selected.length;
    const z = new Float32Array(n);
    let norm = 0;
    for (let i = 0; i < n; i++) { z[i] = (emb[selected[i]] - mean[i]) / scale[i]; norm += z[i] * z[i]; }
    const h = new Float32Array(hidden);
    for (let j = 0; j < hidden; j++) h[j] = b1[j];
    for (let i = 0; i < n; i++) {
      const zi = z[i]; const row = i * hidden;
      for (let j = 0; j < hidden; j++) h[j] += zi * W1[row + j];
    }
    for (let j = 0; j < hidden; j++) if (h[j] < 0) h[j] = 0;
    const k = b2.length;
    const o = new Float32Array(k);
    for (let c = 0; c < k; c++) o[c] = b2[c];
    for (let j = 0; j < hidden; j++) for (let c = 0; c < k; c++) o[c] += h[j] * W2[j * k + c];
    const max = Math.max(...o);
    let sum = 0;
    for (let c = 0; c < k; c++) { o[c] = Math.exp(o[c] - max); sum += o[c]; }
    const probs = Array.from(o, (v) => v / sum);
    // Compact vector for near-duplicate search: standardized, L2-normalized, int8
    norm = Math.sqrt(norm) || 1;
    const q = new Int8Array(n);
    for (let i = 0; i < n; i++) q[i] = Math.max(-127, Math.min(127, Math.round((z[i] / norm) * 127)));
    let bin = '';
    const bytes = new Uint8Array(q.buffer);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { probs, vec: btoa(bin) };
  };

  const embed = async ({ id, jpeg }) => {
    const t0 = performance.now();
    try {
      if (!session) throw new Error('not loaded');
      const input = await decode(jpeg);
      const out = await session.run({ input: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
      const emb = out.embedding.data;
      const { probs, vec } = classify(emb);
      send({ type: 'result', id, vec, probs, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      send({ type: 'error', id, message: String(e && e.message || e) });
    }
  };

  const onMessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'chunk') {
      const list = parts[msg.kind];
      list.push(b64ToBytes(msg.data));
      if (msg.index === msg.total - 1) list.done = true;
      send({ type: 'ack', kind: msg.kind, index: msg.index });
      tryStart();
    } else if (msg.type === 'init') {
      weightsJson = msg.weights;
      tryStart();
    } else if (msg.type === 'embed') {
      queue = queue.then(() => embed(msg));   // one inference at a time
    }
  };
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);   // Android delivers here
  window.__embedderReceive = (data) => onMessage({ data });   // used by the local test harness
  send({ type: 'boot' });
})();
