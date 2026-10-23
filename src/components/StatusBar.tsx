'use client';

import { useRef } from 'react';
import { config, policy } from '@/lib/config';
import { mmss, pts } from '@/lib/format';
import { remainingMs, useKiosk } from '@/lib/kiosk/store';
import { Icon } from './Icon';

export function StatusBar() {
  const { state, now, actions, setOverlay } = useKiosk();
  const { session, member, mode, points } = state;
  const left = remainingMs(state, now);
  const warn = session && left <= policy.warnBeforeMinutes * 60_000;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 로고를 2초간 누르면 시연용 개발 패널
  const pressStart = () => {
    if (!config.devPanel) return;
    pressTimer.current = setTimeout(() => setOverlay('dev'), 2000);
  };
  const pressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <header className="statusbar">
      <div
        className="brand"
        onPointerDown={pressStart}
        onPointerUp={pressEnd}
        onPointerLeave={pressEnd}
      >
        <span className="brand-mark">MUVIS</span>
        <span className="brand-sub">XR</span>
      </div>

      {session ? (
        <>
          <button className="mode-chip" onClick={() => actions.go('mode')} disabled={!!state.nowPlaying}>
            {mode === 'xr' ? 'XR 스튜디오' : mode === 'just' ? 'JUST 노래방' : '모드 선택'}
          </button>
          <div className="who">
            <span className="who-name">{member?.nickname}님</span>
            <span className="who-points">{pts(points)}</span>
          </div>
          <div className={`clock${warn ? ' is-warn' : ''}`} role="timer" aria-label="남은 이용 시간">
            <span className="clock-label">남은 시간</span>
            <span className="clock-digits">{mmss(left / 1000)}</span>
          </div>
          <div className="statusbar-actions">
            <button className="sb-btn sb-extend" onClick={() => actions.extend()}>
              <Icon name="plus" /> {policy.extendMinutes}분
            </button>
            <button className="sb-btn" onClick={() => setOverlay('remote')}>
              <Icon name="remote" /> 리모컨
            </button>
            <button className="sb-btn sb-quiet" onClick={() => actions.endByUser()}>
              <Icon name="power" /> 종료
            </button>
          </div>
        </>
      ) : (
        <div className="statusbar-idle">
          <span>부스 {state.boothId}</span>
        </div>
      )}
    </header>
  );
}
