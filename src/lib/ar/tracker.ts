/**
 * 얼굴 인식 (MediaPipe Face Landmarker, 브라우저 GPU/WASM).
 * 한 페이지에 인식기를 하나만 두고, 착용 미리보기와 모의 장비가 함께 씁니다.
 * 모델·WASM 위치는 환경변수로 바꿀 수 있습니다(오프라인 매장은 /public 에 두기).
 */
import { config } from '@/lib/config';

export interface FacePose {
  /** 두 눈 가운데 (원본 영상 픽셀) */
  x: number;
  y: number;
  /** 정면 기준 눈 사이 거리(px) — 고개를 돌려도 크기가 유지되도록 보정 */
  eyeDist: number;
  /** 기울기(rad) */
  roll: number;
  /** 좌우 고개 돌림(rad), 영상 오른쪽을 볼수록 + */
  yaw: number;
}

interface Landmark {
  x: number;
  y: number;
}

interface Detector {
  detectForVideo(src: TexImageSource, timestampMs: number): { faceLandmarks: Landmark[][] };
  close(): void;
}

export type TrackerState = 'idle' | 'loading' | 'ready' | 'error';

let detectorPromise: Promise<Detector | null> | null = null;
let state: TrackerState = 'idle';
let lastError = '';
let lastTs = 0;
let cache: { src: unknown; at: number; poses: FacePose[] } | null = null;

export const trackerState = () => ({ state, error: lastError });

export function loadTracker(): Promise<Detector | null> {
  if (detectorPromise) return detectorPromise;
  state = 'loading';
  detectorPromise = (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(config.arWasmBase);
      const make = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: config.arModelUrl, delegate },
          runningMode: 'VIDEO',
          numFaces: config.arMaxFaces,
        });
      let lm;
      try {
        lm = await make('GPU');
      } catch {
        lm = await make('CPU');
      }
      state = 'ready';
      return lm as unknown as Detector;
    } catch (e) {
      state = 'error';
      lastError = e instanceof Error ? e.message : String(e);
      detectorPromise = null;
      return null;
    }
  })();
  return detectorPromise;
}

const P = (l: Landmark[], i: number, w: number, h: number) => ({ x: l[i].x * w, y: l[i].y * h });
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 478개 얼굴 랜드마크 → 가면을 씌울 자세 */
export function poseFromLandmarks(l: Landmark[], w: number, h: number): FacePose | null {
  if (l.length < 455) return null;
  const A = mid(P(l, 33, w, h), P(l, 133, w, h)); // 화면 왼쪽 눈
  const B = mid(P(l, 362, w, h), P(l, 263, w, h)); // 화면 오른쪽 눈
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return null;
  const ux = dx / d;
  const uy = dy / d;
  const c1 = P(l, 234, w, h);
  const c2 = P(l, 454, w, h);
  const cm = mid(c1, c2);
  const half = Math.abs((c2.x - c1.x) * ux + (c2.y - c1.y) * uy) / 2 || d;
  const nose = P(l, 1, w, h);
  const off = ((nose.x - cm.x) * ux + (nose.y - cm.y) * uy) / half;
  const yaw = Math.asin(Math.max(-0.95, Math.min(0.95, off)));
  const e = mid(A, B);
  return { x: e.x, y: e.y, eyeDist: d / Math.max(0.5, Math.cos(yaw)), roll: Math.atan2(dy, dx), yaw };
}

/** 한 프레임 인식. 같은 영상을 25ms 안에 다시 물으면 직전 결과를 돌려줍니다. */
export function detectFaces(det: Detector, src: TexImageSource, w: number, h: number): FacePose[] {
  const now = performance.now();
  if (cache && cache.src === src && now - cache.at < 25) return cache.poses;
  const ts = Math.max(now, lastTs + 1);
  lastTs = ts;
  let res;
  try {
    res = det.detectForVideo(src, ts);
  } catch {
    return cache?.src === src ? cache.poses : [];
  }
  const poses = res.faceLandmarks
    .map((l) => poseFromLandmarks(l, w, h))
    .filter((p): p is FacePose => p !== null)
    .sort((a, b) => a.x - b.x);
  cache = { src, at: now, poses };
  return poses;
}

/** 프레임 사이 떨림을 줄이는 지수 평활 */
export class PoseSmoother {
  private prev: FacePose[] = [];
  constructor(private readonly alpha = 0.55) {}
  next(poses: FacePose[]): FacePose[] {
    const a = this.alpha;
    const out = poses.map((p, i) => {
      const q = this.prev[i];
      if (!q || Math.abs(q.x - p.x) > p.eyeDist * 1.5) return p;
      return {
        x: q.x + (p.x - q.x) * a,
        y: q.y + (p.y - q.y) * a,
        eyeDist: q.eyeDist + (p.eyeDist - q.eyeDist) * a,
        roll: q.roll + (p.roll - q.roll) * a,
        yaw: q.yaw + (p.yaw - q.yaw) * a,
      };
    });
    this.prev = out;
    return out;
  }
}
