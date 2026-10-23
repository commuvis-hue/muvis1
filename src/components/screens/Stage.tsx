'use client';

import { useEffect, useRef, useState } from 'react';
import { policy } from '@/lib/config';
import { mmss } from '@/lib/format';
import { getMask } from '@/lib/ar/masks';
import { useKiosk } from '@/lib/kiosk/store';
import { ArMirror } from '../ArMirror';
import { CameraView } from '../CameraView';
import { Icon } from '../Icon';
import { QueuePanel } from './Browse';

// ── 카운트다운 ───────────────────────────────────────────
export function CountdownScreen() {
  const { state, actions } = useKiosk();
  const [n, setN] = useState(policy.countdownSeconds);
  const started = useRef(false);
  const begin = useRef(actions.beginPerformance);
  begin.current = actions.beginPerformance;
  const song = state.pendingSong;

  useEffect(() => {
    if (n <= 0) {
      if (!started.current) {
        started.current = true;
        void begin.current();
      }
      return;
    }
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);

  if (!song) return null;
  return (
    <section className="screen countdown">
      <p className="countdown-song">
        <strong>{song.title}</strong> {song.artist}
      </p>
      <span key={n} className="countdown-n" aria-live="assertive">
        {n > 0 ? n : '시작'}
      </span>
      <p className="countdown-note">
        {state.mode === 'xr'
          ? `카메라 ${state.cameras.length}대가 녹화를 시작합니다.${getMask(state.maskId) ? ` ‘${getMask(state.maskId)!.name}’ 가면이 씌워집니다.` : ''} 마이크를 잡고 무대 표시 위에 서 주세요.`
          : '마이크를 잡아 주세요.'}
      </p>
    </section>
  );
}

// ── 노래 중 ──────────────────────────────────────────────
export function PerformingScreen() {
  const { state, now, actions } = useKiosk();
  const np = state.nowPlaying;
  const xr = state.mode === 'xr';
  const cams = state.cameras;

  if (!np) {
    return (
      <section className="screen performing">
        <p className="empty">곡을 마무리하는 중</p>
      </section>
    );
  }

  const autoIndex = cams.length ? Math.floor(now / (policy.autoSwitchSeconds * 1000)) % cams.length : 0;
  const programId = state.ledSource === 'auto' ? cams[autoIndex]?.id : state.ledSource;
  const pct = np.durationSec ? (np.positionSec / np.durationSec) * 100 : 0;
  const mask = getMask(state.maskId);

  const info = (
    <div className="np">
      {xr && (
        <span className="rec" aria-label="녹화 중">
          <i /> REC {mmss(np.positionSec)}
        </span>
      )}
      <p className="np-label">지금 부르는 곡</p>
      <h1 className="np-title">{np.song.title}</h1>
      <p className="np-artist">
        {np.song.artist} · {np.song.no}
      </p>
      <div className="np-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="np-time">
        <span>{mmss(np.positionSec)}</span>
        <span>{mmss(np.durationSec)}</span>
      </p>
      <div className="np-controls">
        <button className="ctl" onClick={() => actions.togglePause()}>
          <Icon name={np.paused ? 'play' : 'pause'} />
          {np.paused ? '이어 부르기' : '일시정지'}
        </button>
        <button className="ctl" onClick={() => actions.skipInterlude()}>
          <Icon name="skip" />
          간주 점프
        </button>
        <button className="ctl ctl-stop" onClick={() => actions.stopSong()}>
          <Icon name="stop" />
          정지
        </button>
      </div>
      {state.endAfterSong && <p className="np-ending">이용 시간이 끝나 이 곡이 마지막 곡입니다</p>}
      <QueuePanel queue={state.queue} compact />
    </div>
  );

  if (!xr) {
    return (
      <section className="screen performing performing-just">
        {mask ? (
          <div className="just-mirror">
            <ArMirror maskId={mask.id} compact />
            <span className="program-tag">AR 가면 · {mask.name}</span>
          </div>
        ) : (
          <div className="eq" aria-hidden="true">
            {Array.from({ length: 28 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${(i % 7) * -0.13}s`, animationPlayState: np.paused ? 'paused' : 'running' }} />
            ))}
          </div>
        )}
        {info}
      </section>
    );
  }

  return (
    <section className="screen performing">
      <div className="multiview">
        <div className="program">
          {programId && <CameraView cameraId={programId} />}
          <span className="program-tag">
            LED 송출 · {state.ledSource === 'auto' ? '자동 전환' : '고정'}
            {mask && ` · 가면 ${mask.name}`}
          </span>
        </div>
        <div className="thumbs">
          {cams.map((c) => (
            <button
              key={c.id}
              className={`thumb${programId === c.id ? ' is-live' : ''}`}
              onClick={() => actions.setLed(c.id)}
              aria-label={`${c.label}을 LED에 고정`}
            >
              <CameraView cameraId={c.id} label={c.label} />
            </button>
          ))}
          <button className={`thumb thumb-auto${state.ledSource === 'auto' ? ' is-live' : ''}`} onClick={() => actions.setLed('auto')}>
            <Icon name="redo" size="2rem" />
            자동 전환
          </button>
        </div>
      </div>
      {info}
    </section>
  );
}

// ── 곡 종료: AI 뮤직비디오 제작 여부 ─────────────────────
export function AfterSongScreen() {
  const { state, actions } = useKiosk();
  const take = state.pendingTake;
  if (!take) return null;
  return (
    <section className="screen after">
      <header className="screen-head">
        <h1>뮤직비디오로 만들까요?</h1>
        <p>
          ‘{take.song.title}’ 녹화를 마쳤습니다. 카메라 {take.cameraCount}대의 영상을 AI가 비트·구도·동작에 맞춰 편집합니다.
        </p>
      </header>
      <div className="formats">
        <div className="format format-short">
          <span className="format-frame" aria-hidden="true" />
          <strong>숏폼</strong>
          <span>세로 9:16 · 하이라이트</span>
        </div>
        <div className="format format-long">
          <span className="format-frame" aria-hidden="true" />
          <strong>롱폼</strong>
          <span>가로 16:9 · 전곡</span>
        </div>
      </div>
      <p className="after-note">
        편집은 보통 1~2분 걸립니다. 기다리는 동안 다음 곡을 불러도 되고, 완성되면 미리 보고 앱에 올릴 수 있어요.
      </p>
      <footer className="screen-foot">
        <button className="btn btn-ghost btn-xl" onClick={() => actions.skipMusicVideo()}>
          만들지 않기
        </button>
        <button className="btn btn-primary btn-xl" onClick={() => actions.makeMusicVideo()}>
          <Icon name="spark" /> 뮤직비디오 만들기
        </button>
      </footer>
    </section>
  );
}
