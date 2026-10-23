import { drawMaskOnFace, getMask } from '@/lib/ar/masks';
import { detectFaces, loadTracker, PoseSmoother } from '@/lib/ar/tracker';
import { getWebcam } from '@/lib/ar/webcam';
import { config } from '@/lib/config';
import type {
  AgentEvent, AgentStatus, CameraInfo, DeviceAgent, MockAgentControls,
  PlayOptions, PreviewSource, RecordingResult,
} from './types';

const CAMERAS: CameraInfo[] = [
  { id: 'cam-1', label: 'CAM 1 정면' },
  { id: 'cam-2', label: 'CAM 2 좌측' },
  { id: 'cam-3', label: 'CAM 3 우측' },
];

const CAM_HUES: Record<string, number> = { 'cam-1': 268, 'cam-2': 330, 'cam-3': 186 };

/**
 * 브라우저 안에서 반주기·카메라·RF 리더를 흉내내는 모의 장비.
 * 카메라 화면은 캔버스 애니메이션을 MediaStream으로 만들어 실제 영상처럼 보여줍니다.
 */
export class MockAgent implements DeviceAgent, MockAgentControls {
  readonly kind = 'mock' as const;
  private status: AgentStatus = 'connecting';
  private listeners = new Set<(e: AgentEvent) => void>();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  private song: { no: string; pos: number; dur: number; paused: boolean } | null = null;
  private songTimer: ReturnType<typeof setInterval> | null = null;

  private recording: { takeId: string; cameraIds: string[]; startedAt: number } | null = null;
  private canvases = new Map<string, { canvas: HTMLCanvasElement; stream: MediaStream }>();
  private drawTimer: ReturnType<typeof setInterval> | null = null;

  /** 실제 로컬 에이전트처럼 LED·미리보기 화면에 가면을 합성해 보여줍니다 */
  private maskId: string | null = null;
  private webcam: HTMLVideoElement | null = null;
  private detector: Awaited<ReturnType<typeof loadTracker>> = null;
  private smoother = new PoseSmoother();

  connect() {
    if (this.connectTimer || this.status === 'online') return;
    this.setStatus('connecting');
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      this.setStatus('online');
    }, 400);
  }

  disconnect() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.clearSong();
    if (this.drawTimer) clearInterval(this.drawTimer);
    this.drawTimer = null;
    this.canvases.forEach(({ stream }) => stream.getTracks().forEach((t) => t.stop()));
    this.canvases.clear();
    this.status = 'connecting';
  }

  getStatus() {
    return this.status;
  }

  on(listener: (e: AgentEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: AgentEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private setStatus(s: AgentStatus) {
    this.status = s;
    this.emit({ type: 'status', status: s });
  }

  private ensureOnline() {
    if (this.status !== 'online') throw new Error('장비가 연결되어 있지 않습니다');
  }

  // ── 반주기 ─────────────────────────────────────────
  async playSong({ songNo, durationSec }: PlayOptions) {
    this.ensureOnline();
    this.clearSong();
    const dur = Math.min(durationSec ?? 200, config.demoSongSeconds);
    this.song = { no: songNo, pos: 0, dur, paused: false };
    this.emit({ type: 'song:started', songNo, durationSec: dur });
    this.songTimer = setInterval(() => {
      const s = this.song;
      if (!s || s.paused) return;
      s.pos = Math.min(s.dur, s.pos + 0.25);
      this.emit({ type: 'song:progress', songNo: s.no, positionSec: s.pos, durationSec: s.dur });
      if (s.pos >= s.dur) this.endSong(true);
    }, 250);
  }

  async pauseSong() {
    if (this.song) this.song.paused = true;
  }

  async resumeSong() {
    if (this.song) this.song.paused = false;
  }

  async stopSong() {
    if (this.song) this.endSong(false);
  }

  async skipInterlude() {
    if (this.song) this.song.pos = Math.min(this.song.dur - 1, this.song.pos + 8);
  }

  private endSong(completed: boolean) {
    const s = this.song;
    this.clearSong();
    if (s) this.emit({ type: 'song:ended', songNo: s.no, completed });
  }

  private clearSong() {
    if (this.songTimer) clearInterval(this.songTimer);
    this.songTimer = null;
    this.song = null;
  }

  // ── 카메라 ─────────────────────────────────────────
  async listCameras() {
    return CAMERAS;
  }

  async getPreview(cameraId: string): Promise<PreviewSource> {
    if (typeof document === 'undefined') return { type: 'none' };
    let entry = this.canvases.get(cameraId);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      if (typeof canvas.captureStream !== 'function') return { type: 'none' };
      entry = { canvas, stream: canvas.captureStream(24) };
      this.canvases.set(cameraId, entry);
      this.startDrawing();
      if (cameraId === 'cam-1' && config.mockWebcam) {
        getWebcam().then((v) => (this.webcam = v)).catch(() => undefined);
      }
    }
    return { type: 'mediastream', stream: entry.stream };
  }

  private startDrawing() {
    if (this.drawTimer) return;
    const t0 = performance.now();
    this.drawTimer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      this.canvases.forEach(({ canvas }, id) => this.drawCamera(canvas, id, t));
    }, 1000 / 24);
  }

  private drawCamera(canvas: HTMLCanvasElement, id: string, t: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mask = getMask(this.maskId);
    const rec = this.recording !== null;
    const v = this.webcam;
    if (id === 'cam-1' && v && v.videoWidth) {
      // 실제 웹캠 화면 + 브라우저 얼굴 인식으로 가면 합성
      const { width: w, height: h } = canvas;
      const k = Math.max(w / v.videoWidth, h / v.videoHeight);
      const ox = (w - v.videoWidth * k) / 2;
      const oy = (h - v.videoHeight * k) / 2;
      ctx.drawImage(v, ox, oy, v.videoWidth * k, v.videoHeight * k);
      if (mask && this.detector) {
        const poses = this.smoother.next(detectFaces(this.detector, v, v.videoWidth, v.videoHeight));
        poses.forEach((p) => drawMaskOnFace(ctx, mask, { ...p, x: ox + p.x * k, y: oy + p.y * k, eyeDist: p.eyeDist * k }));
      }
      drawOverlay(ctx, w, id, rec, t);
      return;
    }
    drawFakeCamera(canvas, id, t, rec, mask);
  }

  async setMask(maskId: string | null) {
    this.maskId = maskId;
    if (maskId && !this.detector && config.mockWebcam) {
      this.detector = await loadTracker();
    }
  }

  async startRecording(takeId: string, cameraIds: string[]) {
    this.ensureOnline();
    this.recording = { takeId, cameraIds, startedAt: Date.now() };
  }

  async stopRecording(): Promise<RecordingResult> {
    const r = this.recording;
    this.recording = null;
    if (!r) throw new Error('녹화 중이 아닙니다');
    return {
      takeId: r.takeId,
      tracks: r.cameraIds.map((cameraId) => ({ cameraId, uri: `mock://takes/${r.takeId}/${cameraId}.mp4` })),
      audioUri: `mock://takes/${r.takeId}/mix.wav`,
      durationSec: Math.round((Date.now() - r.startedAt) / 1000),
    };
  }

  async setLedSource() {
    /* 모의: LED 출력 없음 */
  }

  // ── 시연용 조작 ─────────────────────────────────────
  simulateRfTag(uid: string) {
    if (this.status === 'online') this.emit({ type: 'rf:tag', uid });
  }

  setOffline(offline: boolean) {
    if (offline) {
      if (this.song) this.endSong(false);
      this.setStatus('offline');
    } else {
      this.setStatus('online');
    }
  }
}

function drawFakeCamera(
  canvas: HTMLCanvasElement,
  id: string,
  t: number,
  rec: boolean,
  mask: ReturnType<typeof getMask>,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const hue = CAM_HUES[id] ?? 260;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue} 55% 14%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 8%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 무대 조명
  const lx = w / 2 + Math.sin(t * 0.7 + hue) * w * 0.28;
  const light = ctx.createRadialGradient(lx, h * 0.15, 10, lx, h * 0.55, h * 0.75);
  light.addColorStop(0, `hsla(${hue} 90% 75% / 0.55)`);
  light.addColorStop(1, 'hsla(0 0% 0% / 0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);

  // 가수 실루엣 (카메라별 각도 차이)
  const offset = id === 'cam-2' ? -70 : id === 'cam-3' ? 70 : 0;
  const sway = Math.sin(t * 2.2) * 6;
  const cx = w / 2 + offset + sway;
  ctx.fillStyle = 'rgba(8,4,18,0.92)';
  ctx.beginPath();
  ctx.arc(cx, h * 0.42, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.9, 95, 120, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx + 28, h * 0.5, 6, 46); // 마이크 스탠드

  // AR 가면 (카메라 각도에 따라 고개 돌림이 다르게 보임)
  if (mask) {
    const yaw = id === 'cam-2' ? 0.5 : id === 'cam-3' ? -0.5 : Math.sin(t * 0.9) * 0.15;
    drawMaskOnFace(ctx, mask, { x: cx, y: h * 0.42 - 4, eyeDist: 27, roll: Math.sin(t * 2.2) * 0.06, yaw });
  }

  // 오디오 미터
  for (let i = 0; i < 24; i++) {
    const v = (Math.sin(t * 9 + i * 0.9) + Math.sin(t * 4.3 + i * 1.7) + 2) / 4;
    ctx.fillStyle = `hsla(${hue} 90% 70% / 0.55)`;
    ctx.fillRect(18 + i * 9, h - 16 - v * 40, 6, v * 40);
  }

  drawOverlay(ctx, w, id, rec, t);
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, id: string, rec: boolean, t: number) {
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(id.toUpperCase(), 18, 32);
  const tc = new Date().toISOString().slice(11, 22);
  ctx.font = '16px monospace';
  ctx.fillText(tc, w - 140, 32);
  if (rec && Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = '#F2243A';
    ctx.beginPath();
    ctx.arc(w - 160, 26, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}
