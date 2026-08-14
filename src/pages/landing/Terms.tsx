import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-brand-600">&larr; Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Last updated: [DATE]</p>

      <div className="prose prose-gray mt-8 max-w-none dark:prose-invert">
        <p>
          These Terms govern your use of [COMPANY NAME]'s WhatsApp automation platform ("Service"). By creating an
          account or using the Service, you agree to these Terms.
        </p>

        <h2>Service usage</h2>
        <p>
          The Service lets you automate customer conversations, enquiries, lead qualification and follow-ups on
          WhatsApp using your own WhatsApp account(s). You are responsible for the content, accuracy and legality of
          the business information you configure and the messages sent through your account.
        </p>

        <h2>Account responsibilities</h2>
        <p>
          You are responsible for keeping your login credentials confidential and for all activity under your
          account. Notify us immediately of any unauthorized access.
        </p>

        <h2>Subscriptions, payments and renewals</h2>
        <p>
          Access to the Service is provided under the subscription plan you purchase. Plan pricing, duration and
          included features are shown at the time of purchase and may change for future billing periods. Your
          account is activated by our team once payment is confirmed. Renewals extend your subscription from its
          current expiry date; if your subscription has already expired, the new period begins on the renewal date.
        </p>

        <h2>Refunds</h2>
        <p>
          Refund eligibility, if any, is described at the time of purchase or in a separate refund policy. Except as
          required by law or explicitly stated, fees are non-refundable.
        </p>

        <h2>Acceptable use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Send unsolicited bulk messages (spam) or messages violating WhatsApp's own terms of service;</li>
          <li>Impersonate another person or business, or misrepresent your identity;</li>
          <li>Transmit unlawful, abusive, or fraudulent content;</li>
          <li>Attempt to interfere with or compromise the security of the Service.</li>
        </ul>

        <h2>WhatsApp usage responsibility</h2>
        <p>
          You are solely responsible for complying with WhatsApp's own terms of service and policies for your
          connected WhatsApp account(s). We are not affiliated with, endorsed by, or officially connected to WhatsApp
          or Meta Platforms, Inc.
        </p>

        <h2>Your business data</h2>
        <p>
          You retain ownership of the business information and customer data you provide. You are responsible for
          ensuring you have the right to use and process any customer data handled through the Service.
        </p>

        <h2>Account suspension</h2>
        <p>
          We may suspend or block accounts that violate these Terms, engage in abusive behavior, or pose a security
          risk, with notice where practicable.
        </p>

        <h2>Service availability</h2>
        <p>
          We aim to keep the Service available and reliable but do not guarantee uninterrupted operation. Scheduled
          maintenance or third-party outages (including WhatsApp itself) may affect availability.
        </p>

        <h2>Intellectual property</h2>
        <p>
          The Service, its software and branding are owned by [COMPANY NAME]. You retain rights to your own business
          content and data.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, [COMPANY NAME] is not liable for indirect, incidental or
          consequential damages arising from use of the Service.
        </p>

        <h2>Termination</h2>
        <p>
          You may cancel your subscription at any time; access continues until the end of the current billing
          period. We may terminate accounts for material breach of these Terms.
        </p>

        <h2>Changes to these terms</h2>
        <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance.</p>

        <h2>Contact us</h2>
        <p>Questions about these Terms can be sent to [CONTACT EMAIL].</p>
      </div>
    </div>
  );
}
