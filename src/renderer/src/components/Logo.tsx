// Backlink Launchpad mark: two chain links launching up-right, Wriai green accent. Source: resources/logo.svg
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#111827" />
      <g transform="translate(1 -2)" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="35.5" width="24" height="13" rx="6.5" transform="rotate(-45 22 42)" />
        <rect x="22" y="23.5" width="24" height="13" rx="6.5" transform="rotate(-45 34 30)" />
        <path d="M40.5 14.5 H49.5 V23.5" />
      </g>
      <circle cx="16.5" cy="16.5" r="3.6" fill="#10B981" />
    </svg>
  )
}

export const APP_NAME = 'Backlink Launchpad'
export const APP_BY = 'by Wriai'
