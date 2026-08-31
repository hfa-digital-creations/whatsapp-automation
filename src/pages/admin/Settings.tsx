import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Button, Card, ErrorText, Input, Label, Select, Spinner } from '../../components/ui';

interface PlatformSettings {
  faviconUrl: string | null;
  dailyDigestTime: string;
  dailyDigestWhatsappNumber: string | null;
  enquiryAutomationMode: 'FULL_AUTONOMOUS' | 'DRAFT_APPROVE';
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

  const [digestTime, setDigestTime] = useState('09:00');
  const [digestWhatsappNumber, setDigestWhatsappNumber] = useState('');
  useEffect(() => {
    if (settings?.dailyDigestTime) setDigestTime(settings.dailyDigestTime);
    setDigestWhatsappNumber(settings?.dailyDigestWhatsappNumber ?? '');
  }, [settings?.dailyDigestTime, settings?.dailyDigestWhatsappNumber]);

  const digestSettingsMutation = useMutation({
    mutationFn: (payload: { dailyDigestTime: string; dailyDigestWhatsappNumber?: string }) =>
      api.patch('/admin/settings/digest', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-platform-settings'] });
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const enquiryModeMutation = useMutation({
    mutationFn: (enquiryAutomationMode: string) => api.patch('/admin/settings/enquiry-automation', { enquiryAutomationMode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-platform-settings'] });
      setError('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

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

      <Card className="max-w-lg p-6">
        <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">Daily Digest</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          The admin and client dashboards withhold today's figures (enquiries, follow-ups needed, renewals, payments,
          leads, drafts) until this time each day, so nobody sees a half-finished day's numbers. If a WhatsApp number
          is set below, the platform also sends the complete report to that number at this time, every day.
        </p>

        {isLoading ? (
          <Spinner />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              digestSettingsMutation.mutate({ dailyDigestTime: digestTime, dailyDigestWhatsappNumber: digestWhatsappNumber || undefined });
            }}
          >
            <div className="flex items-end gap-3">
              <div>
                <Label>Time (24-hour, server time)</Label>
                <Input type="time" value={digestTime} onChange={(e) => setDigestTime(e.target.value)} required className="w-36" />
              </div>
            </div>
            <div>
              <Label>Send Report To (WhatsApp Number)</Label>
              <Input
                placeholder="e.g. 919876543210 — leave blank to disable WhatsApp sending"
                value={digestWhatsappNumber}
                onChange={(e) => setDigestWhatsappNumber(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full sm:w-72"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Digits only, with country code. Sent via the System WhatsApp session — connect it under System WhatsApp if you haven't already.
              </p>
            </div>
            <Button type="submit" disabled={digestSettingsMutation.isPending} className="text-xs">
              {digestSettingsMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </form>
        )}
      </Card>

      <Card className="max-w-lg p-6">
        <h2 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">Enquiry &amp; WhatsApp Sales Auto-Reply Mode</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Applies to every AI reply on the system WhatsApp number — both landing-page enquiry conversations and
          anyone messaging the number directly. Full Autonomous sends replies instantly, as today. Draft &amp;
          Approve queues each AI-drafted reply for review in the Enquiries panel before it goes out.
        </p>

        {isLoading ? (
          <Spinner />
        ) : (
          <Select
            value={settings?.enquiryAutomationMode ?? 'FULL_AUTONOMOUS'}
            onChange={(e) => enquiryModeMutation.mutate(e.target.value)}
            disabled={enquiryModeMutation.isPending}
            className="w-full sm:w-80"
          >
            <option value="FULL_AUTONOMOUS">Full Autonomous (AI auto-sends responses instantly)</option>
            <option value="DRAFT_APPROVE">Draft &amp; Approve (Staff manually reviews AI drafted messages)</option>
          </Select>
        )}
      </Card>
    </div>
  );
}
