/**
 * AR 가면 카탈로그와 그리기.
 *
 * 모든 가면은 같은 좌표계(가면 공간)에서 그립니다.
 *   - 두 눈 중심: (140, 200), (260, 200) → 눈 사이 거리 120
 *   - 기준점(ANCHOR): 두 눈의 가운데 (200, 200)
 *   - 입은 대략 y≈330에 오므로 가면 아래 끝을 y≈305로 두면 노래할 때 입이 가려지지 않습니다.
 * 얼굴 인식 결과(눈 위치·기울기·고개 돌림)에 맞춰 이 공간을 화면 위로 옮겨 그립니다.
 *
 * 샘플 가면 6종은 MUVIS용으로 새로 그린 오리지널 디자인입니다.
 * 라이선스를 받은 가면 이미지(PNG)는 `image`로 등록하면 같은 방식으로 얼굴에 씌워집니다.
 */

import type { MaskTier } from '@/lib/types';
import type { FacePose } from './tracker';

export const MASK_ANCHOR = { x: 200, y: 200 };
export const MASK_EYE_DIST = 120;
export const MASK_VIEWBOX = '-34 -92 468 414';

type Pt = [number, number];
export type Fill =
  | string
  | { linear: [Pt, Pt]; stops: [number, string][] }
  | { radial: [Pt, number]; stops: [number, string][] };

export interface MaskLayer {
  d: string;
  fill?: Fill;
  stroke?: string;
  width?: number;
}

/** 이미지 가면: 이미지 픽셀 기준 화면 왼쪽 눈·오른쪽 눈의 중심 좌표를 함께 등록 */
export interface MaskImage {
  src: string;
  leftEye: Pt;
  rightEye: Pt;
}

export interface MaskDef {
  id: string;
  name: string;
  blurb: string;
  tier: MaskTier;
  layers?: MaskLayer[];
  image?: MaskImage;
}

// ── 경로 도우미 ──────────────────────────────────────────

const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** 절대좌표 명령(M L Q C H Z)으로 쓴 경로를 x=200 기준으로 좌우 대칭 */
function mirror(d: string): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let cmd = '';
  let i = 0;
  return tokens
    .map((t) => {
      if (/[A-Za-z]/.test(t)) {
        cmd = t;
        i = 0;
        return t;
      }
      const isX = cmd === 'H' || ('MLQCTS'.includes(cmd) && i % 2 === 0);
      i++;
      return isX ? String(400 - parseFloat(t)) : t;
    })
    .join(' ');
}

const sym = (d: string, style: Omit<MaskLayer, 'd'>): MaskLayer[] => [
  { d, ...style },
  { d: mirror(d), ...style },
];

function star(cx: number, cy: number, ro: number, ri: number, n: number): string {
  const pts: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? ri : ro;
    const a = (Math.PI * k) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const glints = (dx = 10, dy = -6, r = 6): MaskLayer[] => [
  { d: ellipse(140 + dx, 200 + dy, r), fill: 'rgba(255,255,255,0.75)' },
  { d: ellipse(260 + dx, 200 + dy, r), fill: 'rgba(255,255,255,0.75)' },
];

// ── 샘플 가면 (오리지널) ─────────────────────────────────

export const MASKS: MaskDef[] = [
  {
    id: 'fox',
    name: '붉은 여우',
    blurb: '날렵한 눈매의 무대 여우. 가볍고 경쾌한 곡에 잘 어울려요.',
    tier: 'free',
    layers: [
      ...sym('M78 80 L48 -58 L158 34 Z', { fill: '#e0441f' }),
      ...sym('M86 62 L66 -22 L136 36 Z', { fill: '#ffd9b8' }),
      {
        d: 'M200 18 C302 18 362 92 362 172 C362 232 320 274 268 294 L200 304 L132 294 C80 274 38 232 38 172 C38 92 98 18 200 18 Z',
        fill: { linear: [[200, 18], [200, 304]], stops: [[0, '#f4692b'], [1, '#b8261a']] },
      },
      ...sym('M38 186 C58 250 110 288 162 300 L200 304 L200 252 C158 252 106 232 38 186 Z', { fill: '#fff4e8' }),
      { d: 'M200 58 L224 118 L200 150 L176 118 Z', fill: '#ffd23f' },
      ...sym('M98 206 Q140 162 184 200 Q140 230 98 206 Z', { fill: '#160b20', stroke: '#2b1530', width: 4 }),
      ...glints(),
      { d: 'M180 262 Q200 248 220 262 Q212 284 200 286 Q188 284 180 262 Z', fill: '#1d0e16' },
      ...sym('M122 262 L66 254', { stroke: '#7a1e12', width: 4 }),
      ...sym('M124 276 L72 286', { stroke: '#7a1e12', width: 4 }),
    ],
  },
  {
    id: 'owl',
    name: '밤의 부엉이',
    blurb: '커다란 금빛 눈의 부엉이. 발라드에 신비로운 분위기를 더해요.',
    tier: 'free',
    layers: [
      {
        d: 'M54 30 L124 70 Q200 44 276 70 L346 30 L352 126 Q372 206 330 262 Q282 306 200 306 Q118 306 70 262 Q28 206 48 126 Z',
        fill: { linear: [[200, 30], [200, 306]], stops: [[0, '#6a58a6'], [1, '#2c2350']] },
      },
      { d: ellipse(140, 200, 72), fill: '#e4dcfb', stroke: '#a796e0', width: 6 },
      { d: ellipse(260, 200, 72), fill: '#e4dcfb', stroke: '#a796e0', width: 6 },
      { d: ellipse(140, 200, 40), fill: '#140c26', stroke: '#ffc23d', width: 9 },
      { d: ellipse(260, 200, 40), fill: '#140c26', stroke: '#ffc23d', width: 9 },
      ...glints(12, -12, 8),
      ...sym('M86 118 L140 140 L194 112', { stroke: '#ffc23d', width: 8 }),
      { d: 'M170 76 L200 98 L230 76', stroke: '#8f7fd0', width: 6 },
      { d: 'M184 246 L216 246 L200 298 Z', fill: '#ffb02e', stroke: '#c47a12', width: 3 },
    ],
  },
  {
    id: 'robot',
    name: '네온 로봇',
    blurb: '네온 바이저가 빛나는 로봇 헬멧. 댄스·일렉트로닉 곡에 제격이에요.',
    tier: 'free',
    layers: [
      { d: 'M200 34 L200 -24', stroke: '#9aa3c0', width: 9 },
      { d: ellipse(200, -40, 16), fill: '#f2243a' },
      ...sym('M28 150 L8 150 Q0 150 0 158 L0 230 Q0 238 8 238 L28 238 Z', { fill: '#2b3150', stroke: '#3fe0d0', width: 4 }),
      {
        d: 'M64 34 L336 34 Q372 34 372 70 L372 252 Q372 302 322 302 L78 302 Q28 302 28 252 L28 70 Q28 34 64 34 Z',
        fill: { linear: [[200, 34], [200, 302]], stops: [[0, '#4a5372'], [1, '#1c2133']] },
        stroke: '#7b86ad',
        width: 4,
      },
      { d: ellipse(200, 100, 26, 10), fill: '#f2243a' },
      {
        d: 'M72 158 L328 158 Q348 158 348 178 L348 228 Q348 248 328 248 L72 248 Q52 248 52 228 L52 178 Q52 158 72 158 Z',
        fill: '#070a14',
        stroke: '#3fe0d0',
        width: 6,
      },
      ...sym('M104 190 L176 190 Q184 190 184 198 L184 206 Q184 214 176 214 L104 214 Q96 214 96 206 L96 198 Q96 190 104 190 Z', { fill: '#3fe0d0' }),
      { d: 'M150 272 L250 272', stroke: '#7b86ad', width: 6 },
      { d: 'M162 286 L238 286', stroke: '#7b86ad', width: 6 },
    ],
  },
  {
    id: 'masquerade',
    name: '가면무도회',
    blurb: '눈가만 가리는 깃털 하프 마스크. 얼굴 표정이 잘 보여요.',
    tier: 'free',
    layers: [
      { d: 'M300 150 Q330 40 300 -50 Q360 30 340 150 Z', fill: '#ffc23d' },
      { d: 'M320 152 Q380 70 392 -10 Q410 90 350 162 Z', fill: '#ff7ab0' },
      { d: 'M280 150 Q270 60 240 0 Q310 50 316 150 Z', fill: '#c4122f' },
      {
        d: 'M26 176 Q92 120 200 164 Q308 120 374 176 Q366 252 282 258 Q230 258 200 228 Q170 258 118 258 Q34 252 26 176 Z',
        fill: { linear: [[26, 160], [374, 260]], stops: [[0, '#f2243a'], [1, '#6d0f2b']] },
        stroke: '#ffc23d',
        width: 7,
      },
      ...sym('M100 204 Q140 168 182 200 Q140 230 100 204 Z', { fill: '#12081a', stroke: '#ffc23d', width: 4 }),
      ...sym('M58 196 Q78 172 104 180', { stroke: '#ffc23d', width: 4 }),
      { d: ellipse(200, 184, 10, 14), fill: '#3fe0d0', stroke: '#ffc23d', width: 3 },
    ],
  },
  {
    id: 'lion',
    name: '황금 사자',
    blurb: '무대를 압도하는 황금 갈기. 고음 폭발 곡을 위한 프리미엄 가면.',
    tier: 'premium',
    layers: [
      {
        d: star(200, 156, 232, 176, 26),
        fill: { radial: [[200, 160], 240], stops: [[0, '#ffcf4a'], [0.7, '#e08a1e'], [1, '#a3500e']] },
      },
      ...sym('M82 92 Q70 40 116 46 Q122 78 82 92 Z', { fill: '#c96d16' }),
      {
        d: 'M200 40 C290 40 342 100 342 176 C342 242 292 288 200 304 C108 288 58 242 58 176 C58 100 110 40 200 40 Z',
        fill: { linear: [[200, 40], [200, 304]], stops: [[0, '#ffd36b'], [1, '#e39a2c']] },
      },
      ...sym('M96 168 Q140 140 182 164', { stroke: '#8a4b0c', width: 9 }),
      ...sym('M102 204 Q140 172 180 202 Q140 226 102 204 Z', { fill: '#1a0d08', stroke: '#8a4b0c', width: 4 }),
      ...glints(8, -6, 5),
      { d: ellipse(200, 108, 14, 18), fill: '#f2243a', stroke: '#ffe9a8', width: 4 },
      { d: 'M146 252 Q200 222 254 252 Q246 302 200 304 Q154 302 146 252 Z', fill: '#fff0c8' },
      { d: 'M178 242 L222 242 Q216 262 200 270 Q184 262 178 242 Z', fill: '#5a2a10' },
    ],
  },
  {
    id: 'phoenix',
    name: '불꽃 피닉스',
    blurb: '타오르는 불꽃 왕관의 불사조. 피날레 무대를 위한 프리미엄 가면.',
    tier: 'premium',
    layers: [
      {
        d: 'M58 128 Q38 44 92 -12 Q92 50 132 62 Q120 -22 172 -74 Q170 8 200 32 Q230 8 228 -74 Q280 -22 268 62 Q308 50 308 -12 Q362 44 342 128 Z',
        fill: { linear: [[200, -74], [200, 128]], stops: [[0, '#ffe066'], [0.5, '#ff7a1f'], [1, '#d01b33']] },
      },
      {
        d: 'M44 132 Q200 64 356 132 Q366 232 302 280 Q252 306 200 306 Q148 306 98 280 Q34 232 44 132 Z',
        fill: { linear: [[200, 70], [200, 306]], stops: [[0, '#d01b33'], [1, '#5e0a28']] },
      },
      ...sym('M60 170 Q90 230 150 262 Q100 222 86 170 Z', { fill: '#ff9a2e' }),
      ...sym('M96 210 Q138 160 186 198 Q142 232 96 210 Z', { fill: '#140818', stroke: '#ffd23f', width: 5 }),
      ...glints(8, -8, 5),
      { d: 'M200 92 L214 116 L200 140 L186 116 Z', fill: '#ffe066' },
      { d: 'M182 236 Q200 220 218 236 L200 290 Z', fill: '#ffd23f', stroke: '#b8741a', width: 3 },
    ],
  },
];

export const getMask = (id: string | null | undefined) => MASKS.find((m) => m.id === id) ?? null;

// ── 캔버스에 그리기 ──────────────────────────────────────

const pathCache = new Map<string, Path2D>();
const imageCache = new Map<string, HTMLImageElement>();

function toCanvasFill(ctx: CanvasRenderingContext2D, f: Fill): string | CanvasGradient {
  if (typeof f === 'string') return f;
  const g =
    'linear' in f
      ? ctx.createLinearGradient(f.linear[0][0], f.linear[0][1], f.linear[1][0], f.linear[1][1])
      : ctx.createRadialGradient(f.radial[0][0], f.radial[0][1], 0, f.radial[0][0], f.radial[0][1], f.radial[1]);
  f.stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

/** 가면 공간 좌표계 그대로 가면을 그립니다 (변환은 호출하는 쪽에서) */
export function paintMask(ctx: CanvasRenderingContext2D, mask: MaskDef) {
  if (mask.image) {
    let img = imageCache.get(mask.image.src);
    if (!img) {
      img = new Image();
      img.src = mask.image.src;
      imageCache.set(mask.image.src, img);
    }
    if (!img.complete || !img.naturalWidth) return;
    const [l, r] = [mask.image.leftEye, mask.image.rightEye];
    const k = MASK_EYE_DIST / Math.hypot(r[0] - l[0], r[1] - l[1]);
    ctx.save();
    ctx.translate(MASK_ANCHOR.x, MASK_ANCHOR.y);
    ctx.rotate(-Math.atan2(r[1] - l[1], r[0] - l[0]));
    ctx.scale(k, k);
    ctx.drawImage(img, -(l[0] + r[0]) / 2, -(l[1] + r[1]) / 2);
    ctx.restore();
    return;
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const layer of mask.layers ?? []) {
    let p = pathCache.get(layer.d);
    if (!p) {
      p = new Path2D(layer.d);
      pathCache.set(layer.d, p);
    }
    if (layer.fill) {
      ctx.fillStyle = toCanvasFill(ctx, layer.fill);
      ctx.fill(p);
    }
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.width ?? 4;
      ctx.stroke(p);
    }
  }
}

/** 얼굴 자세에 맞춰 가면을 화면 위에 씌웁니다 */
export function drawMaskOnFace(ctx: CanvasRenderingContext2D, mask: MaskDef, pose: FacePose) {
  const s = pose.eyeDist / MASK_EYE_DIST;
  const squash = Math.max(0.55, Math.cos(pose.yaw));
  // 가면 앞면은 얼굴보다 앞에 있으므로 고개를 돌린 방향으로 조금 더 이동
  const shift = Math.sin(pose.yaw) * pose.eyeDist * 0.28;
  ctx.save();
  ctx.translate(pose.x + shift * Math.cos(pose.roll), pose.y + shift * Math.sin(pose.roll));
  ctx.rotate(pose.roll);
  ctx.scale(s * squash, s);
  ctx.translate(-MASK_ANCHOR.x, -MASK_ANCHOR.y);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18 / s;
  paintMask(ctx, mask);
  ctx.restore();
}
