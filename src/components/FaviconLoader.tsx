import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PlatformSettings {
  faviconUrl: string | null;
  updatedAt: string;
}

/** Applies the admin-configured favicon (if any) across every page — landing, login, admin, and client alike. */
export function FaviconLoader() {
  const { data } = useQuery<PlatformSettings>({
    queryKey: ['public-platform-settings'],
    queryFn: async () => (await api.get('/public/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data?.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    // Cache-bust with updatedAt so a newly uploaded favicon shows immediately instead
    // of the browser reusing whatever it cached at this same URL from before.
    link.href = `${data.faviconUrl}?v=${encodeURIComponent(data.updatedAt)}`;
  }, [data]);

  return null;
}
