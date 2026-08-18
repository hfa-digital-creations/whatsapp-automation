import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Pagination, Spinner, TabPanel, Tabs, Textarea } from '../../components/ui';
import { usePagination } from '../../lib/usePagination';

interface TrainingSource {
  id: string; title: string; type: string; status: string; fileName: string | null; createdAt: string;
}
interface KnowledgeFact { id: string; category: string; key: string; value: string; }

const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber'> = {
  PENDING: 'amber', PROCESSED: 'green', FAILED: 'red',
};

export default function ClientTraining() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [activeInputTab, setActiveInputTab] = useState<'text' | 'document'>('text');
  const [activeViewTab, setActiveViewTab] = useState<'sources' | 'facts'>('sources');
  const [importMessage, setImportMessage] = useState('');

  const { data: sources, isLoading } = useQuery<TrainingSource[]>({
    queryKey: ['client-training'],
    queryFn: async () => (await api.get('/client/training')).data.data,
    refetchInterval: 5000,
  });

  const { data: knowledge } = useQuery<KnowledgeFact[]>({
    queryKey: ['client-knowledge'],
    queryFn: async () => (await api.get('/client/training/knowledge')).data.data,
  });

  const sourcesPagination = usePagination(sources, 15);
  const knowledgePagination = usePagination(knowledge, 20);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const createTextMutation = useMutation({
    mutationFn: () => api.post('/client/training/text', { title, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-training'] });
      setTitle('');
      setContent('');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post('/client/training/document', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-training'] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: async () => (await api.get('/client/training/export')).data.data,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (data.exportedFrom ?? 'business').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.href = url;
      a.download = `${safeName}-training-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post('/client/training/import', form);
    },
    onSuccess: (res) => {
      setError('');
      setImportMessage(`Imported ${res.data.data.imported} training source(s).`);
      queryClient.invalidateQueries({ queryKey: ['client-training'] });
      queryClient.invalidateQueries({ queryKey: ['client-knowledge'] });
      if (importInputRef.current) importInputRef.current.value = '';
      setTimeout(() => setImportMessage(''), 4000);
    },
    onError: (err) => {
      setError(apiErrorMessage(err));
      if (importInputRef.current) importInputRef.current.value = '';
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => api.post(`/client/training/${id}/reprocess`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-training'] });
      queryClient.invalidateQueries({ queryKey: ['client-knowledge'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/training/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-training'] });
      queryClient.invalidateQueries({ queryKey: ['client-knowledge'] });
    },
  });

  function handleTextSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createTextMutation.mutate();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setError('');
      uploadMutation.mutate(file);
    }
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setError('');
      setImportMessage('');
      importMutation.mutate(file);
    }
  }

  return (
    <div className="space-y-8 animate-glass-entrance">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Business Knowledge &amp; AI Training
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Train your WhatsApp AI assistant with company catalogs, product prices, operating hours, and customer policies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !sources?.length}
          >
            {exportMutation.isPending ? 'Exporting...' : '↓ Export Training Data'}
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => importInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? 'Importing...' : '↑ Import Training Data'}
          </Button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFileChange} className="hidden" />
        </div>
      </div>
      {importMessage && (
        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{importMessage}</p>
      )}

      {/* Input Section Card with Tabs */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              Add New Knowledge Source
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Choose how to feed training material to your AI agent</p>
          </div>
          <Tabs
            tabs={[
              {
                id: 'text',
                label: 'Written Knowledge Base',
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                ),
              },
              {
                id: 'document',
                label: 'Upload Document / PDF',
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                ),
              },
            ]}
            activeTab={activeInputTab}
            onChange={(t) => setActiveInputTab(t)}
          />
        </div>

        <TabPanel id="text" activeTab={activeInputTab}>
          <form onSubmit={handleTextSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Topic / Category Title</label>
              <Input placeholder="e.g. Services, Delivery Rates &amp; Timings" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Knowledge Content</label>
              <Textarea
                placeholder="Detail your company products, pricing tiers, FAQs, return rules, and working hours..."
                rows={5}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={createTextMutation.isPending} className="text-xs">
              {createTextMutation.isPending ? 'Saving...' : 'Add Knowledge Section'}
            </Button>
          </form>
        </TabPanel>

        <TabPanel id="document" activeTab={activeInputTab}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supported formats: PDF, DOCX, TXT or CSV (up to 10MB). Text is extracted and indexed automatically by the system.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/40 p-8 text-center transition-all duration-300 hover:border-brand-500/60 hover:bg-brand-500/5 dark:border-white/10 dark:bg-white/[0.02]"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 mb-3 shadow-sm">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Click to browse or drop file here
              </p>
              <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, TXT, CSV up to 10MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.csv" onChange={handleFileChange} className="hidden" />

            {uploadMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400 font-semibold">
                <Spinner />
                <span>Uploading &amp; extracting document contents...</span>
              </div>
            )}
          </div>
        </TabPanel>
      </Card>

      <ErrorText>{error}</ErrorText>

      {/* Review Section with Animated Tabs */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Indexed Knowledge Overview
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Explore configured data sources and auto-generated knowledge facts</p>
          </div>
          <Tabs
            tabs={[
              {
                id: 'sources',
                label: 'Configured Sources',
                count: sources?.length ?? 0,
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                ),
              },
              {
                id: 'facts',
                label: 'Extracted AI Facts',
                count: knowledge?.length ?? 0,
                icon: (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
              },
            ]}
            activeTab={activeViewTab}
            onChange={(t) => setActiveViewTab(t)}
          />
        </div>

        {/* Tab 1: Configured Sources */}
        <TabPanel id="sources" activeTab={activeViewTab}>
          {isLoading ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {sourcesPagination.pageItems.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{s.title}</p>
                    <p className="text-slate-400 font-mono mt-0.5">{s.type}{s.fileName ? ` · ${s.fileName}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={TONE[s.status] ?? 'gray'}>{s.status}</Badge>
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => reprocessMutation.mutate(s.id)}>
                      Reprocess
                    </Button>
                    <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => deleteMutation.mutate(s.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
              {sources?.length === 0 && (
                <li className="py-8 text-center text-xs text-slate-400">No training data configured yet.</li>
              )}
            </ul>
          )}

          <Pagination
            page={sourcesPagination.page}
            totalPages={sourcesPagination.totalPages}
            onPageChange={sourcesPagination.setPage}
            className="mt-4"
          />
        </TabPanel>

        {/* Tab 2: Extracted Facts */}
        <TabPanel id="facts" activeTab={activeViewTab}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {knowledgePagination.pageItems.map((k) => (
              <div
                key={k.id}
                className="rounded-xl border border-slate-200/50 bg-white/40 p-3.5 text-xs dark:border-white/5 dark:bg-white/[0.02] transition-all hover:bg-white/60 dark:hover:bg-white/5"
              >
                <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 font-mono">
                  {k.category}
                </span>
                <p className="mt-2 font-bold text-slate-800 dark:text-slate-200">{k.key}</p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-400 leading-relaxed">{k.value}</p>
              </div>
            ))}
            {(!knowledge || knowledge.length === 0) && (
              <div className="col-span-full py-8 text-center text-xs text-slate-400">
                No structured facts extracted yet. Upload files or write knowledge above.
              </div>
            )}
          </div>

          <Pagination
            page={knowledgePagination.page}
            totalPages={knowledgePagination.totalPages}
            onPageChange={knowledgePagination.setPage}
            className="mt-4"
          />
        </TabPanel>
      </Card>
    </div>
  );
}


