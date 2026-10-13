// src/components/Skeletons.jsx
// Loading placeholders for every list screen.

export function SkeletonLine({ height = 14, width = '70%', style }) {
  return <span className="skeleton" style={{ display: 'block', height, width, ...style }} />;
}

export function TournamentCardSkeleton() {
  return (
    <div className="t-card" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <span className="t-card-media" style={{ background: 'var(--bg-elevated)' }} />
      <span className="t-card-body">
        <SkeletonLine height={18} width="70%" />
        <SkeletonLine height={13} width="45%" />
        <SkeletonLine height={6} width="100%" style={{ borderRadius: 999 }} />
        <SkeletonLine height={22} width="55%" />
      </span>
    </div>
  );
}

export function ListSkeleton({ count = 3, children }) {
  return (
    <div className="card-grid" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) =>
        children ? <div key={i}>{children}</div> : <TournamentCardSkeleton key={i} />
      )}
    </div>
  );
}
