import { cn } from '../lib/utils';

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('px-2.5 py-3', collapsed && 'lg:px-1.5 lg:py-3')}>
      <div className={cn(collapsed && 'lg:hidden')} role="img" aria-label="Noxen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wordmark-horizontal-light.png"
          alt=""
          className="brand-lockup-light w-full h-auto"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wordmark-horizontal-dark.png"
          alt=""
          className="brand-lockup-dark w-full h-auto"
        />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/mark-eclipse.png"
        alt=""
        className={cn('hidden h-8 w-8 mx-auto object-contain', collapsed && 'lg:block')}
      />
    </div>
  );
}
