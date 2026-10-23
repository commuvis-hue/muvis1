const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5',
  back: 'M15 5l-7 7 7 7',
  fire: 'M12 3c.8 3 4.5 4.8 4.5 9.5A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.5c0-2 .9-3.3 2-4.3.1 1.8.9 2.8 2 3 0-3-.6-5.4.5-8.2zM6 21h12',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  wave: 'M2 12h3l2-6 3 12 3-15 3 15 2-6h4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3.5 4M16 6h3a3 3 0 0 1-3.5 4M12 13v4M8.5 21h7M10 17h4v4h-4z',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  megaphone: 'M3 10v4h3l8 4.5v-13L6 10zM17 9a4 4 0 0 1 0 6M6 14l1.5 5h3L9 14',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12.5h7M7 16h4',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20',
  remote: 'M8 3h8v18H8zM12 6.5v.01M10 10h4M10 13h4M10 16h4',
  plus: 'M12 5v14M5 12h14',
  power: 'M12 3v8M6.5 6.5a7.5 7.5 0 1 0 11 0',
  mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6',
  camera: 'M3 7h4l2-2.5h6L17 7h4v12H3zM12 10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  play: 'M7 4.5v15l12-7.5z',
  skip: 'M5 5l8 7-8 7zM13 5l8 7-8 7',
  stop: 'M6 6h12v12H6z',
  queue: 'M4 6h12M4 11h12M4 16h7M18 13v7M15 17l3 3 3-3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 15v5h16v-5',
  redo: 'M20 7v5h-5M19.5 12A8 8 0 1 0 17 17.5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  card: 'M3 6h18v12H3zM3 10h18M6.5 14.5h4',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.4-1.7M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 11 6M12 20h.01',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  mask: 'M3.5 6.5C7 4.5 17 4.5 20.5 6.5c0 7-3.5 12-8.5 12s-8.5-5-8.5-12zM7 10.5c1-1 3-1 4 0M13 10.5c1-1 3-1 4 0M10 15h4',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = '1.5em', className }: { name: IconName; size?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
