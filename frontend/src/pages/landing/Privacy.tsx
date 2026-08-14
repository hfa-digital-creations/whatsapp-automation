import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-brand-600">&larr; Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Last updated: [DATE]</p>

      <div className="prose prose-gray mt-8 max-w-none dark:prose-invert">
        <p>
          This Privacy Policy explains how [COMPANY NAME] ("we", "us") collects, uses and protects information when you
          use our WhatsApp automation platform ("Service").
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email, phone number and business details you provide when signing up.</li>
          <li><strong>Business information:</strong> content you provide to train your automation, such as product, pricing and policy details.</li>
          <li><strong>Customer conversation data:</strong> messages exchanged between your customers and your WhatsApp account through the Service, stored so you can review and manage conversations.</li>
          <li><strong>Usage data:</strong> log and activity data needed to operate and improve the Service.</li>
        </ul>

        <h2>Why we collect it</h2>
        <p>
          We use this information to provide and operate the Service, deliver automated responses on your behalf,
          manage your subscription and account, communicate with you about your account, and improve reliability and
          security.
        </p>

        <h2>How your data is used</h2>
        <p>
          Your business training data and customer conversations are used only to power automation for your own
          account. We do not use your data to train automation for other customers, and each account's data is kept
          isolated from other accounts.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain account, business and conversation data for as long as your account is active, and for a
          reasonable period afterward as required for legal, accounting or dispute-resolution purposes. If your
          subscription lapses, your data is preserved so you can renew and resume without loss.
        </p>

        <h2>Cookies</h2>
        <p>
          We use essential cookies and local storage to keep you signed in and remember your preferences (such as
          light/dark theme). We do not use cookies for third-party advertising.
        </p>

        <h2>Third-party services</h2>
        <p>
          We may rely on third-party infrastructure providers (such as hosting, email delivery and payment
          processing) to operate the Service. These providers only receive the information necessary to perform
          their function and are contractually required to protect it.
        </p>

        <h2>Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of your account and business data at any time by
          contacting us. Some information may be retained where required by law.
        </p>

        <h2>Contact us</h2>
        <p>If you have questions about this Privacy Policy, contact us at [CONTACT EMAIL].</p>
      </div>
    </div>
  );
}
