'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from 'react';
import { createAgent } from '@/lib/agent';
import type { AgentEvent, AgentStatus, CameraInfo, DeviceAgent } from '@/lib/agent';
import { ApiError, createApi } from '@/lib/api';
import type { MuvisApi } from '@/lib/api';
import { getMask } from '@/lib/ar/masks';
import { config, policy } from '@/lib/config';
import { idempotencyKey, pts, uid } from '@/lib/format';
import type {
  AiJob, BoothMode, CatalogTab, Genre, MaskOffer, Member, Pricing, RemoteCommand, Session, Song, Take, UploadQuota,
} from '@/lib/types';

// ── 화면 상태 (FSM) ──────────────────────────────────────

export type ScreenName =
  | 'attract' // 대기화면 (광고)
  | 'login' // QR · RF 인증
  | 'payment' // 30분 이용권 결제
  | 'mode' // XR 스튜디오 / JUST 노래방
  | 'mask' // AR 가면 고르기 · 착용 미리보기
  | 'browse' // 선곡 (인기곡·신곡·장르별·AI 음원·검색)
  | 'countdown'
  | 'performing'
  | 'afterSong' // AI 뮤직비디오 제작 여부
  | 'aiStatus' // AI 편집 진행
  | 'aiPreview' // 결과 미리보기 · 업로드 · 재생성
  | 'myVideos'
  | 'audition'
  | 'ads'
  | 'news'
  | 'sessionEnd';

/** 이용 중이 아니어도 볼 수 있는 화면 */
const PUBLIC_SCREENS: ScreenName[] = ['attract', 'login', 'payment', 'ads', 'news', 'sessionEnd'];
/** 노래·결정 진행 중에는 메뉴 이동을 막는 화면 */
export const LOCKED_SCREENS: ScreenName[] = ['countdown', 'performing', 'afterSong', 'sessionEnd', 'login', 'payment'];

export interface NowPlaying {
  song: Song;
  positionSec: number;
  durationSec: number;
  paused: boolean;
  takeId: string | null;
}

export interface KioskState {
  screen: ScreenName;
  history: ScreenName[];
  boothId: string;
  agentStatus: AgentStatus;
  cameras: CameraInfo[];
  ledSource: string;
  member: Member | null;
  points: number;
  pricing: Pricing | null;
  quota: UploadQuota | null;
  session: Session | null;
  mode: BoothMode | null;
  catalogTab: CatalogTab;
  genre: Genre | null;
  queue: Song[];
  pendingSong: Song | null;
  nowPlaying: NowPlaying | null;
  pendingTake: Take | null;
  jobs: AiJob[];
  focusJobId: string | null;
  busy: string | null;
  endAfterSong: boolean;
  songsSung: number;
  maskId: string | null;
  maskOffers: MaskOffer[];
  /** 이번 이용에서 가면 고르기 화면을 이미 보여줬는지 */
  maskPrompted: boolean;
}

const initialState = (boothId: string): KioskState => ({
  screen: 'attract',
  history: [],
  boothId,
  agentStatus: 'connecting',
  cameras: [],
  ledSource: 'auto',
  member: null,
  points: 0,
  pricing: null,
  quota: null,
  session: null,
  mode: null,
  catalogTab: 'popular',
  genre: null,
  queue: [],
  pendingSong: null,
  nowPlaying: null,
  pendingTake: null,
  jobs: [],
  focusJobId: null,
  busy: null,
  endAfterSong: false,
  songsSung: 0,
  maskId: null,
  maskOffers: [],
  maskPrompted: false,
});

type Action =
  | { type: 'go'; screen: ScreenName; replace?: boolean }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'reset' }
  | { type: 'patch'; patch: Partial<KioskState> }
  | { type: 'jobUpsert'; job: AiJob }
  | { type: 'jobsMerge'; jobs: AiJob[] }
  | { type: 'queueAdd'; song: Song; priority?: boolean }
  | { type: 'queueRemove'; index: number }
  | { type: 'queueShift' }
  | { type: 'progress'; positionSec: number; durationSec: number };

function reducer(state: KioskState, a: Action): KioskState {
  switch (a.type) {
    case 'go': {
      if (a.screen === state.screen) return state;
      const history = a.replace ? state.history : [...state.history, state.screen].slice(-20);
      return { ...state, screen: a.screen, history };
    }
    case 'back': {
      const history = [...state.history];
      let prev = history.pop();
      while (prev && LOCKED_SCREENS.includes(prev)) prev = history.pop();
      if (!prev) return reducer(state, { type: 'home' });
      if (!state.session && !PUBLIC_SCREENS.includes(prev)) prev = 'attract';
      return { ...state, screen: prev, history };
    }
    case 'home':
      return { ...state, screen: state.session ? (state.mode ? 'browse' : 'mode') : 'attract', history: [] };
    case 'reset':
      return {
        ...initialState(state.boothId),
        agentStatus: state.agentStatus,
        cameras: state.cameras,
      };
    case 'patch':
      return { ...state, ...a.patch };
    case 'jobUpsert': {
      const exists = state.jobs.some((j) => j.id === a.job.id);
      return {
        ...state,
        jobs: exists ? state.jobs.map((j) => (j.id === a.job.id ? a.job : j)) : [a.job, ...state.jobs],
      };
    }
    case 'jobsMerge': {
      const map = new Map(state.jobs.map((j) => [j.id, j]));
      a.jobs.forEach((j) => map.set(j.id, j));
      return { ...state, jobs: [...map.values()].sort((x, y) => y.createdAt - x.createdAt) };
    }
    case 'queueAdd':
      return { ...state, queue: a.priority ? [a.song, ...state.queue] : [...state.queue, a.song] };
    case 'queueRemove':
      return { ...state, queue: state.queue.filter((_, i) => i !== a.index) };
    case 'queueShift':
      return { ...state, queue: state.queue.slice(1) };
    case 'progress':
      if (!state.nowPlaying) return state;
      return { ...state, nowPlaying: { ...state.nowPlaying, positionSec: a.positionSec, durationSec: a.durationSec } };
  }
}

// ── 알림 · 확인창 ────────────────────────────────────────

export interface Toast {
  id: string;
  text: string;
  tone: 'info' | 'ok' | 'warn' | 'error';
}

export interface DialogSpec {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'charge' | 'danger';
  /** 포인트 차감 등 명시적 동의가 필요한 경우 체크박스 문구 */
  consent?: string;
}

export type Overlay = 'remote' | 'dev' | null;

// ── 컨텍스트 ─────────────────────────────────────────────

interface KioskContextValue {
  state: KioskState;
  now: number;
  api: MuvisApi;
  agent: DeviceAgent;
  toasts: Toast[];
  dialog: DialogSpec | null;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  resolveDialog: (ok: boolean) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  actions: ReturnType<typeof useActions>;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error('useKiosk must be used inside <KioskProvider>');
  return ctx;
}

export function remainingMs(state: KioskState, now: number) {
  return state.session ? Math.max(0, state.session.endsAt - now) : 0;
}

// ── 동작 (비동기 흐름) ────────────────────────────────────

function useActions(deps: {
  api: MuvisApi;
  agent: DeviceAgent;
  dispatch: (a: Action) => void;
  get: () => KioskState;
  toast: (text: string, tone?: Toast['tone']) => void;
  confirm: (spec: DialogSpec) => Promise<boolean>;
}) {
  const { api, agent, dispatch, get, toast, confirm } = deps;
  const finishing = useRef(false);
  const payKey = useRef<string | null>(null);
  const remoteUnsub = useRef<(() => void) | null>(null);
  const warned = useRef(false);
  /** 사용자가 노래 중 '이용 종료'를 누른 경우 — 렌더 전에도 바로 읽히도록 ref로 보관 */
  const forceEnd = useRef(false);

  const patch = (p: Partial<KioskState>) => dispatch({ type: 'patch', patch: p });
  const go = (screen: ScreenName, replace = false) => dispatch({ type: 'go', screen, replace });

  const fail = (e: unknown, fallback = '처리 중 문제가 발생했습니다') => {
    patch({ busy: null });
    toast(e instanceof Error && e.message ? e.message : fallback, 'error');
  };

  const actions = {
    go,
    back: () => dispatch({ type: 'back' }),
    home: () => dispatch({ type: 'home' }),
    setTab: (tab: CatalogTab, genre: Genre | null = null) => {
      patch({ catalogTab: tab, genre });
      if (get().screen !== 'browse') go('browse');
    },

    // ── 인증 · 결제 ──
    async loginSuccess(member: Member) {
      patch({ member, busy: '회원 정보를 불러오는 중' });
      try {
        const st = get();
        const [points, pricing, quota, maskOffers] = await Promise.all([
          api.wallet.getBalance(member.id),
          api.wallet.getPricing(st.boothId),
          api.uploads.getQuota(member.id),
          api.masks.list(member.id).catch(() => [] as MaskOffer[]),
        ]);
        payKey.current = idempotencyKey();
        patch({ points, pricing, quota, maskOffers, busy: null });
        go('payment', true);
      } catch (e) {
        fail(e);
        dispatch({ type: 'reset' });
      }
    },

    async rfLogin(cardUid: string) {
      patch({ busy: 'RF 카드 확인 중' });
      try {
        const member = await api.auth.loginWithRf(cardUid, get().boothId);
        await actions.loginSuccess(member);
      } catch (e) {
        fail(e);
      }
    },

    async refreshBalance() {
      const m = get().member;
      if (!m) return;
      try {
        patch({ points: await api.wallet.getBalance(m.id) });
      } catch (e) {
        fail(e);
      }
    },

    async pay() {
      const st = get();
      if (!st.member) return;
      payKey.current ??= idempotencyKey();
      patch({ busy: '결제하는 중' });
      try {
        const r = await api.wallet.startSession(st.member.id, st.boothId, payKey.current);
        payKey.current = null;
        warned.current = false;
        patch({ session: r.session, points: r.balance, busy: null, history: [] });
        remoteUnsub.current?.();
        remoteUnsub.current = api.remote.subscribe(r.session.id, (cmd) => actions.onRemote(cmd));
        toast(`${pts(r.charged)} 결제 완료. 30분 이용을 시작합니다`, 'ok');
        go('mode', true);
      } catch (e) {
        fail(e);
      }
    },

    cancelLogin() {
      dispatch({ type: 'reset' });
    },

    chooseMode(mode: BoothMode) {
      const first = !get().maskPrompted;
      patch({ mode, maskPrompted: true });
      dispatch({ type: 'home' });
      // 처음 모드를 고른 직후에는 가면 고르기를 보여줍니다 (BACK → 선곡)
      if (first) go('mask');
    },

    // ── AR 가면 ──
    async selectMask(maskId: string | null) {
      const st = get();
      if (maskId) {
        const offer = st.maskOffers.find((o) => o.id === maskId);
        const def = getMask(maskId);
        if (!offer || !def || !st.member) return false;
        if (!offer.owned) {
          const ok = await confirm({
            title: `‘${def.name}’ 가면을 살까요?`,
            body: `프리미엄 가면은 한 번 사면 계정에 저장되어 다른 부스에서도 쓸 수 있어요. 현재 잔액 ${pts(st.points)}`,
            confirmLabel: `${pts(offer.price)} 결제하고 쓰기`,
            tone: 'charge',
            consent: `가면 구매에 M포인트 ${pts(offer.price)}가 차감되는 것에 동의합니다`,
          });
          if (!ok) return false;
          patch({ busy: '가면 구매 중' });
          try {
            const r = await api.masks.purchase(st.member.id, maskId, idempotencyKey());
            patch({ maskOffers: r.offers, points: r.balance, busy: null });
          } catch (e) {
            fail(e);
            return false;
          }
        }
        toast(`‘${def.name}’ 가면을 썼습니다`, 'ok');
      } else if (st.maskId) {
        toast('가면을 벗었습니다', 'info');
      }
      patch({ maskId });
      await agent.setMask(maskId).catch(() => undefined);
      return true;
    },

    async extend() {
      const st = get();
      if (!st.session || !st.pricing) return;
      const ok = await confirm({
        title: `${policy.extendMinutes}분 연장할까요?`,
        body: `M포인트 ${pts(st.pricing.extension)}가 차감됩니다. 현재 잔액 ${pts(st.points)}`,
        confirmLabel: `${pts(st.pricing.extension)} 결제하고 연장`,
        tone: 'charge',
      });
      if (!ok) return;
      patch({ busy: '연장 결제 중' });
      try {
        const r = await api.wallet.extendSession(st.session.id, idempotencyKey());
        warned.current = false;
        patch({ session: r.session, points: r.balance, busy: null, endAfterSong: false });
        toast(`${policy.extendMinutes}분 연장했습니다`, 'ok');
      } catch (e) {
        fail(e);
      }
    },

    async endByUser() {
      const st = get();
      if (!st.session) return;
      const ok = await confirm({
        title: '이용을 종료할까요?',
        body: '남은 시간은 환불되지 않습니다. 만들고 있는 뮤직비디오는 완성되면 앱에서 볼 수 있어요.',
        confirmLabel: '이용 종료',
        tone: 'danger',
      });
      if (!ok) return;
      if (get().nowPlaying) {
        forceEnd.current = true;
        patch({ endAfterSong: true });
        await agent.stopSong().catch(() => undefined);
      } else {
        await actions.expireSession();
      }
    },

    async expireSession() {
      const st = get();
      if (!st.session) return;
      forceEnd.current = false;
      remoteUnsub.current?.();
      remoteUnsub.current = null;
      void agent.setMask(null).catch(() => undefined);
      await api.wallet.endSession(st.session.id).catch(() => undefined);
      patch({ session: null, queue: [], pendingSong: null, pendingTake: null, endAfterSong: false, busy: null, history: [] });
      go('sessionEnd', true);
    },

    resetToAttract() {
      forceEnd.current = false;
      void agent.setMask(null).catch(() => undefined);
      remoteUnsub.current?.();
      remoteUnsub.current = null;
      dispatch({ type: 'reset' });
    },

    /** 1초마다 호출: 종료 안내와 시간 만료 처리 */
    tick(now: number) {
      const st = get();
      if (!st.session) return;
      const left = st.session.endsAt - now;
      if (left > 0 && left <= policy.warnBeforeMinutes * 60_000 && !warned.current) {
        warned.current = true;
        toast(`이용 시간이 ${policy.warnBeforeMinutes}분 남았습니다. 상단의 +${policy.extendMinutes}분으로 연장할 수 있어요`, 'warn');
      }
      if (left > 0) return;
      const inFlow: ScreenName[] = ['countdown', 'performing', 'afterSong', 'aiStatus', 'aiPreview'];
      if (st.nowPlaying || inFlow.includes(st.screen)) {
        if (!st.endAfterSong) {
          patch({ endAfterSong: true });
          toast('이용 시간이 끝났습니다. 지금 진행 중인 곡과 영상 작업까지만 이어집니다', 'warn');
        }
      } else if (!st.busy) {
        void actions.expireSession();
      }
    },

    // ── 선곡 · 반주 ──
    requestSong(song: Song, how: 'start' | 'reserve' | 'priority') {
      const st = get();
      if (!st.session) return;
      if (how !== 'start' || st.nowPlaying || st.pendingSong) {
        dispatch({ type: 'queueAdd', song, priority: how === 'priority' });
        toast(
          how === 'start'
            ? `노래가 진행 중이라 예약했습니다: ${song.title}`
            : `${how === 'priority' ? '우선 ' : ''}예약했습니다: ${song.title}`,
          'ok',
        );
        return;
      }
      if (st.endAfterSong || st.session.endsAt <= Date.now()) {
        toast('이용 시간이 끝나 새 곡을 시작할 수 없습니다', 'warn');
        return;
      }
      if (st.agentStatus !== 'online') {
        toast('반주기와 연결되어 있지 않습니다. 직원을 불러 주세요', 'error');
        return;
      }
      patch({ pendingSong: song });
      go('countdown', true);
    },

    removeFromQueue(index: number) {
      dispatch({ type: 'queueRemove', index });
    },

    async beginPerformance() {
      const st = get();
      const song = st.pendingSong;
      if (!song) return;
      let takeId: string | null = null;
      try {
        if (st.mode === 'xr') {
          takeId = uid('take');
          await agent.startRecording(takeId, st.cameras.map((c) => c.id), { maskId: st.maskId });
        }
        patch({
          pendingSong: null,
          nowPlaying: { song, positionSec: 0, durationSec: song.durationSec, paused: false, takeId },
        });
        go('performing', true);
        await agent.playSong({ songNo: song.no, durationSec: song.durationSec });
      } catch (e) {
        if (takeId) await agent.stopRecording().catch(() => undefined);
        patch({ nowPlaying: null, pendingSong: null });
        fail(e, '반주를 시작하지 못했습니다');
        dispatch({ type: 'home' });
      }
    },

    async togglePause() {
      const np = get().nowPlaying;
      if (!np) return;
      try {
        if (np.paused) await agent.resumeSong();
        else await agent.pauseSong();
        patch({ nowPlaying: { ...np, paused: !np.paused } });
      } catch (e) {
        fail(e);
      }
    },

    async skipInterlude() {
      await agent.skipInterlude().catch((e) => fail(e));
    },

    async stopSong() {
      const st = get();
      if (!st.nowPlaying) return;
      if (st.mode === 'xr') {
        const ok = await confirm({
          title: '노래를 멈출까요?',
          body: '끝까지 부르지 않은 곡은 뮤직비디오로 만들 수 없습니다.',
          confirmLabel: '멈추기',
          cancelLabel: '계속 부르기',
          tone: 'danger',
        });
        if (!ok) return;
      }
      await agent.stopSong().catch((e) => fail(e));
    },

    async setLed(source: string) {
      patch({ ledSource: source });
      await agent.setLedSource(source).catch(() => undefined);
    },

    async finishSong(completed: boolean) {
      const st = get();
      const np = st.nowPlaying;
      if (!np || finishing.current) return;
      finishing.current = true;
      patch({ nowPlaying: null, songsSung: st.songsSung + 1 });
      try {
        let rec = null;
        if (np.takeId) {
          rec = await agent.stopRecording().catch((e) => {
            fail(e, '녹화를 저장하지 못했습니다');
            return null;
          });
        }
        if (st.mode === 'xr' && rec && completed && st.session) {
          patch({ busy: '녹화 원본을 저장하는 중' });
          const take = await api.takes.register(st.session.id, np.song, rec, rec.tracks.length, st.maskId);
          patch({ pendingTake: take, busy: null });
          go('afterSong', true);
        } else {
          if (st.mode === 'xr' && !completed) toast('끝까지 부른 곡만 뮤직비디오로 만들 수 있어요', 'info');
          await actions.proceed();
        }
      } catch (e) {
        fail(e);
        await actions.proceed();
      } finally {
        finishing.current = false;
      }
    },

    /** 한 곡이 끝난 뒤: 시간 만료 → 종료 / 예약곡 → 다음 곡 / 없으면 선곡 화면 */
    async proceed() {
      const st = get();
      if (!st.session) return;
      if (forceEnd.current || st.endAfterSong || st.session.endsAt <= Date.now()) {
        await actions.expireSession();
        return;
      }
      const next = st.queue[0];
      if (next) {
        dispatch({ type: 'queueShift' });
        patch({ pendingSong: next });
        go('countdown', true);
      } else {
        dispatch({ type: 'home' });
      }
    },

    // ── AI 뮤직비디오 ──
    async makeMusicVideo() {
      const take = get().pendingTake;
      if (!take) return;
      patch({ busy: 'AI 편집을 요청하는 중' });
      try {
        const job = await api.ai.createJob(take.id, idempotencyKey());
        dispatch({ type: 'jobUpsert', job });
        patch({ pendingTake: null, focusJobId: job.id, busy: null });
        go('aiStatus', true);
      } catch (e) {
        fail(e);
      }
    },

    async skipMusicVideo() {
      patch({ pendingTake: null });
      await actions.proceed();
    },

    openJob(jobId: string) {
      const job = get().jobs.find((j) => j.id === jobId);
      patch({ focusJobId: jobId });
      go(job?.status === 'done' ? 'aiPreview' : 'aiStatus');
    },

    async pollJobs() {
      const active = get().jobs.filter((j) => j.status === 'queued' || j.status === 'processing');
      for (const j of active) {
        try {
          const job = await api.ai.getJob(j.id);
          dispatch({ type: 'jobUpsert', job });
          if (job.status === 'done' && j.status !== 'done') toast(`뮤직비디오 완성: ${job.song.title}`, 'ok');
          if (job.status === 'failed') toast(`영상 제작 실패: ${job.song.title}`, 'error');
        } catch {
          /* 다음 주기에 재시도 */
        }
      }
    },

    async refreshJobs() {
      const m = get().member;
      if (!m) return;
      try {
        dispatch({ type: 'jobsMerge', jobs: await api.videos.listMine(m.id) });
      } catch (e) {
        fail(e);
      }
    },

    async publish(jobId: string) {
      const st = get();
      const quota = st.quota;
      if (!quota || !st.pricing) return;
      const free = quota.freeLeft > 0;
      const ok = await confirm(
        free
          ? {
              title: '앱에 업로드할까요?',
              body: `무료 업로드 ${quota.freeTotal}회 중 ${quota.freeLeft}회가 남아 있습니다. 1회를 사용합니다.\n업로드한 영상은 MUVIS 앱 ‘내 뮤직영상’에 저장됩니다.`,
              confirmLabel: '무료로 업로드',
            }
          : {
              title: '업로드 비용이 차감됩니다',
              body: `무료 업로드 ${quota.freeTotal}회를 모두 사용했습니다. 현재 잔액 ${pts(st.points)}`,
              confirmLabel: `${pts(st.pricing.extraUpload)} 차감하고 업로드`,
              tone: 'charge',
              consent: `업로드 1회에 M포인트 ${pts(st.pricing.extraUpload)}가 차감되는 것에 동의합니다`,
            },
      );
      if (!ok) return;
      patch({ busy: '업로드하는 중' });
      try {
        const r = await api.uploads.publish(jobId, idempotencyKey());
        dispatch({ type: 'jobUpsert', job: r.job });
        patch({ quota: r.quota, points: r.balance, busy: null });
        toast('업로드했습니다. MUVIS 앱 내 뮤직영상에서 볼 수 있어요', 'ok');
      } catch (e) {
        fail(e);
      }
    },

    async regenerate(jobId: string) {
      const st = get();
      if (!st.pricing) return;
      const failed = st.jobs.find((j) => j.id === jobId)?.status === 'failed';
      const ok = await confirm(failed ? {
        title: '다시 시도할까요?',
        body: '편집이 실패한 영상은 포인트 차감 없이 다시 만듭니다.',
        confirmLabel: '무료로 다시 시도',
      } : {
        title: '다른 스타일로 다시 만들까요?',
        body: `같은 녹화 원본으로 새로 편집합니다. 현재 잔액 ${pts(st.points)}`,
        confirmLabel: `${pts(st.pricing.regenerate)} 차감하고 재생성`,
        tone: 'charge',
        consent: `재생성 1회에 M포인트 ${pts(st.pricing.regenerate)}가 차감되는 것에 동의합니다`,
      });
      if (!ok) return;
      patch({ busy: '재생성을 요청하는 중' });
      try {
        const r = await api.ai.regenerate(jobId, idempotencyKey());
        dispatch({ type: 'jobUpsert', job: r.job });
        patch({ points: r.balance, busy: null, focusJobId: r.job.id });
        go('aiStatus', true);
      } catch (e) {
        fail(e);
      }
    },

    /** 결과 화면을 떠날 때: 시간이 끝났으면 종료, 아니면 다음 곡 */
    async leaveResult() {
      await actions.proceed();
    },

    async enterAudition(auditionId: string, title: string, jobId: string) {
      const ok = await confirm({
        title: `‘${title}’에 참가할까요?`,
        body: '오디션에 참가한 영상은 삭제할 수 없습니다.',
        confirmLabel: '참가하기',
      });
      if (!ok) return false;
      patch({ busy: '오디션 참가 중' });
      try {
        await api.auditions.enter(auditionId, jobId);
        patch({ busy: null });
        toast('오디션에 참가했습니다. 심사 결과는 앱으로 알려드려요', 'ok');
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },

    /** 시연용: 남은 시간을 강제로 조정 (개발 패널) */
    devSetRemaining(ms: number) {
      const session = get().session;
      if (!session) return;
      warned.current = ms <= policy.warnBeforeMinutes * 60_000 ? false : warned.current;
      patch({ session: { ...session, endsAt: Date.now() + ms } });
    },

    // ── 장비 · 리모컨 이벤트 ──
    onAgentEvent(e: AgentEvent) {
      switch (e.type) {
        case 'status':
          patch({ agentStatus: e.status });
          if (e.status === 'online') {
            agent.listCameras().then((cameras) => patch({ cameras })).catch(() => undefined);
          }
          if (e.status === 'offline') toast('노래방 장비와 연결이 끊겼습니다', 'error');
          break;
        case 'rf:tag': {
          const st = get();
          if (st.screen === 'attract' || st.screen === 'login') void actions.rfLogin(e.uid);
          else if (st.session) toast('이미 이용 중입니다', 'info');
          break;
        }
        case 'song:started':
        case 'song:progress':
          dispatch({
            type: 'progress',
            positionSec: e.type === 'song:started' ? 0 : e.positionSec,
            durationSec: e.durationSec,
          });
          break;
        case 'song:ended':
          void actions.finishSong(e.completed);
          break;
        case 'error':
          toast(e.message, 'error');
          break;
      }
    },

    async onRemote(cmd: RemoteCommand) {
      const st = get();
      if (!st.session) return;
      switch (cmd.type) {
        case 'reserve':
        case 'start': {
          const song = await api.catalog.byNo(cmd.songNo);
          if (!song) {
            toast(`리모컨: ${cmd.songNo}번 곡을 찾을 수 없습니다`, 'error');
            return;
          }
          actions.requestSong(song, cmd.type === 'start' ? 'start' : cmd.priority ? 'priority' : 'reserve');
          return;
        }
        case 'pause':
        case 'resume':
          if (st.nowPlaying && st.nowPlaying.paused === (cmd.type === 'resume')) await actions.togglePause();
          return;
        case 'stop':
          await agent.stopSong().catch(() => undefined);
          return;
        case 'skipInterlude':
          await actions.skipInterlude();
          return;
      }
    },
  };

  return actions;
}

// ── Provider ─────────────────────────────────────────────

export function KioskProvider({ boothId, children }: { boothId: string; children: ReactNode }) {
  const [api] = useState(createApi);
  const [agent] = useState(createAgent);
  const [state, dispatch] = useReducer(reducer, boothId, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const get = useCallback(() => stateRef.current, []);

  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const dialogResolver = useRef<((ok: boolean) => void) | null>(null);
  const lastTouch = useRef(Date.now());

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 3500);
  }, []);

  const confirm = useCallback((spec: DialogSpec) => {
    dialogResolver.current?.(false);
    setDialog(spec);
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = resolve;
    });
  }, []);

  const resolveDialog = useCallback((ok: boolean) => {
    dialogResolver.current?.(ok);
    dialogResolver.current = null;
    setDialog(null);
  }, []);

  const actions = useActions({ api, agent, dispatch, get, toast, confirm });
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // 장비 연결 · 이벤트
  useEffect(() => {
    const off = agent.on((e) => actionsRef.current.onAgentEvent(e));
    agent.connect();
    return () => {
      off();
      agent.disconnect();
    };
  }, [agent]);

  // 1초 시계: 남은 시간, 종료 처리, 방치 복귀
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      actionsRef.current.tick(n);
      const st = stateRef.current;
      const idleScreens: ScreenName[] = ['login', 'payment', 'ads', 'news'];
      if (!st.session && idleScreens.includes(st.screen) && !st.busy && n - lastTouch.current > policy.idleCancelSeconds * 1000) {
        actionsRef.current.resetToAttract();
      }
    }, 1000);
    const touch = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener('pointerdown', touch, { passive: true });
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', touch);
    };
  }, []);

  // AI 작업 상태 폴링
  const hasActiveJobs = state.jobs.some((j) => j.status === 'queued' || j.status === 'processing');
  useEffect(() => {
    if (!hasActiveJobs) return;
    const t = setInterval(() => void actionsRef.current.pollJobs(), 1500);
    return () => clearInterval(t);
  }, [hasActiveJobs]);

  // 진행 화면에서 보던 작업이 완성되면 미리보기로 이동
  const focusJob = state.jobs.find((j) => j.id === state.focusJobId);
  useEffect(() => {
    if (state.screen === 'aiStatus' && focusJob?.status === 'done') {
      dispatch({ type: 'go', screen: 'aiPreview', replace: true });
    }
  }, [state.screen, focusJob?.status]);

  const value = useMemo<KioskContextValue>(
    () => ({ state, now, api, agent, toasts, dialog, overlay, setOverlay, resolveDialog, toast, actions }),
    [state, now, api, agent, toasts, dialog, overlay, resolveDialog, toast, actions],
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export { config };
