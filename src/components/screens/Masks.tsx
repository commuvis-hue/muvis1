'use client';

import { useState } from 'react';
import { MASKS, getMask } from '@/lib/ar/masks';
import { pts } from '@/lib/format';
import { useKiosk } from '@/lib/kiosk/store';
import { ArMirror } from '../ArMirror';
import { Icon } from '../Icon';
import { MaskThumb } from '../MaskThumb';

type Filter = 'all' | 'free' | 'premium' | 'owned';
const FILTERS: [Filter, string][] = [
  ['all', '전체'],
  ['free', '무료'],
  ['premium', '프리미엄'],
  ['owned', '내 가면'],
];

export function MaskScreen() {
  const { state, actions } = useKiosk();
  const { maskOffers, maskId } = state;
  const [filter, setFilter] = useState<Filter>('all');
  // 고르기만 해도 바로 얼굴에 씌워 보기 (구매 전 착용 미리보기)
  const [preview, setPreview] = useState<string | null>(maskId ?? MASKS[0]?.id ?? null);

  const offerOf = (id: string) => maskOffers.find((o) => o.id === id);
  const list = MASKS.filter((m) => {
    const o = offerOf(m.id);
    if (!o) return false;
    if (filter === 'free') return o.tier === 'free';
    if (filter === 'premium') return o.tier === 'premium';
    if (filter === 'owned') return o.owned;
    return true;
  });

  const def = getMask(preview);
  const offer = preview ? offerOf(preview) : undefined;
  const wearing = !!preview && preview === maskId;

  return (
    <section className="screen masks">
      <div className="mask-stage">
        <ArMirror maskId={preview} />
        {def && (
          <div className="mask-caption">
            <strong>{def.name}</strong>
            <span>{def.blurb}</span>
          </div>
        )}
      </div>

      <aside className="mask-side">
        <header>
          <h1>가면 고르기</h1>
          <p>눌러서 바로 써 보세요. 고른 가면은 LED 화면과 녹화 영상의 모든 카메라 각도에 씌워집니다.</p>
        </header>

        <div className="chips" role="tablist" aria-label="가면 종류">
          {FILTERS.map(([f, label]) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`chip${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>

        <div className="mask-grid">
          {list.map((m) => {
            const o = offerOf(m.id)!;
            return (
              <button
                key={m.id}
                className={`mask-tile${preview === m.id ? ' is-picked' : ''}${maskId === m.id ? ' is-worn' : ''}`}
                onClick={() => setPreview(m.id)}
                aria-pressed={preview === m.id}
              >
                <MaskThumb mask={m} />
                <span className="mask-name">{m.name}</span>
                <span className={`mask-price${o.owned ? ' is-owned' : ''}`}>
                  {maskId === m.id ? '쓰는 중' : o.owned ? (o.tier === 'free' ? '무료' : '보유') : pts(o.price)}
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className="empty">해당하는 가면이 없어요</p>}
        </div>

        <div className="mask-actions">
          {def && offer && !wearing && (
            <button className="btn btn-primary btn-xl" onClick={() => actions.selectMask(def.id)}>
              {offer.owned ? (
                <>
                  <Icon name="mask" /> 이 가면 쓰기
                </>
              ) : (
                `${pts(offer.price)} 구매하고 쓰기`
              )}
            </button>
          )}
          {wearing && (
            <button className="btn btn-primary btn-xl" onClick={() => actions.home()}>
              <Icon name="mic" /> 이 가면으로 노래 고르기
            </button>
          )}
          <div className="mask-actions-row">
            {maskId ? (
              <button className="btn btn-ghost" onClick={() => actions.selectMask(null)}>
                가면 벗기
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => actions.home()}>
                가면 없이 노래하기
              </button>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
