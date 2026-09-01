import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import { usePlatformLogo } from '../../hooks/usePlatformLogo';
import { Badge, Button, Card, ErrorText, Input, Select, Textarea } from '../../components/ui';

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
  { title: 'WhatsApp Automation', desc: 'Your own connected WhatsApp number replies to customers automatically, day or night.', icon: '⚡' },
  { title: 'Auto Reply, Grounded in Facts', desc: 'The AI replies instantly using only your approved business knowledge — it never invents facts or prices.', icon: '🤖' },
  { title: 'Business Training', desc: 'Train the AI on your own services, pricing, and policies via plain text or uploaded PDF/DOC/CSV files.', icon: '🧠' },
  { title: 'Draft & Approve Mode', desc: 'Have a human review and approve every AI-drafted reply before it sends — full oversight when you want it.', icon: '🛡️' },
  { title: 'Full Autonomous Mode', desc: 'Or let the AI reply completely on its own, with no human step in between.', icon: '🚀' },
  { title: 'Enquiry Automation', desc: 'New enquiries from this very page get an instant AI reply and an ongoing WhatsApp conversation, automatically.', icon: '📥' },
  { title: 'Automatic Sales Follow-up', desc: 'AI-drafted follow-up messages go out on their own to prospects who’ve gone quiet — no admin has to remember.', icon: '🔄' },
  { title: 'Automatic Quotation', desc: 'Generate and send an itemized price quote straight from your rate card, no manual typing.', icon: '📄' },
  { title: 'Payment Link', desc: 'Share a Razorpay or custom payment link right inside the WhatsApp chat, at the exact moment of intent.', icon: '💳' },
  { title: 'Renewal Messages', desc: 'Scheduled WhatsApp and email reminders before a client’s subscription expires — never lose a renewal to silence.', icon: '⏰' },
  { title: 'Offer Broadcasts', desc: 'Send promotional offers to your client list or your own customer contact groups, with delivery tracking and retry.', icon: '📢' },
  { title: 'Multiple WhatsApp Accounts', desc: 'Connect and run several WhatsApp numbers under one account, based on your plan.', icon: '📱' },
  { title: 'Live Dashboard & Analytics', desc: 'See conversations, leads, and subscription health at a glance.', icon: '📊' },
  { title: 'Daily Digest', desc: 'A daily WhatsApp summary of what happened across your account, sent straight to you.', icon: '🗞️' },
];

const INDUSTRIES = [
  'Real Estate', 'Education & Coaching', 'Healthcare & Clinics', 'Interior & Architecture',
  'Travel & Hospitality', 'E-Commerce & D2C', 'Financial Services', 'Digital Agencies', 'B2B Wholesale',
];

const FAQS = [
  { q: 'Do I need to keep my phone online 24/7?', a: 'No. Your WhatsApp connects once via secure multi-device QR pairing. The server manages socket connectivity continuously in the cloud.' },
  { q: 'Will AI replies sound robotic or hallucinate false info?', a: 'No. The assistant is strictly anchored to your uploaded knowledge base and fallback rules, communicating in crisp, human conversational tones.' },
  { q: 'Can my human team take over chats anytime?', a: 'Yes. With live chat split-views and Draft & Approve mode, your human staff can intervene and respond directly at any second.' },
  { q: 'What happens when a customer asks something not in the knowledge base?', a: 'The AI never makes up facts. It immediately delivers your configured polite fallback response and flags the inquiry for staff follow-up.' },
];

function formatPrice(plan: Plan) {
  const amount = Number(plan.price).toLocaleString('en-IN');
  return `${plan.currency === 'INR' ? '₹' : plan.currency + ' '}${amount}`;
}

function formatDuration(plan: Plan) {
  const label = plan.durationType.charAt(0) + plan.durationType.slice(1).toLowerCase();
  return `${plan.durationValue} ${plan.durationValue === 1 ? label.replace(/s$/, '') : label}`;
}

interface EnquiryFormState {
  name: string;
  phone: string;
  email: string;
  businessName: string;
  businessType: string;
  message: string;
  planId: string;
}

/**
 * The single contact form, shared verbatim by the inline "#contact" section and the
 * auto-popup — one source of state/validation so the two entry points can never drift.
 */
function EnquiryFormCard({
  form,
  setForm,
  plans,
  submitted,
  onSubmit,
  isPending,
  isError,
  error,
}: {
  form: EnquiryFormState;
  setForm: (form: EnquiryFormState) => void;
  plans?: Plan[];
  submitted: boolean;
  onSubmit: (e: FormEvent) => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <Card className="p-7 sm:p-8 backdrop-blur-2xl">
      {submitted ? (
        <div className="text-center py-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-white">Demo Enquiry Received!</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Thank you! We've received your request and our product specialist will reach out to you directly on WhatsApp shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Your Full Name</label>
              <Input placeholder="Rajesh Sharma" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">WhatsApp Phone Number</label>
              <Input placeholder="+919876543210" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Work Email</label>
              <Input type="email" required placeholder="rajesh@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Company / Brand Name</label>
              <Input placeholder="Sharma Enterprises" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Industry</label>
            <Select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
              <option value="">Select your industry</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              <option value="Other">Other</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Which Plan Interests You?</label>
            <Select required value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">Select a plan...</option>
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {formatPrice(p)} / {formatDuration(p)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-400">
              Our AI will focus the conversation on this plan and ask exactly what's needed to set your account up on it.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Requirement Notes</label>
            <Textarea
              placeholder="Tell us about your volume, customer inquiries, and automation goals..."
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          {isError && <ErrorText>{apiErrorMessage(error)}</ErrorText>}
          <Button type="submit" className="w-full py-2.5 text-xs font-bold" disabled={isPending}>
            {isPending ? 'Sending Inquiry...' : 'Submit Demo Request →'}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function Landing() {
  const { theme, toggle } = useTheme();
  const logoUrl = usePlatformLogo();
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['public-plans'],
    queryFn: async () => (await api.get('/public/plans')).data.data,
  });

  const [form, setForm] = useState({ name: '', phone: '', email: '', businessName: '', businessType: '', message: '', planId: '' });
  const [submitted, setSubmitted] = useState(false);
  const enquiryMutation = useMutation({
    mutationFn: () => api.post('/public/enquiries', form),
    onSuccess: () => setSubmitted(true),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    enquiryMutation.mutate();
  }

  // Auto-popup the contact form shortly after arrival — once per browser session (not
  // every visit/navigation), and never once they've already submitted or dismissed it.
  const [showPopup, setShowPopup] = useState(false);
  useEffect(() => {
    let alreadyShown = true;
    try {
      alreadyShown = sessionStorage.getItem('enquiryPopupShown') === '1';
    } catch {
      // sessionStorage unavailable (private browsing, etc.) — skip the popup rather than risk a crash.
      return;
    }
    if (alreadyShown) return;
    const timer = setTimeout(() => {
      setShowPopup(true);
      try {
        sessionStorage.setItem('enquiryPopupShown', '1');
      } catch {
        // best-effort only
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (submitted) setShowPopup(false);
  }, [submitted]);

  return (
    <div className="relative min-h-screen bg-slate-100/80 text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-x-clip selection:bg-brand-500 selection:text-white">
      {/* Auto-popup contact form — shown once per session shortly after arrival */}
      {showPopup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-glass-entrance"
          onClick={() => setShowPopup(false)}
        >
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowPopup(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              ✕
            </button>
            <div className="mb-3 text-center">
              <h3 className="text-lg font-extrabold text-white">Get a Free Walkthrough</h3>
              <p className="text-xs text-slate-300">Tell us about your business and we'll reach out on WhatsApp shortly.</p>
            </div>
            <EnquiryFormCard
              form={form}
              setForm={setForm}
              plans={plans}
              submitted={submitted}
              onSubmit={handleSubmit}
              isPending={enquiryMutation.isPending}
              isError={enquiryMutation.isError}
              error={enquiryMutation.error}
            />
          </div>
        </div>
      )}

      {/* Ambient background glow mesh */}
      <div className="glass-bg-mesh">
        <div className="glass-blob-1" />
        <div className="glass-blob-2" />
        <div className="glass-blob-3" />
      </div>

      {/* Glass Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/60 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded-xl object-cover shadow-md" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-amber-400 text-white shadow-md shadow-brand-500/20">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
                </svg>
              </div>
            )}
            <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
              WA Automation
            </span>
          </div>

          <nav className="hidden items-center gap-8 text-xs font-semibold text-slate-600 dark:text-slate-300 md:flex">
            <a href="#features" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">How It Works</a>
            <a href="#pricing" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">FAQ</a>
            <a href="#contact" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">Book Demo</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 text-slate-600 backdrop-blur-md transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
            <Link to="/login">
              <Button variant="secondary" className="text-xs px-3.5 py-2">
                Sign In &rarr;
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-20 pb-16 text-center sm:pt-28 sm:pb-24 animate-glass-entrance">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-400 mb-6 backdrop-blur-md shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
          Next-Gen WhatsApp AI Sales &amp; CRM Engine
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-6xl md:text-7xl leading-tight sm:leading-none">
          Turn WhatsApp Into Your <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
            24/7 Autonomous Sales Machine
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium">
          Instantly qualify high-intent inbound leads, calculate accurate pricing estimates, collect payments, and dispatch human-like WhatsApp replies effortlessly.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a href="#pricing">
            <Button className="px-6 py-3 text-sm shadow-xl shadow-brand-500/25">
              ⚡ Explore Plans &amp; Pricing
            </Button>
          </a>
          <a href="#contact">
            <Button variant="secondary" className="px-6 py-3 text-sm">
              Schedule a Live Demo &rarr;
            </Button>
          </a>
        </div>
      </section>

      {/* How It Works Flow */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            How The AI Sales Engine Works
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">From initial prospect ping to checkout without manual effort</p>
        </div>
        <div className="grid grid-cols-2 gap-3.5 text-center sm:grid-cols-4 lg:grid-cols-7">
          {[
            { step: '1', title: 'Customer Ping', desc: 'Inbound message arrives on WhatsApp' },
            { step: '2', title: 'Semantic Parse', desc: 'AI queries trained business facts' },
            { step: '3', title: 'Qualify Needs', desc: 'Asks targeted questions' },
            { step: '4', title: 'Draft Response', desc: 'Generates helpful human reply' },
            { step: '5', title: 'Rate Estimate', desc: 'Auto-calculates rate card quote' },
            { step: '6', title: 'Fast Checkout', desc: 'Shares secure payment gateway link' },
            { step: '7', title: 'Follow-ups', desc: 'Schedules automated check-ins' },
          ].map((s) => (
            <Card key={s.step} hoverEffect className="p-4 flex flex-col items-center justify-between text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-amber-400 text-xs font-black text-white shadow-md shadow-brand-500/20 mb-2.5">
                {s.step}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{s.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Enterprise Features Built For Conversion
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Everything you need to automate conversations and scale revenue</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} hoverEffect className="p-6 flex flex-col justify-between">
              <div>
                <span className="text-2xl mb-3 block">{f.icon}</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Supported Industries */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 text-center">
        <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200 mb-6">
          Empowering High-Growth Businesses Across Verticals
        </h2>
        <div className="flex flex-wrap justify-center gap-2.5 max-w-4xl mx-auto">
          {INDUSTRIES.map((i) => (
            <span
              key={i}
              className="rounded-xl border border-slate-200/80 bg-white/60 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/15 dark:hover:text-brand-400"
            >
              {i}
            </span>
          ))}
        </div>
      </section>

      {/* Pricing Cards */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Simple, Transparent Subscription Plans
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Upgrade or renew anytime with instant Razorpay activation</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans?.map((plan) => (
            <Card key={plan.id} hoverEffect className="p-7 flex flex-col justify-between border-brand-500/20">
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{plan.title}</h3>
                  <Badge tone="green">Verified Plan</Badge>
                </div>
                {plan.shortDescription && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{plan.shortDescription}</p>
                )}

                <div className="mt-5 mb-3">
                  <span className="text-3xl font-black tracking-tight bg-gradient-to-r from-brand-600 to-amber-500 bg-clip-text text-transparent">
                    {formatPrice(plan)}
                  </span>
                  <span className="text-xs text-slate-400 ml-1.5 font-medium">/ {formatDuration(plan)}</span>
                </div>

                <div className="rounded-xl bg-slate-500/10 p-2.5 text-xs text-slate-700 dark:text-slate-300 font-semibold mb-4">
                  Includes {plan.whatsappAccountLimit} Connected WhatsApp Line(s)
                </div>

                <ul className="space-y-2 text-xs">
                  {plan.planFeatures.map((pf) => (
                    <li key={pf.feature.code} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <span className="text-emerald-500 font-bold">✓</span> {pf.feature.name}
                    </li>
                  ))}
                </ul>
              </div>

              <a href="#contact" className="mt-6 block">
                <Button className="w-full text-xs py-2.5">
                  Get Started Now &rarr;
                </Button>
              </a>
            </Card>
          ))}
          {(!plans || plans.length === 0) && (
            <div className="col-span-full py-12 text-center text-xs text-slate-400">
              {isLoading ? 'Loading plans...' : 'Plans will appear here once published by administrators.'}
            </div>
          )}
        </div>
      </section>

      {/* Book a Demo / Contact Form */}
      <section id="contact" className="relative z-10 mx-auto max-w-2xl px-4 py-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Schedule a Personalized Walkthrough
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Our sales engineering team will demonstrate AI automation tailored to your business</p>
        </div>

        <EnquiryFormCard
          form={form}
          setForm={setForm}
          plans={plans}
          submitted={submitted}
          onSubmit={handleSubmit}
          isPending={enquiryMutation.isPending}
          isError={enquiryMutation.isError}
          error={enquiryMutation.error}
        />
      </section>

      {/* FAQs */}
      <section id="faq" className="relative z-10 mx-auto max-w-3xl px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Clear answers to technical and operational queries</p>
        </div>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <Card key={f.q} hoverEffect className="p-5">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{f.q}</p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{f.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Mobile Floating "Book Now" CTA — the nav's Book Demo link is hidden below md, so this
          keeps a persistent, always-reachable booking action in view on phones. */}
      <a
        href="#contact"
        className="animate-float glass-glow-brand fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600 via-orange-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-brand-500/40 border border-white/30 md:hidden"
      >
        Book Now &rarr;
      </a>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/60 py-10 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 dark:text-slate-400 sm:flex-row">
          <div>&copy; {new Date().getFullYear()} WhatsApp Automation Platform. All rights reserved.</div>
          <div className="flex gap-6 font-medium">
            <a href="#features" className="hover:text-brand-500 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-brand-500 transition-colors">Pricing</a>
            <a href="#contact" className="hover:text-brand-500 transition-colors">Contact</a>
            <Link to="/privacy" className="hover:text-brand-500 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-brand-500 transition-colors">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

