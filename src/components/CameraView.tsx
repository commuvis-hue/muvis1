'use client';

import { useEffect, useRef, useState } from 'react';
import { useKiosk } from '@/lib/kiosk/store';
import type { PreviewSource } from '@/lib/agent';

/** 에이전트가 제공하는 카메라 미리보기 (모의: MediaStream / 로컬 에이전트: MJPEG) */
export function CameraView({ cameraId, label }: { cameraId: string; label?: string }) {
  const { agent } = useKiosk();
  const [source, setSource] = useState<PreviewSource>({ type: 'none' });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    agent.getPreview(cameraId).then((s) => alive && setSource(s)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [agent, cameraId]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && source.type === 'mediastream') {
      v.srcObject = source.stream;
      v.play().catch(() => undefined);
    }
  }, [source]);

  return (
    <div className="cam">
      {source.type === 'mediastream' && <video ref={videoRef} muted playsInline autoPlay />}
      {source.type === 'mjpeg' && <img src={source.url} alt="" />}
      {source.type === 'none' && <div className="cam-empty">카메라 신호 없음</div>}
      {label && <span className="cam-label">{label}</span>}
    </div>
  );
}
