'use client';

import { useEffect, useState } from 'react';
import { mmss, pts } from '@/lib/format';
import { useKiosk } from '@/lib/kiosk/store';
import type { AiJob, AiJobStatus, VideoFormat } from '@/lib/types';
import { Icon } from '../Icon';

const STAGES = ['원본 확인', '비트·구도 분석', '장면 편집', '렌더링'];

export const STATUS_LABEL: Record<AiJobStatus, string> = {
  queued: '대기 중',
  processing: '편집 중',
  done: '완성',
  failed: '실패',
};

// ── AI 편집 진행 ─────────────────────────────────────────
export function AiStatusScreen() {
  const { state, actions } = useKiosk();
  const job = state.jobs.find((j) => j.id === state.focusJobId);
  if (!job) return <section className="screen"><p className="empty">작업 정보를 찾을 수 없습니다</p></section>;

  const stage = job.status === 'queued' ? 0 : Math.min(STAGES.length - 1, Math.floor(job.progress / 25));
  const failed = job.status === 'failed';

  return (
    <section className="screen ai-status">
      <header className="screen-head">
        <h1>{failed ? '편집을 마치지 못했습니다' : 'AI가 뮤직비디오를 만드는 중'}</h1>
        <p>
          ‘{job.song.title}’ · {job.attempt > 1 ? `${job.attempt}번째 버전` : '첫 번째 버전'}
        </p>
      </header>

      {failed ? (
        <p className="ai-error">{job.error}</p>
      ) : (
        <>
          <div className="ai-meter" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="ai-meter-num">{job.status === 'queued' ? '대기' : `${job.progress}%`}</span>
            <span className="ai-meter-bar">
              <span style={{ width: `${job.progress}%` }} />
            </span>
          </div>
          <ol className="ai-stages">
            {STAGES.map((s, i) => (
              <li key={s} className={i < stage ? 'is-done' : i === stage ? 'is-now' : ''}>
                {s}
              </li>
            ))}
          </ol>
        </>
      )}

      <footer className="screen-foot">
        <button className="btn btn-ghost btn-xl" onClick={() => actions.leaveResult()}>
          {state.queue.length ? '다음 예약곡 부르기' : '선곡하러 가기'}
        </button>
        {failed && (
          <button className="btn btn-primary btn-xl" onClick={() => actions.regenerate(job.id)}>
            <Icon name="redo" /> 다시 시도
          </button>
        )}
      </footer>
      {!failed && <p className="ai-later">완성되면 화면 알림과 MUVIS 앱으로 알려드립니다. 내 뮤직영상에서 이어서 볼 수 있어요.</p>}
    </section>
  );
}

// ── 결과 미리보기 · 업로드 · 재생성 ─────────────────────
export function AiPreviewScreen() {
  const { state, actions } = useKiosk();
  const job = state.jobs.find((j) => j.id === state.focusJobId);
  const [format, setFormat] = useState<VideoFormat>('short');
  if (!job || job.status !== 'done') {
    return <section className="screen"><p className="empty">아직 완성되지 않은 영상입니다</p></section>;
  }
  const out = job.outputs?.[format];
  const quota = state.quota;

  return (
    <section className="screen preview">
      <div className="preview-stage">
        <div className="preview-tabs" role="tablist">
          {(['short', 'long'] as VideoFormat[]).map((f) => (
            <button key={f} role="tab" aria-selected={format === f} className={`chip${format === f ? ' is-on' : ''}`} onClick={() => setFormat(f)}>
              {f === 'short' ? '숏폼 9:16' : '롱폼 16:9'}
              {job.outputs?.[f] && ` · ${mmss(job.outputs[f]!.durationSec)}`}
            </button>
          ))}
        </div>
        <div className={`player player-${format}`}>
          {out?.url ? (
            <video key={out.url} src={out.url} poster={out.posterUrl} controls autoPlay playsInline />
          ) : (
            <MockClip job={job} format={format} />
          )}
        </div>
      </div>

      <aside className="preview-side">
        <p className="preview-label">{job.attempt > 1 ? `${job.attempt}번째 버전` : 'AI 뮤직비디오'}</p>
        <h1>{job.song.title}</h1>
        <p className="preview-artist">{job.song.artist}</p>

        {job.published ? (
          <p className="preview-done">
            <Icon name="check" /> 앱에 업로드했습니다
          </p>
        ) : (
          quota && (
            <p className="preview-quota">
              {quota.freeLeft > 0
                ? `무료 업로드 ${quota.freeLeft}회 남음`
                : `무료 업로드를 모두 사용 · 1회 ${pts(state.pricing?.extraUpload ?? 0)}`}
            </p>
          )
        )}

        <div className="preview-actions">
          {!job.published && (
            <button className="btn btn-primary btn-xl" onClick={() => actions.publish(job.id)}>
              <Icon name="upload" /> 이 영상으로 확정하고 업로드
            </button>
          )}
          {!job.published && (
            <button className="btn btn-outline" onClick={() => actions.regenerate(job.id)}>
              <Icon name="redo" /> 다른 스타일로 다시 만들기 · {pts(state.pricing?.regenerate ?? 0)}
            </button>
          )}
          {job.published && (
            <button className="btn btn-outline" onClick={() => actions.go('audition')}>
              <Icon name="trophy" /> 이 영상으로 오디션 참가
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => actions.leaveResult()}>
            {state.queue.length ? '다음 예약곡 부르기' : '선곡하러 가기'}
          </button>
        </div>
      </aside>
    </section>
  );
}

/** 모의 서버는 실제 영상을 만들지 않으므로, 결과 자리를 보여주는 대체 화면 */
function MockClip({ job, format }: { job: AiJob; format: VideoFormat }) {
  return (
    <div className={`mockclip mockclip-${format}`} aria-label="미리보기 자리 (모의)">
      <span className="mockclip-cut mockclip-cut-1" />
      <span className="mockclip-cut mockclip-cut-2" />
      <span className="mockclip-cut mockclip-cut-3" />
      <span className="mockclip-title">
        <strong>{job.song.title}</strong>
        {job.song.artist}
      </span>
      <span className="mockclip-note">모의 미리보기 · 실서버 연결 시 실제 영상이 재생됩니다</span>
    </div>
  );
}

// ── 내 뮤직영상 ──────────────────────────────────────────
export function MyVideosScreen() {
  const { state, actions } = useKiosk();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    actions.refreshJobs().finally(() => setLoaded(true));
    // 화면에 들어올 때 한 번만 새로고침
  }, []);

  return (
    <section className="screen myvideos">
      <header className="screen-head">
        <h1>내 뮤직영상</h1>
        <p>이번 이용에서 만든 영상입니다. 지난 영상은 MUVIS 앱에서 볼 수 있어요.</p>
      </header>
      {loaded && state.jobs.length === 0 ? (
        <div className="empty-block">
          <p>아직 만든 뮤직비디오가 없어요. XR 스튜디오 모드에서 노래를 끝까지 부르면 AI가 만들어 드립니다.</p>
          {state.mode !== 'xr' && (
            <button className="btn btn-primary" onClick={() => actions.chooseMode('xr')}>
              XR 스튜디오로 바꾸기
            </button>
          )}
        </div>
      ) : (
        <ul className="videolist">
          {state.jobs.map((j) => (
            <li key={j.id}>
              <button className="video-row" onClick={() => actions.openJob(j.id)}>
                <span className={`video-thumb status-${j.status}`} aria-hidden="true">
                  {j.status === 'processing' ? `${j.progress}%` : <Icon name={j.status === 'done' ? 'play' : j.status === 'failed' ? 'close' : 'film'} />}
                </span>
                <span className="video-text">
                  <strong>{j.song.title}</strong>
                  <span>
                    {j.song.artist} · {new Date(j.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    {j.attempt > 1 && ` · ${j.attempt}번째 버전`}
                  </span>
                </span>
                <span className={`status status-${j.published ? 'published' : j.status}`}>
                  {j.published ? '업로드됨' : STATUS_LABEL[j.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
