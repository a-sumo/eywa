interface Props {
  size?: number;
  className?: string;
}

export default function EywaLogo({ size = 48, className = '' }: Props) {
  const cyan = '#4eeaff';
  const blue = '#6b8cff';
  const purple = '#a855f7';
  const pink = '#f472b6';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
    >
      <defs>
        <filter id="eywa-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="eywa-core" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="50%" stopColor={cyan} />
          <stop offset="100%" stopColor={cyan} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter="url(#eywa-glow)">
        {/* Center tendril - straight up */}
        <circle cx="24" cy="30" r="2.2" fill={cyan} />
        <circle cx="24" cy="24" r="2.5" fill={cyan} opacity="0.9" />
        <circle cx="24" cy="18" r="2.2" fill={cyan} opacity="0.8" />
        <circle cx="24" cy="13" r="1.8" fill={cyan} opacity="0.7" />
        <circle cx="24" cy="9" r="1.5" fill={cyan} opacity="0.6" />

        {/* Left arc - curves out and droops down */}
        <circle cx="20" cy="30" r="1.9" fill={purple} />
        <circle cx="14" cy="26" r="2.2" fill={purple} opacity="0.9" />
        <circle cx="9" cy="25" r="2" fill={purple} opacity="0.8" />
        <circle cx="5" cy="27" r="1.7" fill={purple} opacity="0.7" />
        <circle cx="3" cy="32" r="1.4" fill={purple} opacity="0.6" />

        {/* Left outer arc - droops more */}
        <circle cx="18" cy="32" r="1.6" fill={pink} />
        <circle cx="12" cy="32" r="1.8" fill={pink} opacity="0.85" />
        <circle cx="7" cy="35" r="1.6" fill={pink} opacity="0.7" />
        <circle cx="5" cy="40" r="1.4" fill={pink} opacity="0.55" />

        {/* Right arc - curves out and droops down */}
        <circle cx="28" cy="30" r="1.9" fill={cyan} />
        <circle cx="34" cy="26" r="2.2" fill={cyan} opacity="0.9" />
        <circle cx="39" cy="25" r="2" fill={cyan} opacity="0.8" />
        <circle cx="43" cy="27" r="1.7" fill={cyan} opacity="0.7" />
        <circle cx="45" cy="32" r="1.4" fill={cyan} opacity="0.6" />

        {/* Right outer arc - droops more */}
        <circle cx="30" cy="32" r="1.6" fill={blue} />
        <circle cx="36" cy="32" r="1.8" fill={blue} opacity="0.85" />
        <circle cx="41" cy="35" r="1.6" fill={blue} opacity="0.7" />
        <circle cx="43" cy="40" r="1.4" fill={blue} opacity="0.55" />
      </g>

      {/* Core */}
      <ellipse cx="24" cy="36" rx="5" ry="3" fill="url(#eywa-core)" filter="url(#eywa-glow)" />
      <ellipse cx="24" cy="36" rx="2.5" ry="1.5" fill="#fff" />
    </svg>
  );
}
