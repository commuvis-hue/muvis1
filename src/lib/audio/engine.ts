/**
 * 시연용 오디오 엔진 — 모의 반주기 + 마이크 믹서.
 *
 * 실제 매장에서는 반주기와 믹서가 소리를 내므로 이 엔진은 모의 장비(MockAgent)에서만 씁니다.
 *  1) public/audio/{곡번호}.mp3 가 있으면 그 파일을 재생합니다 (보유한 AI 음원·라이선스 음원).
 *  2) 없으면 곡 번호를 씨앗으로 장르에 맞는 반주와 가이드 멜로디를 즉석에서 작곡·연주합니다.
 *     (기존 곡을 흉내 내지 않는 자동 생성 음악이라 저작권 문제가 없습니다)
 *  3) 마이크 → 에코·리버브 → 스피커 (노래방 마이크 모니터)
 */
import { config } from '@/lib/config';
import type { Genre } from '@/lib/types';

export interface MixerSettings {
  /** 반주 음량 0~1 */
  music: number;
  /** 마이크 음량 0~1.5 */
  mic: number;
  micOn: boolean;
  /** 에코 0=끔 1=약 2=중 3=강 */
  echo: 0 | 1 | 2 | 3;
  /** 가이드 멜로디 */
  guide: boolean;
}

export const DEFAULT_MIXER: MixerSettings = { music: 0.8, mic: 0.9, micOn: true, echo: 2, guide: true };

export interface PlayInfo {
  source: 'file' | 'synth';
  /** 파일 재생일 때 실제 길이(초) */
  durationSec: number | null;
}

// ── 작곡 도우미 ──────────────────────────────────────────

type Rng = () => number;

function seeded(text: string): Rng {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (n: number, m: number) => ((n % m) + m) % m;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

type BassMode = 'whole' | 'quarter' | 'eighth' | 'offbeat' | 'oompah' | 'kick';
type ChordMode = 'pad' | 'arp' | 'stab' | 'power' | 'strum' | 'keys';

interface Style {
  bpm: number;
  minorBias: number;
  kick: string;
  snare: string;
  hat: string;
  swing: number;
  bass: BassMode;
  chord: ChordMode;
  lead: OscillatorType;
  vibrato: number;
  sevenths: boolean;
}

// 16칸(16분음표) 패턴: x=강, o=약
const STYLES: Record<Genre, Style> = {
  발라드: { bpm: 72, minorBias: 0.5, kick: 'x.........x.....', snare: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.', swing: 0, bass: 'whole', chord: 'arp', lead: 'triangle', vibrato: 18, sevenths: true },
  댄스: { bpm: 124, minorBias: 0.5, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', swing: 0, bass: 'offbeat', chord: 'stab', lead: 'square', vibrato: 6, sevenths: false },
  힙합: { bpm: 88, minorBias: 0.7, kick: 'x......x..x.....', snare: '....x.......x...', hat: 'oooooooooooooooo', swing: 0.18, bass: 'kick', chord: 'keys', lead: 'triangle', vibrato: 8, sevenths: true },
  록: { bpm: 128, minorBias: 0.4, kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', swing: 0, bass: 'eighth', chord: 'power', lead: 'sawtooth', vibrato: 10, sevenths: false },
  트로트: { bpm: 116, minorBias: 0.6, kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', swing: 0, bass: 'oompah', chord: 'stab', lead: 'triangle', vibrato: 35, sevenths: false },
  'R&B': { bpm: 80, minorBias: 0.5, kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'o.ooo.ooo.ooo.oo', swing: 0.15, bass: 'quarter', chord: 'pad', lead: 'sine', vibrato: 14, sevenths: true },
  인디: { bpm: 104, minorBias: 0.4, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', swing: 0, bass: 'quarter', chord: 'strum', lead: 'triangle', vibrato: 10, sevenths: false },
};

const PROG_MAJOR = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 3], [3, 4, 2, 5]];
const PROG_MINOR = [[0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 6], [0, 3, 4, 0]];

const RHYTHM_VERSE = ['x.x.x...', 'x..x..x.', 'x.xx.x..', '..x.x.x.', 'x...x.x.', 'x.x..xx.'];
const RHYTHM_CHORUS = ['x.xxx.x.', 'xx.x.xx.', 'x.x.xxx.', 'x.xx.xx.', 'x.x.x.x.'];

interface MelNote {
  step: number; // 섹션 시작 기준 16분음표 위치
  len: number;
  deg: number; // 음계 도수 (멜로디 옥타브 기준)
}

type Section = 'intro' | 'verse' | 'chorus' | 'inter' | 'outro';

class Composition {
  readonly style: Style;
  readonly stepDur: number;
  readonly root: number;
  readonly scale: number[];
  readonly prog: number[];
  readonly verse: MelNote[];
  readonly chorus: MelNote[];
  readonly totalBars: number;

  constructor(seed: string, genre: Genre, durationSec: number) {
    const r = seeded(seed);
    this.style = STYLES[genre] ?? STYLES['인디'];
    const bpm = this.style.bpm + Math.round((r() - 0.5) * 10);
    this.stepDur = 60 / bpm / 4;
    const minor = r() < this.style.minorBias;
    this.scale = minor ? MINOR : MAJOR;
    this.root = 52 + Math.floor(r() * 8); // E3~B3
    this.prog = pick(r, minor ? PROG_MINOR : PROG_MAJOR);
    this.totalBars = Math.max(6, Math.floor(durationSec / (this.stepDur * 16)));
    this.verse = this.melody(seeded(seed + ':v'), RHYTHM_VERSE, 0);
    this.chorus = this.melody(seeded(seed + ':c'), RHYTHM_CHORUS, 2);
  }

  midi(deg: number, base: number) {
    return base + 12 * Math.floor(deg / 7) + this.scale[mod(deg, 7)];
  }

  chordDegs(bar: number): number[] {
    const d = this.prog[mod(bar, 4)];
    return this.style.sevenths ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4];
  }

  section(bar: number): { type: Section; bar: number } {
    if (bar >= this.totalBars - 2) return { type: 'outro', bar: bar - (this.totalBars - 2) };
    if (bar < 2) return { type: 'intro', bar };
    const b = (bar - 2) % 20;
    if (b < 8) return { type: 'verse', bar: b };
    if (b < 16) return { type: 'chorus', bar: b - 8 };
    return { type: 'inter', bar: b - 16 };
  }

  /** 2마디 동기 A·B를 만들어 A B A B′ 로 8마디 멜로디 구성 */
  private melody(r: Rng, rhythms: string[], shift: number): MelNote[] {
    let cur = this.prog[0] + pick(r, [0, 2, 4]) + shift;
    const motif = (startBar: number): MelNote[] => {
      const notes: MelNote[] = [];
      for (let b = 0; b < 2; b++) {
        const pattern = pick(r, rhythms);
        const chord = this.chordDegs(startBar + b).slice(0, 3);
        const onsets = [...pattern].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
        onsets.forEach((slot, k) => {
          if (slot % 4 === 0) {
            // 강박: 가장 가까운 코드 구성음
            const cands = chord.flatMap((d) => [d, d + 7, d - 7]);
            cur = cands.reduce((a, c) => (Math.abs(c - cur) < Math.abs(a - cur) ? c : a), cands[0]);
          } else {
            cur += pick(r, [-1, 1, 1, -1, 2, -2, 0]);
          }
          cur = Math.max(-2 + shift, Math.min(9 + shift, cur));
          const next = onsets[k + 1] ?? 8;
          notes.push({ step: (b * 8 + slot) * 2, len: Math.min(6, (next - slot) * 2), deg: cur });
        });
      }
      return notes;
    };
    const A = motif(0);
    const B = motif(2);
    const at = (ns: MelNote[], bar: number) => ns.map((n) => ({ ...n, step: n.step + bar * 16 }));
    const Bend = B.map((n, i) => (i === B.length - 1 ? { ...n, deg: this.prog[0] + (shift >= 2 ? 7 : 0), len: Math.max(n.len, 32 - n.step) } : n));
    return [...at(A, 0), ...at(B, 2), ...at(A, 4), ...at(Bend, 6)];
  }
}

// ── 엔진 ─────────────────────────────────────────────────

const LOOKAHEAD = 0.15;

export class DemoAudioEngine {
  private ctx: AudioContext | null = null;
  private comp!: DynamicsCompressorNode;
  private musicBus!: GainNode;
  private leadBus!: GainNode;
  private micBus!: GainNode;
  private echoDelay!: DelayNode;
  private echoFb!: GainNode;
  private echoWet!: GainNode;
  private reverbWet!: GainNode;
  private outAnalyser!: AnalyserNode;
  private micAnalyser!: AnalyserNode;
  private noise!: AudioBuffer;

  private mixer: MixerSettings = { ...DEFAULT_MIXER };
  private key = 0;

  // 합성 재생 상태
  private comp_: Composition | null = null;
  private playing = false;
  private paused = false;
  private anchorCtx = 0;
  private anchorPos = 0;
  private nextStep = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  // 파일 재생 상태
  private audioEl: HTMLAudioElement | null = null;
  private audioSrc: MediaElementAudioSourceNode | null = null;

  // 마이크
  private micStream: MediaStream | null = null;
  private micActive = false;
  private micStarting: Promise<void> | null = null;

  get available() {
    return typeof window !== 'undefined' && (typeof AudioContext !== 'undefined');
  }

  /** 화면을 처음 터치할 때 호출 (브라우저 자동재생 정책) */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (!this.available) return null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.outAnalyser = ctx.createAnalyser();
    this.outAnalyser.fftSize = 512;
    this.comp.connect(this.outAnalyser).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.leadBus = ctx.createGain();
    this.musicBus.connect(this.comp);
    this.leadBus.connect(this.comp);

    // 마이크: 드라이 + 에코(딜레이 피드백) + 리버브
    this.micBus = ctx.createGain();
    this.micBus.gain.value = 0;
    this.micBus.connect(this.comp);
    this.echoDelay = ctx.createDelay(1);
    this.echoDelay.delayTime.value = 0.19;
    this.echoFb = ctx.createGain();
    this.echoWet = ctx.createGain();
    this.micBus.connect(this.echoDelay);
    this.echoDelay.connect(this.echoFb).connect(this.echoDelay);
    this.echoDelay.connect(this.echoWet).connect(this.comp);
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(ctx, 2.2);
    this.reverbWet = ctx.createGain();
    this.micBus.connect(conv).connect(this.reverbWet).connect(this.comp);
    this.micAnalyser = ctx.createAnalyser();
    this.micAnalyser.fftSize = 512;

    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;

    this.applyMixer();
    return ctx;
  }

  private impulse(ctx: AudioContext, sec: number) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // ── 믹서 ──
  setMixer(m: MixerSettings) {
    this.mixer = { ...m };
    this.applyMixer();
  }

  private applyMixer() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = this.mixer;
    const silent = !this.playing || this.paused;
    this.musicBus.gain.setTargetAtTime(silent ? 0 : m.music, t, 0.03);
    this.leadBus.gain.setTargetAtTime(silent || !m.guide ? 0 : m.music * 0.9, t, 0.03);
    this.micBus.gain.setTargetAtTime(m.micOn && this.micActive ? m.mic : 0, t, 0.03);
    const echo = [
      [0, 0, 0],
      [0.16, 0.22, 0.12],
      [0.26, 0.32, 0.2],
      [0.38, 0.45, 0.3],
    ][m.echo];
    this.echoWet.gain.setTargetAtTime(echo[0], t, 0.05);
    this.echoFb.gain.setTargetAtTime(echo[1], t, 0.05);
    this.reverbWet.gain.setTargetAtTime(echo[2], t, 0.05);
    if (this.audioEl) this.audioEl.playbackRate = Math.pow(2, this.key / 12);
  }

  setKey(semitones: number) {
    this.key = semitones;
    this.applyMixer();
  }

  // ── 마이크 ──
  /** 노래하는 동안만 마이크 소리를 스피커로 내보냅니다 */
  async setMicActive(active: boolean) {
    this.micActive = active;
    if (active) await this.startMic();
    this.applyMixer();
  }

  private startMic(): Promise<void> {
    if (this.micStream) return Promise.resolve();
    if (this.micStarting) return this.micStarting;
    const ctx = this.ensure();
    if (!ctx || !navigator.mediaDevices?.getUserMedia) return Promise.resolve();
    const raw = config.micRaw;
    this.micStarting = navigator.mediaDevices
      .getUserMedia({
        // 노트북 스피커에서는 하울링을 막기 위해 에코 제거를 켭니다.
        // 매장 마이크(믹서 경유)처럼 지연을 줄이려면 NEXT_PUBLIC_MIC_RAW=true
        audio: { echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: false },
        video: false,
      })
      .then((stream) => {
        this.micStream = stream;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(this.micBus);
        src.connect(this.micAnalyser);
      })
      .catch(() => undefined)
      .finally(() => {
        this.micStarting = null;
      });
    return this.micStarting;
  }

  micLevel(): number {
    return this.level(this.micStream ? this.micAnalyser : null);
  }

  outputLevel(): number {
    return this.level(this.ctx ? this.outAnalyser : null);
  }

  private level(a: AnalyserNode | null): number {
    if (!a) return 0;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return Math.min(1, Math.sqrt(s / buf.length) * 4);
  }

  // ── 재생 ──
  async play(song: { no: string; genre: Genre }, durationSec: number): Promise<PlayInfo> {
    this.stop();
    const ctx = this.ensure();
    if (!ctx) return { source: 'synth', durationSec: null };
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    this.key = 0;

    const file = await this.findFile(song.no);
    if (file) {
      const el = new Audio();
      el.src = file;
      el.preload = 'auto';
      (el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = false;
      this.audioEl = el;
      this.audioSrc = ctx.createMediaElementSource(el);
      this.audioSrc.connect(this.musicBus);
      this.playing = true;
      this.paused = false;
      this.applyMixer();
      await el.play().catch(() => undefined);
      if (!Number.isFinite(el.duration) || !el.duration) {
        await new Promise<void>((res) => {
          el.addEventListener('loadedmetadata', () => res(), { once: true });
          setTimeout(res, 2000);
        });
      }
      return { source: 'file', durationSec: Number.isFinite(el.duration) ? el.duration : null };
    }

    this.comp_ = new Composition(song.no, song.genre, durationSec);
    this.playing = true;
    this.paused = false;
    this.anchorCtx = ctx.currentTime + 0.05;
    this.anchorPos = 0;
    this.nextStep = 0;
    this.applyMixer();
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    return { source: 'synth', durationSec: null };
  }

  private fileList: Promise<Set<string>> | null = null;

  /** public/audio/index.json 에 등록된 곡만 파일로 재생 (없는 파일을 매번 찾지 않도록) */
  private async findFile(no: string): Promise<string | null> {
    this.fileList ??= fetch('/audio/index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j: { files?: string[] }) => new Set(j.files ?? []))
      .catch(() => new Set<string>());
    const files = await this.fileList;
    return files.has(no) ? `/audio/${encodeURIComponent(no)}.mp3` : null;
  }

  position(): number {
    if (this.audioEl) return this.audioEl.currentTime;
    if (!this.ctx || !this.playing) return 0;
    if (this.paused) return this.anchorPos;
    return Math.max(0, this.anchorPos + (this.ctx.currentTime - this.anchorCtx));
  }

  get isPlaying() {
    return this.playing;
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.anchorPos = this.position();
    this.paused = true;
    this.audioEl?.pause();
    this.applyMixer();
  }

  resume() {
    if (!this.playing || !this.paused || !this.ctx) return;
    this.paused = false;
    this.anchorCtx = this.ctx.currentTime + 0.03;
    if (this.comp_) this.nextStep = Math.ceil(this.anchorPos / this.comp_.stepDur);
    void this.audioEl?.play();
    this.applyMixer();
  }

  seek(sec: number) {
    if (!this.playing || !this.ctx) return;
    if (this.audioEl) {
      this.audioEl.currentTime = sec;
      return;
    }
    this.anchorPos = sec;
    this.anchorCtx = this.ctx.currentTime + 0.03;
    if (this.comp_) this.nextStep = Math.ceil(sec / this.comp_.stepDur);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    this.paused = false;
    this.comp_ = null;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioSrc?.disconnect();
      this.audioEl = null;
      this.audioSrc = null;
    }
    this.applyMixer();
  }

  dispose() {
    this.stop();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  // ── 합성 연주 스케줄러 ──
  private schedule() {
    const ctx = this.ctx;
    const c = this.comp_;
    if (!ctx || !c || !this.playing || this.paused) return;
    const horizon = this.position() + LOOKAHEAD;
    while (this.nextStep * c.stepDur < horizon) {
      const step = this.nextStep++;
      const pos = step * c.stepDur;
      const swing = step % 2 === 1 ? c.style.swing * c.stepDur : 0;
      const t = this.anchorCtx + (pos - this.anchorPos) + swing;
      if (t < ctx.currentTime - 0.02) continue;
      this.playStep(c, step, Math.max(t, ctx.currentTime));
    }
  }

  private playStep(c: Composition, step: number, t: number) {
    const bar = Math.floor(step / 16);
    if (bar >= c.totalBars) return;
    const s = step % 16;
    const sec = c.section(bar);
    const st = c.style;
    const key = this.key;
    const sd = c.stepDur;
    const chord = c.chordDegs(bar).map((d) => c.midi(d, c.root) + key);
    const rootMidi = c.midi(c.prog[mod(bar, 4)], c.root - 12) + key;
    const energy = sec.type === 'chorus' || sec.type === 'inter' ? 1 : sec.type === 'verse' ? 0.75 : sec.type === 'intro' ? 0.5 : 0.35;
    const fill = sec.type !== 'outro' && (sec.bar === 7 || sec.bar === 3) && s >= 12;

    // 드럼
    if (sec.type !== 'outro' || s === 0) {
      const hit = (p: string) => (p[s] === 'x' ? 1 : p[s] === 'o' ? 0.55 : 0);
      if (hit(st.kick)) this.kick(t, hit(st.kick) * energy);
      if (hit(st.snare) && sec.type !== 'intro') this.snare(t, hit(st.snare) * energy);
      if (fill && s % 2 === 0) this.snare(t, 0.5 * energy);
      if (hit(st.hat) && energy > 0.4) this.hat(t, hit(st.hat) * energy);
      if (sec.type === 'chorus' && sec.bar === 0 && s === 0) this.crash(t);
    }

    // 베이스
    const bassOn: Record<BassMode, number[]> = {
      whole: [0],
      quarter: [0, 4, 8, 12],
      eighth: [0, 2, 4, 6, 8, 10, 12, 14],
      offbeat: [2, 6, 10, 14],
      oompah: [0, 4, 8, 12],
      kick: [...st.kick].map((ch, i) => (ch !== '.' ? i : -1)).filter((i) => i >= 0),
    };
    if (bassOn[st.bass].includes(s) && sec.type !== 'outro') {
      const fifth = st.bass === 'oompah' && (s === 4 || s === 12) ? 7 : 0;
      const len = st.bass === 'whole' ? 16 : st.bass === 'quarter' || st.bass === 'oompah' ? 3.5 : 1.8;
      this.voice(t, rootMidi + fifth, len * sd, st.bass === 'kick' ? 'sine' : 'sawtooth', 0.32, this.musicBus, { cutoff: 520, release: 0.08 });
    }

    // 코드
    const chordHit = (dur: number, wave: OscillatorType, vol: number, cutoff: number, notes = chord) =>
      notes.forEach((m, i) => this.voice(t + (st.chord === 'strum' ? i * 0.018 : 0), m, dur, wave, vol, this.musicBus, { cutoff, detune: 6 }));
    switch (st.chord) {
      case 'pad':
        if (s === 0) chordHit(16 * sd, 'sawtooth', 0.06, 1100);
        break;
      case 'keys':
        if (s === 0 || s === 10) chordHit(6 * sd, 'sine', 0.09, 2400);
        break;
      case 'arp':
        if (s % 2 === 0) {
          const notes = [...chord, chord[1] + 12];
          this.voice(t, notes[(s / 2) % notes.length], 3 * sd, 'triangle', 0.13, this.musicBus, { cutoff: 2600, release: 0.4 });
        }
        if (s === 0) chordHit(16 * sd, 'sine', 0.035, 1400);
        break;
      case 'stab':
        if (st.bass === 'oompah' ? [2, 6, 10, 14].includes(s) : [0, 3, 6, 10].includes(s)) chordHit(1.2 * sd, 'square', 0.045, 2200);
        break;
      case 'power':
        if (s % 2 === 0 && sec.type !== 'intro') chordHit(1.8 * sd, 'sawtooth', 0.07, 1500, [chord[0], chord[0] + 7, chord[0] + 12]);
        break;
      case 'strum':
        if (s === 0 || s === 6 || s === 10) chordHit(5 * sd, 'triangle', 0.08, 2800);
        break;
    }

    // 가이드 멜로디 (노래 부분)
    if (sec.type === 'verse' || sec.type === 'chorus') {
      const mel = sec.type === 'verse' ? c.verse : c.chorus;
      const local = sec.bar * 16 + s;
      for (const n of mel) {
        if (n.step === local) {
          this.voice(t, c.midi(n.deg, c.root + 12) + key, n.len * sd * 0.95, st.lead, sec.type === 'chorus' ? 0.2 : 0.17, this.leadBus, {
            cutoff: st.lead === 'triangle' || st.lead === 'sine' ? 3200 : 1800,
            vibrato: st.vibrato,
            attack: 0.025,
            release: 0.12,
          });
        }
      }
    }
  }

  // ── 악기 ──
  private voice(
    t: number,
    midi: number,
    dur: number,
    wave: OscillatorType,
    vol: number,
    dest: AudioNode,
    o: { cutoff?: number; attack?: number; release?: number; vibrato?: number; detune?: number } = {},
  ) {
    const ctx = this.ctx!;
    const attack = o.attack ?? 0.01;
    const release = o.release ?? 0.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(vol * 0.7, t + attack, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, release / 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cutoff ?? 2000;
    f.connect(g).connect(dest);
    const end = t + dur + release * 2;
    const oscs = o.detune ? [-o.detune, o.detune] : [0];
    for (const det of oscs) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = mtof(midi);
      osc.detune.value = det;
      if (o.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(o.vibrato, t + Math.min(0.35, dur * 0.6));
        lfo.connect(depth).connect(osc.detune);
        lfo.start(t);
        lfo.stop(end);
      }
      osc.connect(f);
      osc.start(t);
      osc.stop(end);
    }
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, vel: number, hp: number, decay: number, bp?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = bp ? 'bandpass' : 'highpass';
    f.frequency.value = bp ?? hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
  }

  private snare(t: number, vel: number) {
    this.noiseHit(t, 0.42 * vel, 0, 0.18, 1800);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 190;
    g.gain.setValueAtTime(0.3 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hat(t: number, vel: number) {
    this.noiseHit(t, 0.12 * vel, 7500, 0.045);
  }

  private crash(t: number) {
    this.noiseHit(t, 0.16, 5000, 1.2);
  }
}

let shared: DemoAudioEngine | null = null;
export function getDemoAudio(): DemoAudioEngine {
  shared ??= new DemoAudioEngine();
  // 개발 패널이 켜진 시연 환경에서만 브라우저 콘솔 점검용으로 노출 (window.__muvisAudio.outputLevel())
  if (config.devPanel && typeof window !== 'undefined') {
    (window as unknown as { __muvisAudio?: DemoAudioEngine }).__muvisAudio = shared;
  }
  return shared;
}
