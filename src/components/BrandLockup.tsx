import { cn } from '../lib/utils';

function CoronaDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <radialGradient id={`${prefix}-corona`} cx="50%" cy="50%" r="50%">
        <stop offset="52%" stopColor="#F5F3FF" stopOpacity="0" />
        <stop offset="56%" stopColor="#F5F3FF" stopOpacity="1" />
        <stop offset="62%" stopColor="#A78BFA" stopOpacity="0.95" />
        <stop offset="74%" stopColor="#4F46E5" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#312E81" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${prefix}-disk`} cx="38%" cy="34%" r="70%">
        <stop offset="0%" stopColor="#14141C" />
        <stop offset="100%" stopColor="#08080C" />
      </radialGradient>
    </defs>
  );
}

function Eclipse({
  prefix,
  cx,
  cy,
  coronaR,
  rimR,
  diskR,
  spark,
  bead,
}: {
  prefix: string;
  cx: number;
  cy: number;
  coronaR: number;
  rimR: number;
  diskR: number;
  spark: { x: number; y: number };
  bead: { cx: number; cy: number };
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={coronaR} fill={`url(#${prefix}-corona)`} />
      <circle cx={cx} cy={cy} r={rimR} fill="none" stroke="#F5F3FF" strokeWidth="2.2" />
      <circle cx={cx} cy={cy} r={diskR} fill={`url(#${prefix}-disk)`} />
      <g transform={`translate(${spark.x}, ${spark.y})`}>
        <polygon
          points="0,-14 2.2,-2.2 14,0 2.2,2.2 0,14 -2.2,2.2 -14,0 -2.2,-2.2"
          fill="#FFFFFF"
        />
        <circle r="2.4" fill="#FFFFFF" />
      </g>
      <circle cx={bead.cx} cy={bead.cy} r="1.6" fill="#FFFFFF" fillOpacity="0.85" />
    </g>
  );
}

function HorizontalLockup({
  variant,
  className,
}: {
  variant: 'light' | 'dark';
  className?: string;
}) {
  const word = variant === 'light' ? '#111318' : '#FFFFFF';
  const cloud = variant === 'light' ? '#6B7280' : '#B0A8C4';
  const prefix = `lockup-${variant}`;
  return (
    <svg
      viewBox="36 72 560 214"
      className={className}
      aria-hidden
    >
      <CoronaDefs prefix={prefix} />
      <text
        x="56"
        y="198"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="132"
        fontWeight="560"
        fill={word}
      >
        N
      </text>
      <Eclipse
        prefix={prefix}
        cx={248}
        cy={168}
        coronaR={92.56}
        rimR={54}
        diskR={52}
        spark={{ x: 292.1, y: 140.44 }}
        bead={{ cx: 202.97, cy: 194 }}
      />
      <text
        x="318"
        y="198"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="132"
        fontWeight="560"
        fill={word}
      >
        xen
      </text>
      <text
        x="430"
        y="268"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="22"
        fontWeight="500"
        letterSpacing="12"
        fill={cloud}
      >
        CLOUD
      </text>
    </svg>
  );
}

function EclipseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-hidden>
      <title>Noxen</title>
      <CoronaDefs prefix="mark" />
      <Eclipse
        prefix="mark"
        cx={256}
        cy={256}
        coronaR={210.04}
        rimR={120}
        diskR={118}
        spark={{ x: 356.07, y: 193.47 }}
        bead={{ cx: 153.81, cy: 315 }}
      />
    </svg>
  );
}

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('px-3 py-3', collapsed && 'lg:px-1.5 lg:py-3')}>
      <div className={cn(collapsed && 'lg:hidden')} role="img" aria-label="Noxen Cloud">
        <HorizontalLockup variant="light" className="brand-lockup-light w-full h-auto" />
        <HorizontalLockup variant="dark" className="brand-lockup-dark w-full h-auto" />
      </div>
      <EclipseMark className={cn('hidden h-8 w-8 mx-auto', collapsed && 'lg:block')} />
    </div>
  );
}
