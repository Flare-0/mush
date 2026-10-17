import { useEffect, useRef, useState } from 'react';
import { ACCENT_FALLBACK, FALLBACK_PALETTE, extractPalette, pickAccent } from '../lib/palette';
import './AmbientBackground.css';

export interface AmbientBackgroundProps {
  coverUrl: string | null;
  playing: boolean;
}

type RGB = [number, number, number];

const PALETTE_TWEEN_MS = 1200;
const ACCENT_TWEEN_MS = 600;
const MIN_FRAME_MS = 1000 / 30;
/** #FF4D5E as channels (warm default accent). */
const ACCENT_FALLBACK_RGB: RGB = [255, 77, 94];

/* YTM-reference backdrop: near-black base + 3 soft gaussian blobs sampled
   from the cover palette (uC[0..2]), drifting on incommensurate sine/cos
   phases so the pattern never loops. Blob A is biased top-left so the first
   paint already glows like the reference; B sits bottom-center-left, C is a
   whisper top-right. ~80% of the frame stays near-black. uC[3..4] are
   unused (kept only so the palette upload path is untouched). */
const FRAG_SRC = `precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC[5];

void main(){
  vec2 frag = gl_FragCoord.xy / uRes;
  vec2 uv = frag;
  uv.x *= uRes.x / uRes.y;
  float t = uTime;
  // Incommensurate drift speeds: the field never visibly loops.
  // NOTE: gl_FragCoord y is bottom-up, so top-biased blobs use 1.0 - y.
  vec2 pA = vec2(0.16 + 0.09 * sin(t * 0.113 + 1.7), 1.0 - (0.16 + 0.07 * cos(t * 0.071 + 0.6)));
  vec2 pB = vec2(0.40 + 0.12 * cos(t * 0.059 + 2.3), 0.14 + 0.08 * sin(t * 0.089 + 4.1));
  vec2 pC = vec2(0.86 + 0.07 * sin(t * 0.053 + 5.0), 1.0 - (0.10 + 0.06 * cos(t * 0.097 + 1.2)));
  vec2 qA = uv - vec2(pA.x * (uRes.x / uRes.y), pA.y);
  vec2 qB = uv - vec2(pB.x * (uRes.x / uRes.y), pB.y);
  vec2 qC = uv - vec2(pC.x * (uRes.x / uRes.y), pC.y);
  // Gaussian widths ~0.5 / 0.7 / 0.9 viewport, intensities ~0.55 / 0.3 / 0.18.
  float gA = exp(-dot(qA, qA) / (2.0 * 0.25 * 0.25)) * 0.55;
  float gB = exp(-dot(qB, qB) / (2.0 * 0.35 * 0.35)) * 0.30;
  float gC = exp(-dot(qC, qC) / (2.0 * 0.45 * 0.45)) * 0.18;
  vec3 col = vec3(0.039, 0.039, 0.047);
  // Blob A leans warm so the first paint (dark fallback palette, no cover
  // yet) already glows like the reference; it still tracks uC[0].
  vec3 warmA = mix(uC[0], vec3(1.0, 0.30, 0.16), 0.45);
  col += warmA * gA;
  col += uC[1] * gB;
  col += uC[2] * gC;

  vec2 c = frag - 0.5;
  col *= 1.0 - dot(c, c) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`;

/* Fullscreen triangle; uC is uploaded per frame via uniform3fv. */
const VERT_SRC = `attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

interface GLSetup {
  gl: WebGLRenderingContext;
  uRes: WebGLUniformLocation;
  uTime: WebGLUniformLocation;
  uC: WebGLUniformLocation;
}

interface Engine extends GLSetup {
  time: number;
  speed: number;
  lastFrame: number;
  raf: number;
  running: boolean;
  reduced: boolean;
  paletteFrom: RGB[];
  paletteTo: RGB[];
  paletteStart: number;
  accentFrom: RGB;
  accentTo: RGB;
  accentStart: number;
  accentDone: boolean;
}

function copyRgb(c: RGB): RGB {
  return [c[0], c[1], c[2]];
}

/** Parse an `rgb(r, g, b)` or `#rrggbb` color into 0-255 channels. */
function parseCssColor(css: string): RGB {
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(css.trim());
  if (rgb) {
    return [
      Math.min(255, Math.max(0, Number(rgb[1]))),
      Math.min(255, Math.max(0, Number(rgb[2]))),
      Math.min(255, Math.max(0, Number(rgb[3]))),
    ];
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return copyRgb(ACCENT_FALLBACK_RGB);
}

function toCss(c: RGB): string {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

function lerpPalette(from: RGB[], to: RGB[], t: number): RGB[] {
  return from.map((c, i) => {
    const d = to[Math.min(i, to.length - 1)];
    return [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
  });
}

function easeInOut(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`WebGL: shader compile failed: ${log ?? 'unknown'}`);
  }
  return sh;
}

/** Initialize WebGL1 + the §12.3 program. Returns null on any failure. */
function setupGL(canvas: HTMLCanvasElement): GLSetup | null {
  try {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) return null;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uC = gl.getUniformLocation(prog, 'uC');
    if (!uRes || !uTime || !uC) return null;
    return { gl, uRes, uTime, uC };
  } catch {
    return null;
  }
}

export default function AmbientBackground({ coverUrl, playing }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const playingRef = useRef(playing);
  const [glFailed, setGlFailed] = useState(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  /* Mount once: GL setup, sizing, frame loop. uTime starts at a random
     offset here and is never reseeded, so track changes never jump (§12.4).
     No per-frame React state: everything lives in refs. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setup = setupGL(canvas);
    if (!setup) {
      setGlFailed(true);
      return;
    }
    const startValue = parseCssColor(ACCENT_FALLBACK);
    const eng: Engine = {
      ...setup,
      time: Math.random() * 1000,
      speed: 1,
      lastFrame: 0,
      raf: 0,
      running: false,
      reduced,
      paletteFrom: FALLBACK_PALETTE.map(copyRgb),
      paletteTo: FALLBACK_PALETTE.map(copyRgb),
      paletteStart: performance.now(),
      accentFrom: startValue,
      accentTo: copyRgb(startValue),
      accentStart: performance.now(),
      accentDone: true,
    };
    engineRef.current = eng;

    /* 0.5x render resolution; canvas CSS scales it back up.
       uRes is uploaded on EVERY resize call (not only when the size
       changes): a fresh GL program starts with (0,0) uniforms, and in dev
       StrictMode the mount effect runs twice on the same canvas, so the
       second setup would otherwise keep a zero resolution and paint black. */
    const resize = (): void => {
      const w = Math.max(1, Math.round(canvas.clientWidth * 0.5));
      const h = Math.max(1, Math.round(canvas.clientHeight * 0.5));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        eng.gl.viewport(0, 0, w, h);
      }
      eng.gl.uniform2f(eng.uRes, w, h);
    };

    const renderFrame = (now: number, instantAccent: boolean): void => {
      const t = easeInOut((now - eng.paletteStart) / PALETTE_TWEEN_MS);
      const cur = lerpPalette(eng.paletteFrom, eng.paletteTo, t);
      const flat: number[] = [];
      for (const c of cur) flat.push(c[0], c[1], c[2]);
      eng.gl.uniform3fv(eng.uC, flat);
      eng.gl.uniform1f(eng.uTime, eng.time);
      eng.gl.drawArrays(eng.gl.TRIANGLES, 0, 3);
      if (!eng.accentDone) {
        const at = instantAccent ? 1 : easeInOut((now - eng.accentStart) / ACCENT_TWEEN_MS);
        const a: RGB = [
          eng.accentFrom[0] + (eng.accentTo[0] - eng.accentFrom[0]) * at,
          eng.accentFrom[1] + (eng.accentTo[1] - eng.accentFrom[1]) * at,
          eng.accentFrom[2] + (eng.accentTo[2] - eng.accentFrom[2]) * at,
        ];
        document.documentElement.style.setProperty('--accent', toCss(a));
        if (at >= 1) eng.accentDone = true;
      }
    };
    redrawRef.current = () => {
      resize();
      renderFrame(performance.now(), true);
    };

    /* Capped at ~30fps; clock speed 1.0 playing, easing to 0.35 paused. */
    const tick = (now: number): void => {
      if (!eng.running) return;
      const dtMs = now - eng.lastFrame;
      if (dtMs >= MIN_FRAME_MS) {
        const dt = Math.min(0.1, dtMs / 1000);
        const target = playingRef.current ? 1 : 0.35;
        eng.speed += (target - eng.speed) * (1 - Math.exp(-dt / 0.25));
        eng.time += dt * eng.speed;
        renderFrame(now, false);
        eng.lastFrame = now;
      }
      eng.raf = requestAnimationFrame(tick);
    };

    const start = (): void => {
      if (eng.running || eng.reduced || document.hidden) return;
      eng.running = true;
      eng.lastFrame = performance.now();
      eng.raf = requestAnimationFrame(tick);
    };

    const stop = (): void => {
      eng.running = false;
      cancelAnimationFrame(eng.raf);
    };

    const onVisibility = (): void => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    if (eng.reduced) renderFrame(performance.now(), true);
    else start();

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      redrawRef.current = null;
      if (engineRef.current === eng) engineRef.current = null;
    };
  }, []);

  /* Cover change: tween palette old -> new over 1200ms and crossfade
     --accent over 600ms while uTime keeps running (no motion jump). */
  useEffect(() => {
    if (coverUrl === null) return;
    let cancelled = false;

    const applyPalette = (palette: RGB[]): void => {
      if (cancelled) return;
      const eng = engineRef.current;
      const accent = parseCssColor(pickAccent(palette));
      if (!eng) {
        // CSS-fallback path: layers show the art; set accent directly.
        document.documentElement.style.setProperty('--accent', toCss(accent));
        return;
      }
      const now = performance.now();
      if (eng.reduced) {
        // Static frame: snap to the new palette, then draw once.
        eng.paletteFrom = palette.map(copyRgb);
        eng.paletteTo = palette.map(copyRgb);
        eng.accentFrom = accent;
        eng.accentTo = copyRgb(accent);
        eng.accentDone = false;
        redrawRef.current?.();
        return;
      }
      eng.paletteFrom = lerpPalette(
        eng.paletteFrom,
        eng.paletteTo,
        easeInOut((now - eng.paletteStart) / PALETTE_TWEEN_MS),
      );
      eng.paletteTo = palette.map(copyRgb);
      eng.paletteStart = now;
      const current =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || toCss(eng.accentTo);
      eng.accentFrom = parseCssColor(current);
      eng.accentTo = accent;
      eng.accentStart = now;
      eng.accentDone = false;
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      applyPalette(extractPalette(img));
    };
    img.onerror = () => {
      applyPalette(FALLBACK_PALETTE.map(copyRgb));
    };
    img.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  return (
    <div className="ambient-root" aria-hidden="true">
      {!glFailed ? <canvas ref={canvasRef} className="ambient-canvas" /> : <div className="ambient-fallback" />}
      <div className="ambient-scrim" />
      <div className="ambient-grain" />
    </div>
  );
}
