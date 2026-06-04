import { Skeleton } from '../ui/Skeleton';

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 18,
      padding: 24,
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid rgba(0,0,0,0.05)',
    }}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
        <Skeleton width="200px" height="28px" borderRadius="10px" />
        <Skeleton width="130px" height="14px" borderRadius="6px" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton width="150px" height="36px" borderRadius="10px" />
        <Skeleton width="140px" height="36px" borderRadius="10px" />
      </div>

      {/* 3 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[0, 1, 2].map(i => (
          <SkeletonCard key={i}>
            <Skeleton width="36px" height="36px" borderRadius="10px" />
            <div style={{ marginTop: 16 }}>
              <Skeleton width="50px" height="32px" borderRadius="8px" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Skeleton width="90px" height="12px" borderRadius="6px" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Skeleton height="42px" borderRadius="10px" />
        <Skeleton width="130px" height="42px" borderRadius="10px" />
        <Skeleton width="180px" height="42px" borderRadius="10px" />
      </div>

      {/* Patient cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <SkeletonCard key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Skeleton width="48px" height="48px" borderRadius="50%" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton width="70%" height="14px" borderRadius="6px" />
                <Skeleton width="40%" height="12px" borderRadius="6px" />
              </div>
            </div>
            <Skeleton width="60%" height="12px" borderRadius="6px" />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
              <Skeleton width="60px" height="20px" borderRadius="20px" />
              <Skeleton width="100px" height="20px" borderRadius="20px" />
            </div>
          </SkeletonCard>
        ))}
      </div>

    </div>
  );
}
