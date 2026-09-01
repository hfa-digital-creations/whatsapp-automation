import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PlatformSettings {
  logoUrl: string | null;
  updatedAt: string;
}

/** The admin-configured product logo (if any) — same query key/cache as FaviconLoader, so
 * every component reading it shares one request instead of each firing its own. */
export function usePlatformLogo(): string | null {
  const { data } = useQuery<PlatformSettings>({
    queryKey: ['public-platform-settings'],
    queryFn: async () => (await api.get('/public/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  return data?.logoUrl ? `${data.logoUrl}?v=${encodeURIComponent(data.updatedAt)}` : null;
}
