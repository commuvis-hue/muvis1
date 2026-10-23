// ── MUVIS 도메인 타입 (서버·에이전트·화면이 공유) ──────────────

export type Genre = '발라드' | '댄스' | '힙합' | '록' | '트로트' | 'R&B' | '인디';
export const GENRES: Genre[] = ['발라드', '댄스', '힙합', '록', '트로트', 'R&B', '인디'];

export type CatalogTab = 'popular' | 'new' | 'genre' | 'ai';

export interface Song {
  /** 반주기 곡 번호 (AI 음원은 MUVIS 자체 번호) */
  no: string;
  title: string;
  artist: string;
  genre: Genre;
  durationSec: number;
  source: 'accompanist' | 'ai';
  rank?: number;
  isNew?: boolean;
}

export interface Member {
  id: string;
  nickname: string;
}

export interface Session {
  id: string;
  memberId: string;
  boothId: string;
  startedAt: number;
  endsAt: number;
  extensions: number;
}

/** 금액은 미확정이므로 서버가 내려줍니다. 단위: M포인트 */
export interface Pricing {
  sessionBase: number;
  extension: number;
  regenerate: number;
  extraUpload: number;
}

export interface UploadQuota {
  freeLeft: number;
  freeTotal: number;
}

export type BoothMode = 'xr' | 'just';

export type MaskTier = 'free' | 'premium';

/** 서버가 알려주는 가면 판매 정보 (모양은 클라이언트 카탈로그 src/lib/ar/masks.ts) */
export interface MaskOffer {
  id: string;
  tier: MaskTier;
  price: number;
  owned: boolean;
}

export interface Take {
  id: string;
  sessionId: string;
  song: Pick<Song, 'no' | 'title' | 'artist'>;
  recordedAt: number;
  durationSec: number;
  cameraCount: number;
  /** 녹화 중 쓴 AR 가면. AI 편집 서버가 모든 앵글에 같은 가면을 합성합니다. */
  maskId: string | null;
}

export type VideoFormat = 'short' | 'long';
export type AiJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface AiOutput {
  /** 실제 서버는 재생 가능한 URL을 내려줍니다. 모의 모드에서는 비어 있습니다. */
  url?: string;
  posterUrl?: string;
  durationSec: number;
}

export interface AiJob {
  id: string;
  takeId: string;
  song: Pick<Song, 'title' | 'artist'>;
  status: AiJobStatus;
  progress: number; // 0~100
  attempt: number; // 1 = 최초 생성, 2+ = 재생성
  createdAt: number;
  outputs?: Partial<Record<VideoFormat, AiOutput>>;
  error?: string;
  published: boolean;
}

export interface Audition {
  id: string;
  title: string;
  host: string;
  endsAt: number;
  description: string;
  enteredVideoJobId?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  body: string;
}

export interface AdSlide {
  id: string;
  headline: string;
  sub: string;
  tone: 'red' | 'amber' | 'cyan';
}

/** 스마트 리모컨(모바일 웹/앱)에서 서버를 거쳐 들어오는 명령 */
export type RemoteCommand =
  | { type: 'reserve'; songNo: string; priority?: boolean }
  | { type: 'start'; songNo: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'skipInterlude' };
