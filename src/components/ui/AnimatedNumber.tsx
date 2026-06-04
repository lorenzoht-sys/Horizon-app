import { useState, useEffect, useRef } from 'react';
import { useInView } from 'react-intersection-observer';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedNumber({
  value,
  duration = 1.2,
  prefix = '',
  suffix = '',
  decimals = 0,
}: AnimatedNumberProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!inView) return;
    const startTime = performance.now();
    const durationMs = duration * 1000;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const factor = Math.pow(10, decimals);
      setCurrent(Math.round(eased * value * factor) / factor);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [inView, value, duration, decimals]);

  const display = decimals > 0 ? current.toFixed(decimals) : String(current);

  return (
    <span ref={ref}>
      {prefix}{display}{suffix}
    </span>
  );
}
