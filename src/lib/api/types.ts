import type {
  AdSlide, AiJob, Audition, CatalogTab, Genre, MaskOffer, Member, NewsItem, Pricing, RemoteCommand,
  Session, Song, Take, UploadQuota,
} from '@/lib/types';
import type { RecordingResult } from '@/lib/agent/types';

/**
 * MuvisApi — 키오스크가 MUVIS 통합 서버에 요청하는 기능 목록.
 * mock(메모리) / http(실서버) 두 구현이 같은 계약을 따릅니다.
 * 엔드포인트 규격: docs/API_CONTRACT.md
 */

export type ApiErrorCode =
  | 'INSUFFICIENT_POINTS'
  | 'QR_EXPIRED'
  | 'UNKNOWN_CARD'
  | 'SESSION_EXPIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NETWORK'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface LoginQr {
  token: string;
  url: string;
  expiresAt: number;
}

export type LoginQrState =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'approved'; member: Member };

export interface Charged {
  balance: number;
  charged: number;
}

export interface MuvisApi {
  auth: {
    createLoginQr(boothId: string): Promise<LoginQr>;
    pollLoginQr(token: string): Promise<LoginQrState>;
    loginWithRf(uid: string, boothId: string): Promise<Member>;
  };
  wallet: {
    getBalance(memberId: string): Promise<number>;
    getPricing(boothId: string): Promise<Pricing>;
    /** 최초 30분 이용권 결제 + 세션 시작 */
    startSession(memberId: string, boothId: string, idemKey: string): Promise<{ session: Session } & Charged>;
    /** 10분 연장 */
    extendSession(sessionId: string, idemKey: string): Promise<{ session: Session } & Charged>;
    endSession(sessionId: string): Promise<void>;
  };
  catalog: {
    list(tab: CatalogTab, genre?: Genre | null): Promise<Song[]>;
    search(query: string): Promise<Song[]>;
    byNo(no: string): Promise<Song | null>;
  };
  takes: {
    /** 녹화 원본 메타데이터 등록. 원본 파일 업로드는 로컬 에이전트가 담당합니다. */
    register(sessionId: string, song: Song, recording: RecordingResult, cameraCount: number, maskId: string | null): Promise<Take>;
  };
  masks: {
    /** 이 회원이 쓸 수 있는 가면과 가격·보유 여부 */
    list(memberId: string): Promise<MaskOffer[]>;
    /** 프리미엄 가면 구매 (회원 계정에 영구 보관) */
    purchase(memberId: string, maskId: string, idemKey: string): Promise<{ offers: MaskOffer[] } & Charged>;
  };
  ai: {
    createJob(takeId: string, idemKey: string): Promise<AiJob>;
    getJob(jobId: string): Promise<AiJob>;
    regenerate(jobId: string, idemKey: string): Promise<{ job: AiJob } & Charged>;
  };
  uploads: {
    getQuota(memberId: string): Promise<UploadQuota>;
    /** 결과 확정 → 앱(내 뮤직영상)에 업로드. 무료 횟수 초과 시 포인트 차감 */
    publish(jobId: string, idemKey: string): Promise<{ job: AiJob; quota: UploadQuota } & Charged>;
  };
  videos: {
    listMine(memberId: string): Promise<AiJob[]>;
  };
  auditions: {
    list(): Promise<Audition[]>;
    enter(auditionId: string, jobId: string): Promise<Audition>;
  };
  content: {
    news(): Promise<NewsItem[]>;
    ads(): Promise<AdSlide[]>;
  };
  remote: {
    /** 스마트 리모컨 연결용 QR */
    createPairing(sessionId: string): Promise<{ token: string; url: string }>;
    subscribe(sessionId: string, onCommand: (cmd: RemoteCommand) => void): () => void;
  };
}

/** 모의 서버에서만 쓰는 시연용 조작 */
export interface MockApiControls {
  approvePendingQr(): boolean;
  addPoints(memberId: string, amount: number): number;
  failNextJob(): void;
  pushRemote(cmd: RemoteCommand): void;
  readonly demoCardUid: string;
}
