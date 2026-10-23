import type { RecordingResult } from '@/lib/agent/types';
import type { CatalogTab, Genre, RemoteCommand, Song } from '@/lib/types';
import { ApiError } from './types';
import type { ApiErrorCode, MuvisApi } from './types';

/**
 * 실제 MUVIS 통합 서버용 구현. 경로·응답 형식은 docs/API_CONTRACT.md 와 같습니다.
 * 서버가 준비되면 NEXT_PUBLIC_API_MODE=http 로 전환하세요.
 *
 * 인증: 부스 기기 토큰(Bearer)은 기기 설치 시 발급해 로컬 에이전트가 보관하고,
 * 운영에서는 /api/booth-token 같은 서버 라우트를 통해 받아오도록 바꾸는 것을 권장합니다.
 */
export class HttpApi implements MuvisApi {
  private boothToken: string | null = null;

  constructor(private readonly base: string) {}

  setBoothToken(token: string) {
    this.boothToken = token;
  }

  private async req<T>(method: string, path: string, body?: unknown, idemKey?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.boothToken) headers.Authorization = `Bearer ${this.boothToken}`;
    if (idemKey) headers['Idempotency-Key'] = idemKey;
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError('NETWORK', '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (data?.error?.code as ApiErrorCode) ?? 'UNKNOWN';
      throw new ApiError(code, data?.error?.message ?? `요청 실패 (${res.status})`);
    }
    return data as T;
  }

  auth: MuvisApi['auth'] = {
    createLoginQr: (boothId) => this.req('POST', '/booth/login-qr', { boothId }),
    pollLoginQr: (token) => this.req('GET', `/booth/login-qr/${encodeURIComponent(token)}`),
    loginWithRf: (uid, boothId) => this.req('POST', '/booth/rf-login', { uid, boothId }),
  };

  wallet: MuvisApi['wallet'] = {
    getBalance: async (memberId) => (await this.req<{ balance: number }>('GET', `/members/${memberId}/balance`)).balance,
    getPricing: (boothId) => this.req('GET', `/booths/${encodeURIComponent(boothId)}/pricing`),
    startSession: (memberId, boothId, idemKey) => this.req('POST', '/sessions', { memberId, boothId }, idemKey),
    extendSession: (sessionId, idemKey) => this.req('POST', `/sessions/${sessionId}/extend`, {}, idemKey),
    endSession: (sessionId) => this.req('POST', `/sessions/${sessionId}/end`),
  };

  catalog: MuvisApi['catalog'] = {
    list: (tab: CatalogTab, genre?: Genre | null) =>
      this.req('GET', `/catalog?tab=${tab}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`),
    search: (q: string) => this.req('GET', `/catalog/search?q=${encodeURIComponent(q)}`),
    byNo: (no: string) => this.req<Song | null>('GET', `/catalog/${encodeURIComponent(no)}`).catch(() => null),
  };

  takes: MuvisApi['takes'] = {
    register: (sessionId: string, song: Song, recording: RecordingResult, cameraCount: number, maskId: string | null) =>
      this.req('POST', '/takes', { sessionId, songNo: song.no, recording, cameraCount, maskId }),
  };

  masks: MuvisApi['masks'] = {
    list: (memberId) => this.req('GET', `/members/${memberId}/masks`),
    purchase: (memberId, maskId, idemKey) => this.req('POST', `/members/${memberId}/masks/${maskId}/purchase`, {}, idemKey),
  };

  ai: MuvisApi['ai'] = {
    createJob: (takeId, idemKey) => this.req('POST', '/ai-jobs', { takeId, formats: ['short', 'long'] }, idemKey),
    getJob: (jobId) => this.req('GET', `/ai-jobs/${jobId}`),
    regenerate: (jobId, idemKey) => this.req('POST', `/ai-jobs/${jobId}/regenerate`, {}, idemKey),
  };

  uploads: MuvisApi['uploads'] = {
    getQuota: (memberId) => this.req('GET', `/members/${memberId}/upload-quota`),
    publish: (jobId, idemKey) => this.req('POST', `/ai-jobs/${jobId}/publish`, {}, idemKey),
  };

  videos: MuvisApi['videos'] = {
    listMine: (memberId) => this.req('GET', `/members/${memberId}/videos`),
  };

  auditions: MuvisApi['auditions'] = {
    list: () => this.req('GET', '/auditions?open=true'),
    enter: (auditionId, jobId) => this.req('POST', `/auditions/${auditionId}/entries`, { jobId }),
  };

  content: MuvisApi['content'] = {
    news: () => this.req('GET', '/content/news'),
    ads: () => this.req('GET', '/content/ads?placement=kiosk'),
  };

  remote: MuvisApi['remote'] = {
    createPairing: (sessionId) => this.req('POST', `/sessions/${sessionId}/remote-pairing`),
    /**
     * Vercel 서버리스는 상시 WebSocket을 유지하지 못하므로, 운영에서는
     * Supabase Realtime·Ably 등 실시간 서비스 채널(session:{id})을 구독하도록 교체합니다.
     * 여기서는 서버가 SSE를 제공한다고 가정한 기본 구현입니다.
     */
    subscribe: (sessionId: string, onCommand: (cmd: RemoteCommand) => void) => {
      if (typeof EventSource === 'undefined') return () => {};
      const es = new EventSource(`${this.base}/sessions/${sessionId}/remote-events`);
      es.onmessage = (ev) => {
        try {
          onCommand(JSON.parse(ev.data) as RemoteCommand);
        } catch {
          /* 잘못된 메시지 무시 */
        }
      };
      return () => es.close();
    },
  };
}
