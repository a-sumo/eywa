interface Props {
  size?: number;
  className?: string;
}

export default function EywaLogo({ size = 48, className = '' }: Props) {
  const cyan = '#4eeaff';
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
        {/* Center tendril - straight up (cyan) */}
        <circle cx="24" cy="32" r="2.2" fill={cyan} />
        <circle cx="24" cy="26" r="2.5" fill={cyan} opacity="0.9" />
        <circle cx="24" cy="20" r="2.2" fill={cyan} opacity="0.8" />
        <circle cx="24" cy="14" r="1.9" fill={cyan} opacity="0.7" />
        <circle cx="24" cy="9" r="1.6" fill={cyan} opacity="0.6" />

        {/* Left arc - goes UP then curves OUT and DOWN (purple) */}
        <circle cx="21" cy="32" r="1.8" fill={purple} />
        <circle cx="18" cy="26" r="2" fill={purple} opacity="0.9" />
        <circle cx="14" cy="20" r="1.9" fill={purple} opacity="0.85" />
        <circle cx="10" cy="16" r="1.7" fill={purple} opacity="0.75" />
        <circle cx="6" cy="14" r="1.5" fill={purple} opacity="0.65" />
        <circle cx="3" cy="16" r="1.3" fill={purple} opacity="0.55" />
        <circle cx="2" cy="21" r="1.1" fill={purple} opacity="0.45" />

        {/* Left outer arc - goes UP then curves OUT and DOWN more (pink) */}
        <circle cx="19" cy="34" r="1.5" fill={pink} />
        <circle cx="14" cy="30" r="1.7" fill={pink} opacity="0.9" />
        <circle cx="9" cy="26" r="1.6" fill={pink} opacity="0.8" />
        <circle cx="5" cy="24" r="1.4" fill={pink} opacity="0.7" />
        <circle cx="3" cy="26" r="1.2" fill={pink} opacity="0.6" />
        <circle cx="3" cy="32" r="1" fill={pink} opacity="0.5" />

        {/* Right arc - goes UP then curves OUT and DOWN (purple) */}
        <circle cx="27" cy="32" r="1.8" fill={purple} />
        <circle cx="30" cy="26" r="2" fill={purple} opacity="0.9" />
        <circle cx="34" cy="20" r="1.9" fill={purple} opacity="0.85" />
        <circle cx="38" cy="16" r="1.7" fill={purple} opacity="0.75" />
        <circle cx="42" cy="14" r="1.5" fill={purple} opacity="0.65" />
        <circle cx="45" cy="16" r="1.3" fill={purple} opacity="0.55" />
        <circle cx="46" cy="21" r="1.1" fill={purple} opacity="0.45" />

        {/* Right outer arc - goes UP then curves OUT and DOWN more (pink) */}
        <circle cx="29" cy="34" r="1.5" fill={pink} />
        <circle cx="34" cy="30" r="1.7" fill={pink} opacity="0.9" />
        <circle cx="39" cy="26" r="1.6" fill={pink} opacity="0.8" />
        <circle cx="43" cy="24" r="1.4" fill={pink} opacity="0.7" />
        <circle cx="45" cy="26" r="1.2" fill={pink} opacity="0.6" />
        <circle cx="45" cy="32" r="1" fill={pink} opacity="0.5" />
      </g>

      {/* Core */}
      <ellipse cx="24" cy="38" rx="5" ry="3" fill="url(#eywa-core)" filter="url(#eywa-glow)" />
      <ellipse cx="24" cy="38" rx="2.5" ry="1.5" fill="#fff" />
    </svg>
  );
}
