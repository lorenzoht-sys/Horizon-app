interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

export function Skeleton({
  className = '',
  width = '100%',
  height = '16px',
  borderRadius = '8px',
}: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, #e8edf0 25%, #dce4e9 50%, #e8edf0 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.6s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  );
}
