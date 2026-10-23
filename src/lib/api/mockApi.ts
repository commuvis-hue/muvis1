import { MASKS } from '@/lib/ar/masks';
import { config, policy } from '@/lib/config';
import { ALL_SONGS, AI_SONGS, CATALOG } from '@/data/catalog';
import { sampleAds, sampleAuditions, sampleNews } from '@/data/content';
import { matchSong } from '@/lib/hangul';
import { uid } from '@/lib/format';
import type { AiJob, Audition, MaskOffer, Member, Pricing, RemoteCommand, Session, Take, UploadQuota } from '@/lib/types';
import { ApiError } from './types';
import type { Charged, LoginQr, LoginQrState, MockApiControls, MuvisApi } from './types';

const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));

/** 금액은 미확정 — 시연용 가정값 */
const DEMO_PRICING: Pricing = { sessionBase: 5000, extension: 1500, regenerate: 1000, extraUpload: 500 };

/** 프리미엄 가면 가격 (미확정, 시연용) */
const MASK_PRICE = 2000;

const QUEUE_MS = 2000;
const PROCESS_MS = 12000;
const FAIL_AT_MS = 6000;

interface JobRecord {
  job: AiJob;
  startedAt: number;
  willFail: boolean;
}

/**
 * 메모리 위의 모의 MUVIS 서버. 새로고침하면 초기화됩니다.
 * 실제 서버와 같은 규칙(멱등 키, 잔액 부족, 무료 업로드 3회)을 흉내냅니다.
 */
export class MockApi implements MuvisApi, MockApiControls {
  readonly demoCardUid = 'RF-04A1-77C2';
  private members = new Map<string, Member & { points: number; freeUsed: number }>([
    ['m-1001', { id: 'm-1001', nickname: '뮤비스러버', points: 12000, freeUsed: 0 }],
  ]);
  private cards = new Map<string, string>([[this.demoCardUid, 'm-1001']]);
  private qrs = new Map<string, { expiresAt: number; approvedBy?: string }>();
  private sessions = new Map<string, Session>();
  private takeStore = new Map<string, Take & { memberId: string }>();
  private jobs = new Map<string, JobRecord & { memberId: string }>();
  private idem = new Map<string, unknown>();
  private auditionStore: Audition[] = sampleAuditions();
  private failNext = false;
  private ownedMasks = new Map<string, Set<string>>();
  private remoteListeners = new Set<(cmd: RemoteCommand) => void>();

  // ── 시연용 조작 ─────────────────────────────────────
  approvePendingQr() {
    const now = Date.now();
    for (const [, q] of this.qrs) {
      if (!q.approvedBy && q.expiresAt > now) {
        q.approvedBy = 'm-1001';
        return true;
      }
    }
    return false;
  }
  addPoints(memberId: string, amount: number) {
    const m = this.member(memberId);
    m.points += amount;
    return m.points;
  }
  failNextJob() {
    this.failNext = true;
  }
  pushRemote(cmd: RemoteCommand) {
    this.remoteListeners.forEach((l) => l(cmd));
  }

  // ── 내부 도우미 ─────────────────────────────────────
  private member(id: string) {
    const m = this.members.get(id);
    if (!m) throw new ApiError('NOT_FOUND', '회원 정보를 찾을 수 없습니다');
    return m;
  }

  /** 같은 멱등 키로 다시 요청하면 처음 결과를 그대로 돌려줍니다 (중복 결제 방지) */
  private once<T>(key: string, fn: () => T): T {
    if (this.idem.has(key)) return this.idem.get(key) as T;
    const r = fn();
    this.idem.set(key, r);
    return r;
  }

  private charge(memberId: string, amount: number): Charged {
    const m = this.member(memberId);
    if (m.points < amount) {
      throw new ApiError('INSUFFICIENT_POINTS', `M포인트가 부족합니다 (필요 ${amount.toLocaleString()}P, 보유 ${m.points.toLocaleString()}P)`);
    }
    m.points -= amount;
    return { balance: m.points, charged: amount };
  }

  private quota(memberId: string): UploadQuota {
    const m = this.member(memberId);
    return { freeTotal: policy.freeUploads, freeLeft: Math.max(0, policy.freeUploads - m.freeUsed) };
  }

  private snapshot(rec: JobRecord): AiJob {
    const { job } = rec;
    if (job.status === 'done' || job.status === 'failed') return { ...job };
    const elapsed = Date.now() - rec.startedAt;
    if (rec.willFail && elapsed >= FAIL_AT_MS) {
      job.status = 'failed';
      job.error = '카메라 원본 일부를 읽지 못했습니다. 재생성하면 다시 시도합니다.';
    } else if (elapsed < QUEUE_MS) {
      job.status = 'queued';
      job.progress = 0;
    } else if (elapsed < QUEUE_MS + PROCESS_MS) {
      job.status = 'processing';
      job.progress = Math.round(((elapsed - QUEUE_MS) / PROCESS_MS) * 100);
    } else {
      job.status = 'done';
      job.progress = 100;
      const take = this.takeStore.get(job.takeId);
      const long = take?.durationSec ?? 180;
      job.outputs = { short: { durationSec: Math.min(30, long) }, long: { durationSec: long } };
    }
    return { ...job };
  }

  // ── 인증 ────────────────────────────────────────────
  auth = {
    createLoginQr: async (boothId: string): Promise<LoginQr> => {
      await wait();
      const token = uid('qr');
      const expiresAt = Date.now() + 120_000;
      this.qrs.set(token, { expiresAt });
      return { token, expiresAt, url: `${config.mobileWebUrl}/booth/login?b=${encodeURIComponent(boothId)}&t=${token}` };
    },
    pollLoginQr: async (token: string): Promise<LoginQrState> => {
      await wait(80);
      const q = this.qrs.get(token);
      if (!q || q.expiresAt < Date.now()) return { status: 'expired' };
      if (q.approvedBy) {
        const m = this.member(q.approvedBy);
        this.qrs.delete(token);
        return { status: 'approved', member: { id: m.id, nickname: m.nickname } };
      }
      return { status: 'pending' };
    },
    loginWithRf: async (cardUid: string): Promise<Member> => {
      await wait();
      const memberId = this.cards.get(cardUid);
      if (!memberId) throw new ApiError('UNKNOWN_CARD', '등록되지 않은 RF 카드입니다. 앱에서 카드를 먼저 등록해 주세요.');
      const m = this.member(memberId);
      return { id: m.id, nickname: m.nickname };
    },
  };

  // ── 포인트 · 이용권 ─────────────────────────────────
  wallet = {
    getBalance: async (memberId: string) => {
      await wait(100);
      return this.member(memberId).points;
    },
    getPricing: async () => {
      await wait(60);
      return { ...DEMO_PRICING };
    },
    startSession: async (memberId: string, boothId: string, idemKey: string) => {
      await wait(400);
      return this.once(idemKey, () => {
        const charged = this.charge(memberId, DEMO_PRICING.sessionBase);
        const now = Date.now();
        const session: Session = {
          id: uid('ses'), memberId, boothId, startedAt: now,
          endsAt: now + policy.sessionMinutes * 60_000, extensions: 0,
        };
        this.sessions.set(session.id, session);
        return { session: { ...session }, ...charged };
      });
    },
    extendSession: async (sessionId: string, idemKey: string) => {
      await wait(300);
      return this.once(idemKey, () => {
        const s = this.sessions.get(sessionId);
        if (!s) throw new ApiError('SESSION_EXPIRED', '이용 세션이 종료되었습니다');
        const charged = this.charge(s.memberId, DEMO_PRICING.extension);
        s.endsAt = Math.max(s.endsAt, Date.now()) + policy.extendMinutes * 60_000;
        s.extensions += 1;
        return { session: { ...s }, ...charged };
      });
    },
    endSession: async (sessionId: string) => {
      await wait(100);
      this.sessions.delete(sessionId);
      this.remoteListeners.clear();
    },
  };

  // ── 노래책 ──────────────────────────────────────────
  catalog = {
    list: async (tab: 'popular' | 'new' | 'genre' | 'ai', genre?: string | null) => {
      await wait(80);
      switch (tab) {
        case 'popular':
          return CATALOG.filter((s) => s.rank).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        case 'new':
          return ALL_SONGS.filter((s) => s.isNew);
        case 'genre':
          return CATALOG.filter((s) => !genre || s.genre === genre);
        case 'ai':
          return AI_SONGS;
      }
    },
    search: async (query: string) => {
      await wait(60);
      return ALL_SONGS.filter((s) => matchSong(query, s)).slice(0, 60);
    },
    byNo: async (no: string) => {
      await wait(40);
      return ALL_SONGS.find((s) => s.no === no) ?? null;
    },
  };

  // ── 녹화 원본 · AI 편집 ──────────────────────────────
  takes = {
    register: async (
      sessionId: string,
      song: { no: string; title: string; artist: string },
      rec: { takeId: string; durationSec: number },
      cameraCount: number,
      maskId: string | null,
    ) => {
      await wait(200);
      const s = this.sessions.get(sessionId);
      if (!s) throw new ApiError('SESSION_EXPIRED', '이용 세션이 종료되었습니다');
      const take = {
        id: rec.takeId, sessionId, memberId: s.memberId,
        song: { no: song.no, title: song.title, artist: song.artist },
        recordedAt: Date.now(), durationSec: rec.durationSec, cameraCount, maskId,
      };
      this.takeStore.set(take.id, take);
      const { memberId: _omit, ...pub } = take;
      return pub;
    },
  };

  private maskOffers(memberId: string): MaskOffer[] {
    const owned = this.ownedMasks.get(memberId) ?? new Set<string>();
    return MASKS.map((m) => ({
      id: m.id,
      tier: m.tier,
      price: m.tier === 'premium' ? MASK_PRICE : 0,
      owned: m.tier === 'free' || owned.has(m.id),
    }));
  }

  masks = {
    list: async (memberId: string) => {
      await wait(80);
      this.member(memberId);
      return this.maskOffers(memberId);
    },
    purchase: async (memberId: string, maskId: string, idemKey: string) => {
      await wait(350);
      return this.once(idemKey, () => {
        const offer = this.maskOffers(memberId).find((o) => o.id === maskId);
        if (!offer) throw new ApiError('NOT_FOUND', '가면을 찾을 수 없습니다');
        if (offer.owned) throw new ApiError('CONFLICT', '이미 가지고 있는 가면입니다');
        const charged = this.charge(memberId, offer.price);
        const set = this.ownedMasks.get(memberId) ?? new Set<string>();
        set.add(maskId);
        this.ownedMasks.set(memberId, set);
        return { offers: this.maskOffers(memberId), ...charged };
      });
    },
  };

  ai = {
    createJob: async (takeId: string, idemKey: string) => {
      await wait(250);
      return this.once(idemKey, () => {
        const take = this.takeStore.get(takeId);
        if (!take) throw new ApiError('NOT_FOUND', '녹화 원본을 찾을 수 없습니다');
        const job: AiJob = {
          id: uid('job'), takeId, song: { title: take.song.title, artist: take.song.artist },
          status: 'queued', progress: 0, attempt: 1, createdAt: Date.now(), published: false,
        };
        const rec = { job, startedAt: Date.now(), willFail: this.failNext, memberId: take.memberId };
        this.failNext = false;
        this.jobs.set(job.id, rec);
        return this.snapshot(rec);
      });
    },
    getJob: async (jobId: string) => {
      await wait(60);
      const rec = this.jobs.get(jobId);
      if (!rec) throw new ApiError('NOT_FOUND', '작업을 찾을 수 없습니다');
      return this.snapshot(rec);
    },
    regenerate: async (jobId: string, idemKey: string) => {
      await wait(300);
      return this.once(idemKey, () => {
        const rec = this.jobs.get(jobId);
        if (!rec) throw new ApiError('NOT_FOUND', '작업을 찾을 수 없습니다');
        if (rec.job.published) throw new ApiError('CONFLICT', '이미 업로드한 영상은 재생성할 수 없습니다');
        // 편집 실패 건은 무료 재시도, 정상 완료 건의 재생성만 차감
        const failed = this.snapshot(rec).status === 'failed';
        const charged = failed
          ? { balance: this.member(rec.memberId).points, charged: 0 }
          : this.charge(rec.memberId, DEMO_PRICING.regenerate);
        rec.job = { ...rec.job, status: 'queued', progress: 0, attempt: rec.job.attempt + 1, outputs: undefined, error: undefined };
        rec.startedAt = Date.now();
        rec.willFail = this.failNext;
        this.failNext = false;
        return { job: this.snapshot(rec), ...charged };
      });
    },
  };

  uploads = {
    getQuota: async (memberId: string) => {
      await wait(60);
      return this.quota(memberId);
    },
    publish: async (jobId: string, idemKey: string) => {
      await wait(500);
      return this.once(idemKey, () => {
        const rec = this.jobs.get(jobId);
        if (!rec) throw new ApiError('NOT_FOUND', '작업을 찾을 수 없습니다');
        const job = this.snapshot(rec);
        if (job.status !== 'done') throw new ApiError('CONFLICT', '아직 영상이 완성되지 않았습니다');
        if (job.published) throw new ApiError('CONFLICT', '이미 업로드한 영상입니다');
        const m = this.member(rec.memberId);
        let charged: Charged = { balance: m.points, charged: 0 };
        if (m.freeUsed < policy.freeUploads) m.freeUsed += 1;
        else charged = this.charge(rec.memberId, DEMO_PRICING.extraUpload);
        rec.job.published = true;
        return { job: { ...rec.job }, quota: this.quota(rec.memberId), ...charged };
      });
    },
  };

  videos = {
    listMine: async (memberId: string) => {
      await wait(120);
      return [...this.jobs.values()]
        .filter((r) => r.memberId === memberId)
        .map((r) => this.snapshot(r))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
  };

  auditions = {
    list: async () => {
      await wait(120);
      return this.auditionStore.map((a) => ({ ...a }));
    },
    enter: async (auditionId: string, jobId: string) => {
      await wait(300);
      const a = this.auditionStore.find((x) => x.id === auditionId);
      if (!a) throw new ApiError('NOT_FOUND', '오디션을 찾을 수 없습니다');
      if (a.enteredVideoJobId) throw new ApiError('CONFLICT', '이미 참가한 오디션입니다');
      const rec = this.jobs.get(jobId);
      if (!rec?.job.published) throw new ApiError('CONFLICT', '업로드를 마친 영상만 참가할 수 있습니다');
      a.enteredVideoJobId = jobId;
      return { ...a };
    },
  };

  content = {
    news: async () => sampleNews,
    ads: async () => sampleAds,
  };

  remote = {
    createPairing: async (sessionId: string) => {
      await wait();
      const token = uid('rc');
      return { token, url: `${config.mobileWebUrl}/remote?s=${sessionId}&t=${token}` };
    },
    subscribe: (_sessionId: string, onCommand: (cmd: RemoteCommand) => void) => {
      this.remoteListeners.add(onCommand);
      return () => {
        this.remoteListeners.delete(onCommand);
      };
    },
  };
}
