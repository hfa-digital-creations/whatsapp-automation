import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';

export default function Terms() {
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
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Terms &amp; Conditions</h1>
          <p className="mt-1 text-xs text-slate-400 font-medium">Last updated: August 2026</p>

          <div className="prose prose-slate mt-8 max-w-none dark:prose-invert text-xs leading-relaxed space-y-4">
            <p>
              These Terms govern your use of the WhatsApp AI Automation Platform ("Service"). By creating an account, connecting a WhatsApp line, or using the Service, you agree to these Terms.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Service Usage &amp; Automation</h2>
            <p className="text-slate-600 dark:text-slate-300">
              The Service empowers your business to automate customer replies, lead qualification, and rate estimates using your own WhatsApp accounts. You are solely responsible for the legality, accuracy, and appropriate conduct of all automated messages dispatched under your profile.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Subscriptions &amp; Renewals</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Platform access is granted under active recurring subscription plans. Renewals immediately extend your validity period and account quota. Expired accounts can renew seamlessly at any time without losing past training data.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Acceptable Use &amp; Anti-Spam</h2>
            <p className="text-slate-600 dark:text-slate-300">
              You agree not to dispatch unsolicited mass spam, fraudulent promotions, or abusive content that violates Meta/WhatsApp official policies.
            </p>

            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 pt-2">Contact Information</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Questions regarding service licensing or enterprise terms can be addressed through the support portal.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

