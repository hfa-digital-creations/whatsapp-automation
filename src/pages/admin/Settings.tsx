import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Button, Card, ErrorText, Spinner } from '../../components/ui';

interface PlatformSettings {
  faviconUrl: string | null;
  updatedAt: string;
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ['admin-platform-settings'],
    queryFn: async () => (await api.get('/public/settings')).data.data,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post('/admin/settings/favicon', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-platform-settings'] });
      setError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }

  const faviconPreviewUrl = settings?.faviconUrl ? `${settings.faviconUrl}?v=${encodeURIComponent(settings.updatedAt)}` : null;

  return (
    <div className="space-y-8 animate-glass-entrance">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Platform Settings</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Site-wide settings that apply across the landing page, admin panel, and client panel.</p>
      </div>

      <Card className="max-w-lg p-6">
        <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">Browser Tab Icon (Favicon)</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Shown in the browser tab everywhere on the site. PNG or ICO, under 1MB.
        </p>

        {isLoading ? (
          <Spinner />
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 bg-white/40 dark:border-white/10 dark:bg-white/[0.02]">
              {faviconPreviewUrl ? (
                <img src={faviconPreviewUrl} alt="Current favicon" className="h-10 w-10 object-contain" />
              ) : (
                <span className="text-center text-[10px] text-slate-400">None set</span>
              )}
            </div>
            <div>
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="text-xs">
                {uploadMutation.isPending ? 'Uploading...' : settings?.faviconUrl ? 'Change Favicon' : 'Upload Favicon'}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/x-icon,image/png,.ico,.png" onChange={handleFileChange} className="hidden" />
            </div>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
      </Card>
    </div>
  );
}
