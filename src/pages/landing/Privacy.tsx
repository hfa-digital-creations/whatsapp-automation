import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';

export default function Privacy() {
  return (
    <div className="relative min-h-screen py-12 px-4 text-slate-900 dark:text-slate-100 overflow-hidden">
      <div className="glass-bg-mesh">
        <div className="glass-blob-1" />
        <div className="glass-blob-2" />
        <div className="glass-blob-3" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl animate-glass-entrance">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline mb-4">
          &larr; Back to Home
        </Link>
        <Card className="p-8 sm:p-10 backdrop-blur-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Privacy Policy</h1>
          <p className="mt-1 text-xs text-slate-400 font-medium">Last updated: August 2026</p>

          <div className="prose prose-slate mt-8 max-w-none dark:prose-invert text-xs leading-relaxed space-y-4">
            <p>
              This Privacy Policy explains how WhatsApp Automation Platform ("we", "us") collects, uses and protects information when you use our WhatsApp AI automation platform ("Service").
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              <li><strong>Account Credentials:</strong> Name, work email, phone number, and business profile details provided during signup.</li>
              <li><strong>Business Knowledge Base:</strong> Text FAQs, PDF files, pricing catalogs, and qualification rules uploaded to train your assistant.</li>
              <li><strong>Customer Conversations:</strong> Messages exchanged between your prospects and your WhatsApp account to enable live chat reviews and follow-ups.</li>
              <li><strong>Telemetry &amp; Audit Logs:</strong> Security logs and operational timestamps required to maintain high system reliability.</li>
            </ul>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Data Isolation &amp; Security</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Your business knowledge base and customer chat logs are strictly isolated per tenant organization. We do not use your proprietary business training data to train models for other tenants.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Data Retention</h2>
            <p className="text-slate-600 dark:text-slate-300">
              We retain account data and conversation history for as long as your subscription is active. Archived conversations are safely placed in the Recycle Bin before permanent removal.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Contact &amp; Data Rights</h2>
            <p className="text-slate-600 dark:text-slate-300">
              You can request export or permanent deletion of your organization records at any time by contacting our support team.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

