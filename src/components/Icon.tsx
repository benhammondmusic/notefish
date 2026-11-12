// Small stroke icons for buttons. They inherit color from the button via currentColor.

const PATHS = {
  home: 'M4 11.5 12 4l8 7.5M6.5 9.5V20h4v-5.5h3V20h4V9.5',
  skip: 'M5 5.5v13l9-6.5zM18 5.5v13',
  replay: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4',
  next: 'M8 5l8 7-8 7',
  back: 'M16 5l-8 7 8 7',
  play: 'M8 5.5v13l10-6.5z',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.4 7.4 0 0 1-1.9 1.1L14.9 21h-3.8l-.3-2.5a7.4 7.4 0 0 1-1.9-1.1l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-3L5 9.3l2-3.4 1.9.7a7.4 7.4 0 0 1 1.9-1.1L11.1 3h3.8l.3 2.5a7.4 7.4 0 0 1 1.9 1.1l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 3z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3',
  speaker: 'M4 9.5v5h3.5L12 19V5L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 32 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
