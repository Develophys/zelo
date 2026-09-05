import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { titleForPathname } from '@/presentation/lib/route-title';

export function useDocumentTitle(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleForPathname(pathname);
  }, [pathname]);
}
