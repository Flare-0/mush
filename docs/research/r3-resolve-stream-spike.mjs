// R-3 spike: run the EXACT ArchiveTune youtubei.js bundle (morideobfuscator
// youtubei.bundle.js, built for QuickJS-on-Android) in plain Node >= 24 with
// light bridge shims, resolve a real audio stream URL for a well-known video,
// then verify it streams via a Range request.
//
// No npm deps. Node global fetch + crypto + fs only.

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

// Override with the 3rd CLI arg or R3_BUNDLE when the repo is mapped elsewhere.
const BUNDLE =
  process.argv[3] ||
  process.env.R3_BUNDLE ||
  'E:\\mush\\scratch\\morideobfuscator\\src\\main\\assets\\youtubei\\youtubei.bundle.js';
const MEDIA_ID = process.argv[2] || 'dQw4w9WgXcQ';
const nodeFetch = globalThis.fetch.bind(globalThis);

const log = (...a) => console.log('[spike]', ...a);

// ---- helper: base64 <-> bytes -------------------------------------------------
const b64 = (u8) => Buffer.from(u8.buffer ? u8 : Buffer.from(u8)).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s || '', 'base64'));

// ---- bridge shims the bundle calls into (mirrors YoutubeiQuickJsWorker.kt) ----
const cache = new Map();

globalThis.__archiveTuneHttp = async (requestJson) => {
  const req = JSON.parse(requestJson);
  try {
    const p = new URL(req.url);
    log('HTTP', req.method || 'GET', p.host + p.pathname.slice(0, 60));
    const res = await nodeFetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers || {},
      body: req.bodyBase64 ? unb64(req.bodyBase64) : undefined,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    return JSON.stringify({
      ok: true,
      status: res.status,
      statusText: res.statusText || '',
      headers: Object.fromEntries(res.headers.entries()),
      url: res.url,
      redirected: res.redirected,
      bodyBase64: Buffer.from(buf).toString('base64'),
    });
  } catch (e) {
    return JSON.stringify({ ok: false, kind: 'NETWORK', message: String(e?.message || e) });
  }
};

globalThis.__archiveTunePlayerSource = async (requestJson) => {
  const req = JSON.parse(requestJson);
  try {
    log('PLAYER-SOURCE', new URL(req.url).pathname.slice(0, 70));
    const res = await nodeFetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers || {},
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      return `ARCHIVETUNE_PLAYER_SOURCE_ERROR|HTTP|player script HTTP ${res.status}`;
    }
    return await res.text();
  } catch (e) {
    return `ARCHIVETUNE_PLAYER_SOURCE_ERROR|NETWORK|${String(e?.message || e)}`;
  }
};

globalThis.__archiveTuneVideoPoToken = async () => null;
globalThis.__archiveTuneCacheRead = async (key) => cache.get(String(key));
globalThis.__archiveTuneCacheWrite = async (json) => {
  const { key, value } = JSON.parse(json);
  cache.set(String(key), value);
};
globalThis.__archiveTuneCacheRemove = async (key) => {
  cache.delete(String(key));
};
globalThis.__archiveTuneSha1 = (value) =>
  createHash('sha1').update(String(value), 'utf8').digest('hex');
globalThis.__archiveTuneUuid = () => randomUUID();
globalThis.__archiveTuneRandom = (size) => randomBytes(Number(size) | 0).toString('base64');

// ---- load the exact same bundle the Android app ships ------------------------
log('loading bundle:', BUNDLE);
let source = readFileSync(BUNDLE, 'utf8');
log('bundle bytes:', source.length);

// The shipped bundle stubs ReadableStream out (QuickJS has none) and its
// Response/BodyContainer never exposes `.body`. Node HAS a native ReadableStream,
// so patch these two spots in memory (no file writes):
globalThis.__NativeReadableStream = globalThis.ReadableStream;
const stub = 'Rk=class Rk{constructor(){throw new TypeError("Streaming response bodies are not available in the extraction runtime")}}';
if (!source.includes(stub)) throw new Error('ReadableStream stub anchor not found in bundle');
source = source.replace(stub, 'Rk=class Rk extends globalThis.__NativeReadableStream{}');
const consumeAnchor = 'cloneBytes(){return Ee(this,sp).slice()}}';
if (!source.includes(consumeAnchor)) throw new Error('BodyContainer anchor not found in bundle');
source = source.replace(
  consumeAnchor,
  'cloneBytes(){return Ee(this,sp).slice()}get body(){let b=Ee(this,sp).slice();return new globalThis.__NativeReadableStream({start(c){c.enqueue(b);c.close()}})}}',
);
log('in-memory patches applied: ReadableStream stub -> native, BodyContainer.body -> byte stream');

globalThis.__spikeT0 = Date.now();
try {
  new Function(source)();
} catch (e) {
  console.error('bundle eval failed:', e.message);
  process.exit(1);
}
const runtime = globalThis.ArchiveTuneYoutubei;
if (!runtime) throw new Error('ArchiveTuneYoutubei global missing after bundle eval');
log('runtime version:', runtime.version, 'eval+init ms (includes 1.1MB parse):', Date.now() - globalThis.__spikeT0);

// ---- request JSON: same shape YoutubeiResolver.toJson() sends -----------------
const request = {
  mediaId: MEDIA_ID,
  quality: 'HIGHEST',
  networkMetered: false,
  authFingerprint: 'r3-spike',
  pinnedItag: null,
  requiresSongMetadata: false,
  cookie: null,
  visitorData: null,
  dataSyncId: null,
  sessionPoToken: null,
  videoPoToken: null,
  language: 'en',
  location: 'US',
  timezone: 'UTC',
};
const requestJson = JSON.stringify(request);

// ---- prepare + resolve --------------------------------------------------------
let t = Date.now();
const prep = JSON.parse(await runtime.prepare(requestJson));
log('prepare ok:', prep.ok, prep.ok ? `(${Date.now() - t}ms incl. session create)` : JSON.stringify(prep.error));
if (!prep.ok) {
  console.log('RESULT: FAIL prepare:', JSON.stringify(prep.error));
  process.exit(2);
}

t = Date.now();
const resolved = JSON.parse(await runtime.resolvePrepared(requestJson));
log('resolve ok:', resolved.ok, `(${Date.now() - t}ms)`);
if (!resolved.ok) {
  console.log('RESULT: FAIL resolve:', JSON.stringify(resolved.error));
  process.exit(3);
}

const v = resolved.value;
const u = new URL(v.url);
console.log('RESULT: RESOLVED');
console.log('  url-prefix      :', `${u.origin}${u.pathname.slice(0, 40)}...`);
console.log('  query-param-names:', [...u.searchParams.keys()].join(', '));
console.log('  itag            :', v.formatId);
console.log('  mime/codecs     :', v.mimeType, '/', v.codecs);
console.log('  bitrate         :', v.bitrate, ' sampleRate:', v.sampleRate);
console.log('  contentLength   :', v.contentLength);
console.log('  expiresAtMs     :', v.expiresAtMs, `(in ${Math.round((v.expiresAtMs - Date.now()) / 1000)}s)`);
console.log('  title           :', v.title);
console.log('  headers sent    :', Object.keys(v.headers || {}).join(', '));

// ---- range-verify the stream (first 2KB) --------------------------------------
t = Date.now();
const rangeRes = await nodeFetch(v.url, {
  method: 'GET',
  headers: { ...(v.headers || {}), Range: 'bytes=0-2047' },
  signal: AbortSignal.timeout(30000),
});
const body = new Uint8Array(await rangeRes.arrayBuffer());
console.log('  range status    :', rangeRes.status, `(${Date.now() - t}ms)`);
console.log('  content-type    :', rangeRes.headers.get('content-type'));
console.log('  content-range   :', rangeRes.headers.get('content-range'));
console.log('  accepted-ranges :', rangeRes.headers.get('accept-ranges'));
console.log('  bytes received  :', body.length);
const magic = [...body.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join(' ');
console.log('  first-8-bytes   :', magic, body[0] === 0x1a && body[1] === 0x45 ? '(EBML/webm)' : magic.includes('66747970') ? '(ftyp/mp4)' : '');

if (rangeRes.status === 206 || rangeRes.status === 200) {
  console.log('RESULT: STREAM VERIFIED (http', rangeRes.status + ',', body.length, 'bytes,', rangeRes.headers.get('content-type') + ')');
  process.exit(0);
} else {
  const text = new TextDecoder().decode(body.slice(0, 300));
  console.log('RESULT: STREAM FETCH FAILED', rangeRes.status, text.slice(0, 300));
  process.exit(4);
}
