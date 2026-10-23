'use client';

import { useEffect, useRef, useState } from 'react';
import { drawMaskOnFace, getMask } from '@/lib/ar/masks';
import { detectFaces, loadTracker, PoseSmoother, trackerState } from '@/lib/ar/tracker';
import { getWebcam, webcamError } from '@/lib/ar/webcam';
import { Icon } from './Icon';

type Status = 'starting' | 'live' | 'nocam';

/**
 * 키오스크 웹캠을 거울처럼 보여주고, 인식한 얼굴마다 AR 가면을 씌웁니다.
 * 영상 프레임과 가면을 한 캔버스에 같이 그려 위치가 어긋나지 않습니다.
 */
export function ArMirror({ maskId, compact }: { maskId: string | null; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef(maskId);
  maskRef.current = maskId;
  const [status, setStatus] = useState<Status>('starting');
  const [trackerReady, setTrackerReady] = useState(false);
  const [trackerFailed, setTrackerFailed] = useState(false);
  const [noFace, setNoFace] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let det: Awaited<ReturnType<typeof loadTracker>> = null;
    let lastFaceAt = performance.now();
    let lastHintCheck = 0;
    const smoother = new PoseSmoother();

    loadTracker().then((d) => {
      if (!alive) return;
      det = d;
      setTrackerReady(!!d);
      setTrackerFailed(!d);
      if (!d) setError(trackerState().error);
    });

    getWebcam().then((video) => {
      if (!alive) return;
      if (!video) {
        setStatus('nocam');
        setError(webcamError());
        return;
      }
      setStatus('live');
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const loop = () => {
        if (!alive) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          ctx.drawImage(video, 0, 0, w, h);
          const mask = getMask(maskRef.current);
          if (det && mask) {
            const poses = smoother.next(detectFaces(det, video, w, h));
            poses.forEach((p) => drawMaskOnFace(ctx, mask, p));
            const now = performance.now();
            if (poses.length) lastFaceAt = now;
            if (now - lastHintCheck > 400) {
              lastHintCheck = now;
              setNoFace(now - lastFaceAt > 1200);
            }
          }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`armirror${compact ? ' armirror-compact' : ''}`}>
      <canvas ref={canvasRef} className="armirror-canvas" aria-label="AR 가면 미리보기" />
      {status === 'starting' && <p className="armirror-msg">카메라를 켜는 중</p>}
      {status === 'nocam' && (
        <p className="armirror-msg">
          <Icon name="camera" size="2.5rem" />
          {error || '카메라를 찾을 수 없습니다'}
          <span>가면은 그대로 선택할 수 있고, 녹화 영상에는 정상적으로 합성됩니다.</span>
        </p>
      )}
      {status === 'live' && maskId && !trackerReady && !trackerFailed && <p className="armirror-hint">얼굴 인식 준비 중</p>}
      {status === 'live' && trackerFailed && <p className="armirror-hint">얼굴 인식을 불러오지 못했습니다{error ? ` (${error})` : ''}</p>}
      {status === 'live' && trackerReady && maskId && noFace && <p className="armirror-hint">얼굴이 화면 가운데에 오도록 서 주세요</p>}
    </div>
  );
}
