import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// ─── On-device embedder bridge ───────────────────────────────────────────────
//
// Expo Go can't load custom native ML libraries, so the model runs in a hidden
// WebView (components/EmbedderHost.js) with onnxruntime-web (WebAssembly):
//   MobileNetV3-Small, ImageNet weights, conv weights int8 (weight-only), 1.05 MB
//   -> 576-d embedding -> the notebook's MLP (camera_photo / downloaded / screenshot)
// The WebView can't read app files, so the runtime (.wasm) and model are sent in
// as base64 chunks once per launch. Preprocessing matches the training pipeline:
// squash to 224x224, JPEG q95, ImageNet mean/std.
const CHUNK = 512 * 1024;           // base64 chars per message (multiple of 4)
const TIMEOUT_MS = 20000;

const WASM = require('../../assets/ml/ort-wasm-simd-threaded.wasm');
const MODEL = require('../../assets/ml/mobilenet_v3_small_576_int8.onnx');
const WEIGHTS = require('../../assets/ml/mlp_weights.json');

export const CLASSES = WEIGHTS.classes;
export const DUPLICATE_THRESHOLD = WEIGHTS.duplicateThreshold;   // cosine, calibrated in 05_export_mobile_model.py

let post = null;                 // set by EmbedderHost
let state = 'idle';              // idle | loading | ready | failed
let failure = null;
let loadMs = null;
let avgMs = null;
const pending = new Map();       // id -> { resolve, reject, timer }
const acks = new Map();          // `${kind}:${index}` -> resolve
const listeners = new Set();
let nextId = 1;
let started = false;

const setState = (s, err) => {
  state = s;
  if (err) failure = String(err);
  listeners.forEach((fn) => fn(getEmbedderStatus()));
};

export const getEmbedderStatus = () => ({ state, failure, loadMs, avgMs });
export const onEmbedderStatus = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const isEmbedderReady = () => state === 'ready';

const readBase64 = async (moduleId) => {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).base64();
};

const sendChunks = async (kind, b64) => {
  const total = Math.ceil(b64.length / CHUNK);
  for (let index = 0; index < total; index++) {
    const acked = new Promise((resolve, reject) => {
      acks.set(`${kind}:${index}`, resolve);
      setTimeout(() => reject(new Error(`no ack for ${kind} chunk ${index}`)), TIMEOUT_MS);
    });
    post({ type: 'chunk', kind, index, total, data: b64.slice(index * CHUNK, (index + 1) * CHUNK) });
    await acked;   // one in flight at a time keeps memory flat
  }
};

// Called by EmbedderHost once the page has booted
export const attachEmbedder = async (postFn) => {
  post = postFn;
  if (started) return;
  started = true;
  setState('loading');
  try {
    post({ type: 'init', weights: WEIGHTS });
    await sendChunks('model', await readBase64(MODEL));
    await sendChunks('wasm', await readBase64(WASM));
  } catch (e) {
    setState('failed', e?.message ?? e);
  }
};

export const detachEmbedder = () => {
  post = null;
  started = false;
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('embedder detached')); }
  pending.clear();
  if (state !== 'failed') setState('idle');
};

// Messages from the WebView
export const handleEmbedderMessage = (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type === 'boot') return;
  if (msg.type === 'ack') {
    acks.get(`${msg.kind}:${msg.index}`)?.();
    acks.delete(`${msg.kind}:${msg.index}`);
  } else if (msg.type === 'loaded') {
    loadMs = msg.ms;
    setState('ready');
  } else if (msg.type === 'result' || (msg.type === 'error' && msg.id)) {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.type === 'error') p.reject(new Error(msg.message));
    else {
      avgMs = avgMs == null ? msg.ms : avgMs * 0.9 + msg.ms * 0.1;
      p.resolve(msg);
    }
  } else if (msg.type === 'error') {
    setState('failed', msg.message);
  }
};

const b64ToBytes = (b64) => {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// localUri: a file:// URI of the original photo. Resolves to
// { vec: Uint8Array(576) (int8 bytes), probs: number[], label, confidence, ms }
export const embedPhoto = async (localUri) => {
  if (state !== 'ready' || !post) throw new Error('embedder not ready');
  const ctx = ImageManipulator.manipulate(localUri).resize({ width: 224, height: 224 });
  const image = await ctx.renderAsync();
  let saved;
  try {
    saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95, base64: true });
  } finally {
    image.release?.();
    ctx.release?.();
  }
  // The JPEG file itself isn't needed once we have the base64
  try { new File(saved.uri).delete(); } catch {}
  const id = nextId++;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('embed timeout')); }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    post({ type: 'embed', id, jpeg: saved.base64 });
  });
  const best = result.probs.indexOf(Math.max(...result.probs));
  return { vec: b64ToBytes(result.vec), probs: result.probs, label: CLASSES[best], confidence: result.probs[best], ms: result.ms };
};

// Cosine similarity of two stored int8 vectors
export const vecSimilarity = (a, b) => {
  const x = new Int8Array(a.buffer, a.byteOffset, a.byteLength);
  const y = new Int8Array(b.buffer, b.byteOffset, b.byteLength);
  let dot = 0, nx = 0, ny = 0;
  for (let i = 0; i < x.length; i++) { dot += x[i] * y[i]; nx += x[i] * x[i]; ny += y[i] * y[i]; }
  return dot / (Math.sqrt(nx * ny) || 1);
};
