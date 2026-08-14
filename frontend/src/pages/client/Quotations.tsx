import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { Button, Card, ErrorText, Input, Textarea } from '../../components/ui';

interface Template {
  id: string; service: string; startingPrice: string; templateText: string | null; paymentTerms: string | null; validityDays: number;
}
interface Quotation { id: string; generatedText: string; amount: string; createdAt: string; }

const EMPTY_TEMPLATE = { service: '', startingPrice: '', templateText: '', paymentTerms: '', validityDays: '7' };

export default function ClientQuotations() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [error, setError] = useState('');

  const { data: templates } = useQuery<Template[]>({
    queryKey: ['client-quotation-templates'],
    queryFn: async () => (await api.get('/client/quotations/templates')).data.data,
  });

  const { data: quotations } = useQuery<Quotation[]>({
    queryKey: ['client-quotations'],
    queryFn: async () => (await api.get('/client/quotations')).data.data,
  });

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      api.post('/client/quotations/templates', {
        service: form.service,
        startingPrice: Number(form.startingPrice),
        templateText: form.templateText || undefined,
        paymentTerms: form.paymentTerms || undefined,
        validityDays: Number(form.validityDays),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-quotation-templates'] });
      setForm(EMPTY_TEMPLATE);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/client/quotations/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-quotation-templates'] }),
  });

  const generateMutation = useMutation({
    mutationFn: (templateId: string) => api.post('/client/quotations/generate', { templateId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-quotations'] }),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    createTemplateMutation.mutate();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Price Quotations &amp; Rate Cards
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure service pricing templates that your AI assistant can auto-calculate and dispatch to prospects on WhatsApp
        </p>
      </div>

      {/* New Template Card */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          Create Service Rate Template
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Service / Package Title</label>
            <Input placeholder="e.g. Standard Exhibition Stall Setup" required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Starting Price (₹ INR)</label>
            <Input placeholder="15000" type="number" required value={form.startingPrice} onChange={(e) => setForm({ ...form, startingPrice: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Validity (Days)</label>
            <Input placeholder="7" type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Payment Terms</label>
            <Input placeholder="e.g. 50% advance, 50% on completion" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
          </div>
          <div className="col-span-full">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Quotation Message Format (Optional)</label>
              <div className="flex gap-1.5 font-mono text-[10px] text-brand-600 dark:text-brand-400">
                <span>{`{{service}}`}</span>
                <span>{`{{price}}`}</span>
                <span>{`{{validUntil}}`}</span>
              </div>
            </div>
            <Textarea
              placeholder="Hi there! Here is our formal estimate for {{service}}: Total ₹{{price}} (valid until {{validUntil}}). Terms: {{paymentTerms}}."
              rows={3}
              value={form.templateText}
              onChange={(e) => setForm({ ...form, templateText: e.target.value })}
            />
          </div>
          <div className="col-span-full flex items-center gap-3">
            <Button type="submit" disabled={createTemplateMutation.isPending} className="text-xs">
              {createTemplateMutation.isPending ? 'Saving Template...' : 'Save Rate Template'}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {templates?.map((t) => (
          <Card key={t.id} hoverEffect className="p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{t.service}</h3>
                  <p className="text-2xl font-extrabold tracking-tight text-brand-600 dark:text-brand-400 mt-1">
                    ₹{Number(t.startingPrice).toLocaleString('en-IN')}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {t.validityDays} Days Validity
                </span>
              </div>
              {t.paymentTerms && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Terms:</span> {t.paymentTerms}
                </p>
              )}
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
              <Button
                className="px-3 py-1 text-xs flex-1"
                onClick={() => generateMutation.mutate(t.id)}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Generating...' : '⚡ Generate Test Quote'}
              </Button>
              <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => deleteTemplateMutation.mutate(t.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {templates?.length === 0 && (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">
            No quotation templates created yet.
          </div>
        )}
      </div>

      {/* Generated Quotations Log */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Recent Generated Quotations ({quotations?.length ?? 0})
        </h2>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {quotations?.map((q) => (
            <li key={q.id} className="py-4 text-xs">
              <p className="whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                {q.generatedText}
              </p>
              <p className="mt-2 text-[11px] text-slate-400 font-mono">
                Amount: ₹{Number(q.amount).toLocaleString('en-IN')} &middot; Generated on {new Date(q.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {(!quotations || quotations.length === 0) && (
            <li className="py-8 text-center text-xs text-slate-400">No quotation logs recorded yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

