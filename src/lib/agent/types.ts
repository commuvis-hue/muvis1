import type { Genre } from '@/lib/types';

/**
 * DeviceAgent — 키오스크 화면이 노래방 장비와 대화하는 유일한 통로.
 *
 * 화면 코드는 이 인터페이스만 사용합니다. 지금은 MockAgent(브라우저 안 모의 장비)가
 * 붙어 있고, 기기에 로컬 에이전트를 설치하면 LocalAgent(WebSocket)로 바꿔 끼웁니다.
 * 프로토콜 상세: docs/AGENT_PROTOCOL.md
 */

export type AgentStatus = 'connecting' | 'online' | 'offline';

export interface CameraInfo {
  id: string;
  label: string;
}

/** 카메라 미리보기 소스. 모의 모드는 MediaStream, 로컬 에이전트는 MJPEG URL. */
export type PreviewSource =
  | { type: 'mediastream'; stream: MediaStream }
  | { type: 'mjpeg'; url: string }
  | { type: 'none' };

export interface RecordedTrack {
  cameraId: string;
  /** 에이전트가 저장한 원본 위치 (로컬 경로 또는 업로드 후 스토리지 키) */
  uri: string;
}

export interface RecordingResult {
  takeId: string;
  tracks: RecordedTrack[];
  audioUri: string;
  durationSec: number;
  /** 원본 업로드 진행 상황은 에이전트가 서버로 직접 보고합니다 */
}

export interface PlayOptions {
  songNo: string;
  /** 모의 반주기에서만 사용. 실제 반주기는 곡 정보를 스스로 압니다. */
  durationSec?: number;
  genre?: Genre;
}

/** 노래방 믹서 설정 (반주 음량, 마이크, 에코, 가이드 멜로디) */
export interface MixerSettings {
  music: number;
  mic: number;
  micOn: boolean;
  echo: 0 | 1 | 2 | 3;
  guide: boolean;
}

export type AgentEvent =
  | { type: 'status'; status: AgentStatus }
  | { type: 'rf:tag'; uid: string }
  | { type: 'song:started'; songNo: string; durationSec: number }
  | { type: 'song:progress'; songNo: string; positionSec: number; durationSec: number }
  | { type: 'song:ended'; songNo: string; completed: boolean }
  | { type: 'mic:level'; level: number }
  | { type: 'error'; message: string };

export interface DeviceAgent {
  readonly kind: 'mock' | 'local';
  connect(): void;
  disconnect(): void;
  getStatus(): AgentStatus;
  on(listener: (e: AgentEvent) => void): () => void;

  // 반주기
  playSong(opts: PlayOptions): Promise<void>;
  pauseSong(): Promise<void>;
  resumeSong(): Promise<void>;
  stopSong(): Promise<void>;
  skipInterlude(): Promise<void>;
  /** 음정(키) 변경, 반음 단위 −6 ~ +6 */
  setKey(semitones: number): Promise<void>;
  setMixer(settings: MixerSettings): Promise<void>;

  // 멀티 카메라 · 녹화
  listCameras(): Promise<CameraInfo[]>;
  getPreview(cameraId: string): Promise<PreviewSource>;
  startRecording(takeId: string, cameraIds: string[], opts?: { maskId?: string | null }): Promise<void>;
  stopRecording(): Promise<RecordingResult>;

  // LED 송출 (카메라 지정 또는 자동 전환)
  setLedSource(source: string | 'auto'): Promise<void>;

  /** AR 가면: LED 송출·미리보기 화면의 얼굴에 가면을 실시간 합성 (null = 벗기) */
  setMask(maskId: string | null): Promise<void>;
}

/** 모의 장비에서만 쓰는 시연용 조작 */
export interface MockAgentControls {
  simulateRfTag(uid: string): void;
  setOffline(offline: boolean): void;
}
