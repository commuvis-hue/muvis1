/**
 * 배포 환경 설정. NEXT_PUBLIC_* 값은 빌드 시점에 번들에 들어가므로
 * process.env.NEXT_PUBLIC_XXX 형태로 그대로 참조해야 합니다.
 */
export type AgentMode = 'mock' | 'local';
export type ApiMode = 'mock' | 'http';

const apiModeEnv = process.env.NEXT_PUBLIC_API_MODE === 'http' ? 'http' : 'mock';

export const config = {
  agentMode: (process.env.NEXT_PUBLIC_AGENT_MODE === 'local' ? 'local' : 'mock') as AgentMode,
  agentUrl: process.env.NEXT_PUBLIC_AGENT_URL || 'ws://127.0.0.1:7700',
  apiMode: (process.env.NEXT_PUBLIC_API_MODE === 'http' ? 'http' : 'mock') as ApiMode,
  apiBase: process.env.NEXT_PUBLIC_API_BASE || '',
  mobileWebUrl: process.env.NEXT_PUBLIC_MOBILE_WEB_URL || 'https://m.muvis.example.com',
  defaultBoothId: process.env.NEXT_PUBLIC_BOOTH_ID || 'DEMO-BOOTH-01',
  /** 시연용 개발 패널. 모의 서버일 때는 기본으로 켜고, 명시적으로 false면 끔 */
  devPanel:
    process.env.NEXT_PUBLIC_DEV_PANEL === 'true' ||
    (process.env.NEXT_PUBLIC_DEV_PANEL !== 'false' && apiModeEnv === 'mock'),
  /** 키보드처럼 카드번호를 입력하는 USB RF 리더(HID) 입력을 받을지 */
  rfKeyboard: process.env.NEXT_PUBLIC_RF_KEYBOARD !== 'false',
  /** 모의 모드에서 반주·가이드 멜로디·마이크 소리를 낼지 */
  demoAudio: process.env.NEXT_PUBLIC_DEMO_AUDIO !== 'false',
  /** 마이크 에코 제거·잡음 억제를 끄고 원음으로 (믹서 경유 매장 마이크용, 노트북 스피커는 하울링 주의) */
  micRaw: process.env.NEXT_PUBLIC_MIC_RAW === 'true',
  demoSongSeconds: Number(process.env.NEXT_PUBLIC_DEMO_SONG_SECONDS || 40),
  /** 모의 장비의 CAM 1에 실제 웹캠 화면을 쓸지 (가면이 내 얼굴에 씌워지는 시연) */
  mockWebcam: process.env.NEXT_PUBLIC_MOCK_WEBCAM !== 'false',

  // AR 가면 얼굴 인식 (MediaPipe). WASM 버전은 package.json의 @mediapipe/tasks-vision 과 같아야 합니다.
  arWasmBase:
    process.env.NEXT_PUBLIC_AR_WASM_BASE || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  arModelUrl:
    process.env.NEXT_PUBLIC_AR_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  arMaxFaces: Number(process.env.NEXT_PUBLIC_AR_MAX_FACES || 2),
};

/**
 * 운영 정책. 기획서 v1.1 기준 확정 항목만 상수로 두고,
 * 금액처럼 미확정인 값은 서버(pricing API)에서 받아옵니다.
 */
export const policy = {
  sessionMinutes: 30, // 최초 이용권 (확정)
  extendMinutes: 10, // 연장 단위 (확정)
  warnBeforeMinutes: 5, // 종료 안내 시점
  freeUploads: 3, // 무료 업로드 횟수 (확정, 산정 기준은 미확정)
  countdownSeconds: 3,
  sessionEndReturnSeconds: 20, // 이용 종료 화면 → 대기화면 복귀
  idleCancelSeconds: 90, // 로그인·결제 화면에서 방치 시 대기화면 복귀
  autoSwitchSeconds: 8, // LED 자동 전환 간격 (모의)
};
