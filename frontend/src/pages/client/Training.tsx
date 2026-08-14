import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Badge, Button, Card, ErrorText, Input, Spinner, Textarea } from '../../components/ui';

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

  const { data: sources, isLoading } = useQuery<TrainingSource[]>({
    queryKey: ['client-training'],
    queryFn: async () => (await api.get('/client/training')).data.data,
    refetchInterval: 5000,
  });

  const { data: knowledge } = useQuery<KnowledgeFact[]>({
    queryKey: ['client-knowledge'],
    queryFn: async () => (await api.get('/client/training/knowledge')).data.data,
  });

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Business Knowledge &amp; AI Training
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Train your WhatsApp AI assistant with company catalogs, product prices, operating hours, and customer policies
        </p>
      </div>

      {/* Input Cards Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Text Training Card */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Add Written Knowledge Base
          </h2>
          <form onSubmit={handleTextSubmit} className="space-y-3.5">
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
        </Card>

        {/* Document Upload Dropzone */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              Upload PDF or Catalog File
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Supported formats: PDF, DOCX, TXT or CSV (up to 10MB). Text is extracted and indexed automatically.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/40 p-6 text-center transition-colors hover:border-brand-500/60 hover:bg-brand-500/5 dark:border-white/10 dark:bg-white/[0.02]"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 mb-2">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Click to browse or drop file here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">PDF, DOCX, TXT, CSV up to 10MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.csv" onChange={handleFileChange} className="hidden" />
          </div>

          {uploadMutation.isPending && (
            <div className="mt-4 flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400 font-semibold">
              <Spinner />
              <span>Uploading &amp; extracting document contents...</span>
            </div>
          )}
        </Card>
      </div>

      <ErrorText>{error}</ErrorText>

      {/* Training Sources Glass List */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Configured Training Sources ({sources?.length ?? 0})
        </h2>
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {sources?.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3.5 text-xs">
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
      </Card>

      {/* Extracted Knowledge Facts */}
      <Card className="p-6">
        <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          Extracted AI Knowledge Base ({knowledge?.length ?? 0} facts)
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          These structured facts are used by your AI assistant to formulate responses with 100% factual accuracy.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {knowledge?.map((k) => (
            <div
              key={k.id}
              className="rounded-xl border border-slate-200/50 bg-white/40 p-3 text-xs dark:border-white/5 dark:bg-white/[0.02]"
            >
              <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 font-mono">
                {k.category}
              </span>
              <p className="mt-1.5 font-bold text-slate-800 dark:text-slate-200">{k.key}</p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-400">{k.value}</p>
            </div>
          ))}
          {(!knowledge || knowledge.length === 0) && (
            <div className="col-span-full py-8 text-center text-xs text-slate-400">
              No structured facts extracted yet. Upload files or write knowledge above.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

