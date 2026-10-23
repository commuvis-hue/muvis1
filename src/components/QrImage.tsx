'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR 코드를 브라우저에서 직접 생성합니다 (외부 서비스 호출 없음). */
export function QrImage({ value, size = 280, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#130B26', light: '#FFFFFF' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  return (
    <div className="qr" style={{ width: size / 16 + 'rem', height: size / 16 + 'rem' }}>
      {src ? <img src={src} alt={label} /> : <span className="qr-loading">QR 생성 중</span>}
    </div>
  );
}
