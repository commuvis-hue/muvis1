'use client';

import { useEffect, useState } from 'react';
import { useKiosk } from '@/lib/kiosk/store';
import { Icon } from './Icon';

const ECHO = ['끔', '약', '중', '강'];

/** 마이크 입력 레벨 (장비 이벤트를 직접 구독해 화면 전체를 다시 그리지 않음) */
function MicMeter({ on }: { on: boolean }) {
  const { agent } = useKiosk();
  const [level, setLevel] = useState(0);
  useEffect(
    () =>
      agent.on((e) => {
        if (e.type === 'mic:level') setLevel(e.level);
      }),
    [agent],
  );
  const bars = 8;
  const lit = on ? Math.round(level * bars * 1.4) : 0;
  return (
    <span className="micmeter" aria-label={`마이크 입력 ${Math.round(level * 100)}%`}>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} className={i < lit ? (i >= bars - 2 ? 'is-hot' : 'is-on') : ''} />
      ))}
    </span>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="snd">
      <span className="snd-label">{label}</span>
      <div className="snd-step">
        <button onClick={onMinus} aria-label={`${label} 내리기`}>−</button>
        <output>{value}</output>
        <button onClick={onPlus} aria-label={`${label} 올리기`}>+</button>
      </div>
    </div>
  );
}

export function SoundPanel() {
  const { state, actions } = useKiosk();
  const { mixer, key } = state;
  const vol = (v: number) => Math.round(v * 100);
  const clamp = (v: number, max = 1) => Math.max(0, Math.min(max, Math.round(v * 10) / 10));

  return (
    <div className="sound">
      <Stepper label="음정" value={key > 0 ? `+${key}` : String(key)} onMinus={() => actions.changeKey(-1)} onPlus={() => actions.changeKey(1)} />
      <Stepper
        label="반주"
        value={String(vol(mixer.music))}
        onMinus={() => actions.setMixer({ music: clamp(mixer.music - 0.1) })}
        onPlus={() => actions.setMixer({ music: clamp(mixer.music + 0.1) })}
      />
      <div className="snd">
        <span className="snd-label">마이크</span>
        <button className={`snd-toggle${mixer.micOn ? ' is-on' : ''}`} onClick={() => actions.setMixer({ micOn: !mixer.micOn })} aria-pressed={mixer.micOn}>
          <Icon name="mic" size="1.1em" /> {mixer.micOn ? '켜짐' : '꺼짐'}
          <MicMeter on={mixer.micOn} />
        </button>
      </div>
      <div className="snd">
        <span className="snd-label">에코</span>
        <button className="snd-toggle is-on" onClick={() => actions.setMixer({ echo: ((mixer.echo + 1) % 4) as 0 | 1 | 2 | 3 })}>
          {ECHO[mixer.echo]}
        </button>
      </div>
      <Stepper
        label="마이크 음량"
        value={String(vol(mixer.mic))}
        onMinus={() => actions.setMixer({ mic: clamp(mixer.mic - 0.1, 1.5) })}
        onPlus={() => actions.setMixer({ mic: clamp(mixer.mic + 0.1, 1.5) })}
      />
      <div className="snd">
        <span className="snd-label">가이드 멜로디</span>
        <button className={`snd-toggle${mixer.guide ? ' is-on' : ''}`} onClick={() => actions.setMixer({ guide: !mixer.guide })} aria-pressed={mixer.guide}>
          {mixer.guide ? '켜짐' : '꺼짐'}
        </button>
      </div>
    </div>
  );
}
