import type { ReactNode } from "react";

/**
 * Small inline SVG icons (stroke style, 24x24). They are decorative: always aria-hidden,
 * because the text next to them carries the meaning. No external icon font or image requests.
 */
interface IconProps {
  className?: string;
}

function Svg({ className, children, strokeWidth = 1.8 }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconSun = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
);

export const IconGlobe = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
  </Svg>
);

export const IconChevronDown = ({ className }: IconProps) => (
  <Svg className={className} strokeWidth={2.2}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconPackage = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </Svg>
);

export const IconCalculator = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="5" y="2.5" width="14" height="19" rx="3" />
    <path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
  </Svg>
);

export const IconUser = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const IconHash = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />
  </Svg>
);

export const IconCheck = ({ className }: IconProps) => (
  <Svg className={className} strokeWidth={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconAlert = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7.5V13M12 16.5h.01" />
  </Svg>
);

export const IconInfo = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Svg>
);

export const IconClock = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const IconSparkles = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  </Svg>
);

export const IconShield = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const IconCalendar = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconDatabase = ({ className }: IconProps) => (
  <Svg className={className}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
);

export const IconTag = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 12V4h8l10 10-8 8L3 12z" />
    <circle cx="7.5" cy="8.5" r="1" />
  </Svg>
);

export const IconFileText = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);

export const IconPencil = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </Svg>
);

export const IconFlask = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9 3h6M10 3v6l-5.5 10a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <Svg className={className} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconArrowLeft = ({ className }: IconProps) => (
  <Svg className={className} strokeWidth={2.2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconSave = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M7 3v5h8V3M7 21v-7h10v7" />
  </Svg>
);

export const IconRefresh = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
  </Svg>
);

/** The brand mark: a stack of paper with a forward arrow ("flow"). */
export const IconLogo = ({ className }: IconProps) => (
  <Svg className={className} strokeWidth={1.9}>
    <path d="M7 4.5h8.5L19 8v11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19.5v-14A1 1 0 0 1 7 4.5z" />
    <path d="M9 13h6M12.5 10.5 15 13l-2.5 2.5" />
    <path d="M3.5 8v10.5" opacity="0.55" />
  </Svg>
);
