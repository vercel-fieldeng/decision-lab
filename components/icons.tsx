import type { CSSProperties } from "react";

const paths = {
  arrow: (
    <>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </>
  ),
  upRight: (
    <>
      <path d="M7 17 17 7M7 7h10v10" />
    </>
  ),
  play: <path d="m9 5 11 7-11 7Z" />,
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />,
  text: (
    <>
      <path d="M4 5h16M12 5v15M8 20h8" />
    </>
  ),
  braces: (
    <>
      <path d="M9 3H7a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M15 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  boolean: (
    <>
      <path d="m4 7 3 3 5-6M14 7h6M4 17h6M15 14l6 6M21 14l-6 6" />
    </>
  ),
  choice: (
    <>
      <path d="M5 4v16M5 8h7a4 4 0 0 0 4-4M5 16h7a4 4 0 0 1 4 4M16 4h4M16 20h4" />
      <circle cx="5" cy="4" r="1" />
      <circle cx="5" cy="20" r="1" />
    </>
  ),
  score: (
    <>
      <path d="M4 20V12M10 20V8M16 20V4M22 20H2" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
  book: (
    <>
      <path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3M7 8l5-5 5 5M4 16v5h16v-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v.1" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13M7 11l5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  focus: <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />,
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 16,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
