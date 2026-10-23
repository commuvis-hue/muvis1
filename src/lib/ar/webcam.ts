/**
 * 키오스크 전면 웹캠(가면 착용 미리보기용). 한 페이지에서 한 번만 열고 함께 씁니다.
 * 녹화용 멀티카메라는 로컬 에이전트가 맡으므로, 같은 카메라를 둘이 동시에 열지 않도록
 * 미리보기 전용 소형 웹캠을 따로 두는 것을 권장합니다.
 */
let videoPromise: Promise<HTMLVideoElement | null> | null = null;
let lastError = '';

export const webcamError = () => lastError;

export function getWebcam(): Promise<HTMLVideoElement | null> {
  if (videoPromise) return videoPromise;
  videoPromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      lastError = '이 기기에서는 카메라를 사용할 수 없습니다';
      videoPromise = null;
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      if (!v.videoWidth) {
        await new Promise<void>((resolve) => {
          v.addEventListener('loadedmetadata', () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }
      lastError = '';
      return v;
    } catch (e) {
      lastError =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? '카메라 사용 권한이 거부되었습니다'
          : '카메라를 찾을 수 없습니다';
      videoPromise = null;
      return null;
    }
  })();
  return videoPromise;
}
