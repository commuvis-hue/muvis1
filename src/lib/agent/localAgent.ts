import type {
  AgentEvent, AgentStatus, CameraInfo, DeviceAgent, MixerSettings, PlayOptions, PreviewSource, RecordingResult,
} from './types';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/**
 * 기기에 설치된 로컬 에이전트와 WebSocket(JSON-RPC 형식)으로 통신합니다.
 *   요청  → { id, method, params }
 *   응답  ← { id, result } | { id, error: { message } }
 *   이벤트 ← { event, data }
 * 상세 규격: docs/AGENT_PROTOCOL.md
 */
export class LocalAgent implements DeviceAgent {
  readonly kind = 'local' as const;
  private ws: WebSocket | null = null;
  private status: AgentStatus = 'connecting';
  private listeners = new Set<(e: AgentEvent) => void>();
  private pending = new Map<number, Pending>();
  private seq = 0;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  constructor(private readonly url: string) {}

  private get httpBase() {
    return this.url.replace(/^ws/, 'http').replace(/\/$/, '');
  }

  connect() {
    if (typeof WebSocket === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.closedByUser = false;
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('online');
    };
    ws.onmessage = (ev) => this.handleMessage(String(ev.data));
    ws.onclose = () => {
      this.ws = null;
      this.failAll('에이전트 연결이 끊겼습니다');
      if (this.closedByUser) return;
      this.setStatus('offline');
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.closedByUser = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
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

  private setStatus(s: AgentStatus) {
    this.status = s;
    this.listeners.forEach((l) => l({ type: 'status', status: s }));
  }

  private handleMessage(raw: string) {
    let msg: { id?: number; result?: unknown; error?: { message: string }; event?: string; data?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.event) {
      const e = { type: msg.event, ...(msg.data ?? {}) } as AgentEvent;
      this.listeners.forEach((l) => l(e));
    }
  }

  private failAll(reason: string) {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    });
    this.pending.clear();
  }

  private call<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('장비가 연결되어 있지 않습니다'));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 응답 시간 초과`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  playSong(opts: PlayOptions) {
    return this.call<void>('accompanist.play', { songNo: opts.songNo });
  }
  pauseSong() {
    return this.call<void>('accompanist.pause');
  }
  resumeSong() {
    return this.call<void>('accompanist.resume');
  }
  stopSong() {
    return this.call<void>('accompanist.stop');
  }
  skipInterlude() {
    return this.call<void>('accompanist.skipInterlude');
  }
  setKey(semitones: number) {
    return this.call<void>('accompanist.setKey', { semitones });
  }
  setMixer(settings: MixerSettings) {
    return this.call<void>('mixer.set', { ...settings });
  }
  listCameras() {
    return this.call<CameraInfo[]>('camera.list');
  }
  async getPreview(cameraId: string): Promise<PreviewSource> {
    return { type: 'mjpeg', url: `${this.httpBase}/preview/${encodeURIComponent(cameraId)}.mjpg` };
  }
  startRecording(takeId: string, cameraIds: string[], opts?: { maskId?: string | null }) {
    return this.call<void>('recorder.start', { takeId, cameraIds, maskId: opts?.maskId ?? null }, 15_000);
  }
  setMask(maskId: string | null) {
    return this.call<void>('ar.setMask', { maskId });
  }
  stopRecording() {
    return this.call<RecordingResult>('recorder.stop', {}, 30_000);
  }
  setLedSource(source: string) {
    return this.call<void>('led.setSource', { source });
  }
}
