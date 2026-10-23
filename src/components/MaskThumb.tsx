import { MASK_VIEWBOX, type Fill, type MaskDef } from '@/lib/ar/masks';

/** 가면 썸네일 (가면 레이어를 SVG로 그대로 그림) */
export function MaskThumb({ mask }: { mask: MaskDef }) {
  if (mask.image) return <img className="mask-thumb" src={mask.image.src} alt="" />;
  const gid = (i: number) => `mg-${mask.id}-${i}`;
  const fillOf = (f: Fill | undefined, i: number) => (f === undefined ? 'none' : typeof f === 'string' ? f : `url(#${gid(i)})`);
  return (
    <svg className="mask-thumb" viewBox={MASK_VIEWBOX} aria-hidden="true">
      <defs>
        {mask.layers?.map((l, i) => {
          const f = l.fill;
          if (!f || typeof f === 'string') return null;
          const stops = f.stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />);
          return 'linear' in f ? (
            <linearGradient key={i} id={gid(i)} gradientUnits="userSpaceOnUse" x1={f.linear[0][0]} y1={f.linear[0][1]} x2={f.linear[1][0]} y2={f.linear[1][1]}>
              {stops}
            </linearGradient>
          ) : (
            <radialGradient key={i} id={gid(i)} gradientUnits="userSpaceOnUse" cx={f.radial[0][0]} cy={f.radial[0][1]} r={f.radial[1]}>
              {stops}
            </radialGradient>
          );
        })}
      </defs>
      {mask.layers?.map((l, i) => (
        <path
          key={i}
          d={l.d}
          fill={fillOf(l.fill, i)}
          stroke={l.stroke ?? 'none'}
          strokeWidth={l.width ?? (l.stroke ? 4 : 0)}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
