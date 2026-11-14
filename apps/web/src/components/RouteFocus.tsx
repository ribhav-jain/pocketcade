'use client';
// after a client-side navigation, focus moves to the new page's H1.
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function RouteFocus() {
  const pathname = usePathname();
  // The last path seen, not a "first run" flag: Strict Mode re-runs the effect on mount, which is no navigation.
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
