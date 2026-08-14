import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import { Button, Card, ErrorText, Input, Textarea } from '../../components/ui';

interface Plan {
  id: string;
  name: string;
  title: string;
  shortDescription?: string;
  price: string;
  currency: string;
  durationValue: number;
  durationType: 'DAYS' | 'MONTHS' | 'YEARS';
  whatsappAccountLimit: number;
  planFeatures: { feature: { name: string; code: string } }[];
}

const FEATURES = [
  { title: '24/7 WhatsApp Automation', desc: 'Never miss a customer message, day or night.' },
  { title: 'AI-Powered Conversations', desc: 'Natural, human-like replies grounded in your business data.' },
  { title: 'Lead Qualification', desc: 'Automatically collect the details your sales team needs.' },
  { title: 'Automatic Follow-ups', desc: 'Renewal, offer and enquiry follow-ups without manual effort.' },
  { title: 'Quotation Generation', desc: 'Send accurate quotes based on your own pricing rules.' },
  { title: 'Payment Links', desc: 'Share your configured payment link at the right moment.' },
  { title: 'Business Knowledge Training', desc: 'Teach the assistant your services, pricing and policies.' },
  { title: 'Multiple WhatsApp Accounts', desc: 'Run several numbers from one dashboard.' },
  { title: 'Human Approval Mode', desc: 'Review and approve AI-drafted replies before they send.' },
];

const INDUSTRIES = ['Real Estate', 'Education', 'Healthcare', 'Interior Design', 'Travel', 'E-commerce', 'Professional Services', 'Agencies', 'Local Businesses'];

const FAQS = [
  { q: 'Do I need to keep my phone online?', a: 'Your WhatsApp account connects once via QR code, similar to WhatsApp Web — no need to keep a browser tab open.' },
  { q: 'Will replies sound robotic?', a: 'No — the assistant is trained on your business information and replies in short, natural, WhatsApp-friendly messages.' },
  { q: 'Can I review messages before they send?', a: 'Yes, Draft & Approve mode lets you or your team review every reply before it goes out.' },
  { q: 'What happens if the assistant doesn’t know an answer?', a: 'It never invents information — it uses your configured fallback message and can escalate to your team instead.' },
];

function formatPrice(plan: Plan) {
  const amount = Number(plan.price).toLocaleString('en-IN');
  return `${plan.currency === 'INR' ? '₹' : plan.currency + ' '}${amount}`;
}

function formatDuration(plan: Plan) {
  const label = plan.durationType.charAt(0) + plan.durationType.slice(1).toLowerCase();
  return `${plan.durationValue} ${plan.durationValue === 1 ? label.replace(/s$/, '') : label}`;
}

export default function Landing() {
  const { theme, toggle } = useTheme();
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['public-plans'],
    queryFn: async () => (await api.get('/public/plans')).data.data,
  });

  const [form, setForm] = useState({ name: '', phone: '', email: '', businessName: '', businessType: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const enquiryMutation = useMutation({
    mutationFn: () => api.post('/public/enquiries', form),
    onSuccess: () => setSubmitted(true),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    enquiryMutation.mutate();
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-lg font-bold text-brand-600">WA Automation</div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300 md:flex">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={toggle}>{theme === 'light' ? 'Dark' : 'Light'}</Button>
            <Link to="/login"><Button variant="secondary">Login</Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          Turn WhatsApp Into Your <span className="text-brand-600">24/7 Sales Assistant</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
          Automate customer conversations, enquiries, lead qualification, quotations and follow-ups — without lifting a finger.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a href="#pricing"><Button>Get Started</Button></a>
          <a href="#contact"><Button variant="secondary">Book a Demo</Button></a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold">How It Works</h2>
        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4 lg:grid-cols-7">
          {['Customer Messages', 'Understand Requirement', 'Ask Missing Questions', 'Qualify Lead', 'Send Information', 'Quotation / Payment', 'Follow-up'].map(
            (step, i) => (
              <div key={step} className="flex flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{step}</p>
              </div>
            ),
          )}
        </div>
      </section>

      <section id="features" className="bg-gray-50 py-16 dark:bg-gray-900/40">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center text-2xl font-bold">Everything you need to sell on WhatsApp</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <h3 className="font-semibold text-gray-900 dark:text-white">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Built for every kind of business</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {INDUSTRIES.map((i) => (
            <span key={i} className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
              {i}
            </span>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-gray-50 py-16 dark:bg-gray-900/40">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center text-2xl font-bold">Simple, transparent pricing</h2>
          {isLoading && <p className="text-center text-gray-500">Loading plans...</p>}
          {!isLoading && (!plans || plans.length === 0) && (
            <p className="text-center text-gray-500">Plans will appear here once published by the team.</p>
          )}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans?.map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <h3 className="text-lg font-bold">{plan.title}</h3>
                {plan.shortDescription && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{plan.shortDescription}</p>}
                <div className="mt-4 text-3xl font-extrabold">{formatPrice(plan)}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">per {formatDuration(plan)}</div>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">{plan.whatsappAccountLimit} WhatsApp account(s)</div>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {plan.planFeatures.map((pf) => (
                    <li key={pf.feature.code} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                      <span className="text-brand-600">&#10003;</span> {pf.feature.name}
                    </li>
                  ))}
                </ul>
                <a href="#contact" className="mt-6">
                  <Button className="w-full">Get Started</Button>
                </a>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-2xl px-4 py-16">
        <h2 className="mb-6 text-center text-2xl font-bold">Talk to us</h2>
        <Card>
          {submitted ? (
            <p className="text-center text-green-700 dark:text-green-400">
              Thanks! We've received your enquiry and will reach out shortly.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Phone number" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Business name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
              <Input placeholder="Business type" value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} />
              <Textarea placeholder="Tell us about your requirement" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              {enquiryMutation.isError && <ErrorText>{apiErrorMessage(enquiryMutation.error)}</ErrorText>}
              <Button type="submit" className="w-full" disabled={enquiryMutation.isPending}>
                {enquiryMutation.isPending ? 'Sending...' : 'Send Enquiry'}
              </Button>
            </form>
          )}
        </Card>
      </section>

      <section id="faq" className="bg-gray-50 py-16 dark:bg-gray-900/40">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <Card key={f.q}>
                <p className="font-semibold text-gray-900 dark:text-white">{f.q}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Ready to automate your WhatsApp sales?</h2>
        <a href="#contact" className="mt-6 inline-block"><Button>Get Started</Button></a>
      </section>

      <footer className="border-t border-gray-200 py-10 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-gray-500 dark:text-gray-400 sm:flex-row">
          <div>&copy; {new Date().getFullYear()} WA Automation</div>
          <div className="flex gap-4">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact</a>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
