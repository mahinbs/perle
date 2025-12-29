import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack } from "react-icons/io";

export default function TermsPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div className="container" style={{ paddingBottom: '40px' }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 0",
          marginBottom: "24px",
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo('/profile')}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
          }}
        >
          <IoIosArrowBack size={24} />
          <span>Back</span>
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "0 16px",
        }}
      >
        <h1
          style={{
            fontSize: "var(--font-2xl)",
            fontWeight: 700,
            marginBottom: "16px",
            color: "var(--text)",
          }}
        >
          Terms of Service
        </h1>

        <p
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--text-secondary)",
            marginBottom: "32px",
          }}
        >
          Last Updated: December 29, 2025
        </p>

        <div
          style={{
            fontSize: "var(--font-md)",
            lineHeight: 1.7,
            color: "var(--text)",
          }}
        >
          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              1. Acceptance of Terms
            </h2>
            <p style={{ marginBottom: "12px" }}>
              By accessing or using SyntraIQ ("the Service"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use the Service.
            </p>
            <p style={{ marginBottom: "12px" }}>
              We reserve the right to modify these terms at any time. Continued use of the Service after 
              changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              2. Description of Service
            </h2>
            <p style={{ marginBottom: "12px" }}>
              SyntraIQ is an AI-powered search and conversation platform that provides:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>AI-powered search with multiple modes (Ask, Research, Summarize, Compare)</li>
              <li style={{ marginBottom: "8px" }}>Access to various AI models (GPT, Claude, Gemini, Grok)</li>
              <li style={{ marginBottom: "8px" }}>AI Friend and AI Psychologist conversational modes</li>
              <li style={{ marginBottom: "8px" }}>Voice search and text-to-speech capabilities</li>
              <li style={{ marginBottom: "8px" }}>File upload and analysis (images, PDFs, documents)</li>
              <li style={{ marginBottom: "8px" }}>Search history and bookmarks (Library)</li>
              <li style={{ marginBottom: "8px" }}>Spaces for organizing content</li>
              <li style={{ marginBottom: "8px" }}>Premium subscription plans (IQ Pro and IQ Max)</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              3. User Accounts
            </h2>
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              3.1 Registration
            </h3>
            <p style={{ marginBottom: "12px" }}>
              To access certain features, you must create an account by providing:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Name</li>
              <li style={{ marginBottom: "8px" }}>Valid email address</li>
              <li style={{ marginBottom: "8px" }}>Secure password</li>
            </ul>
            <p style={{ marginBottom: "12px" }}>
              You must verify your email address via an 8-digit OTP code sent to your email.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              3.2 Account Security
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You are responsible for:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Maintaining the confidentiality of your account credentials</li>
              <li style={{ marginBottom: "8px" }}>All activities that occur under your account</li>
              <li style={{ marginBottom: "8px" }}>Notifying us immediately of any unauthorized access</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              3.3 Account Termination
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We reserve the right to suspend or terminate accounts that violate these terms or engage in 
              abusive, fraudulent, or illegal activities.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              4. Subscription Plans and Billing
            </h2>
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.1 Plan Tiers
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Free:</strong> Limited access to Gemini Lite model</li>
              <li style={{ marginBottom: "8px" }}><strong>IQ Pro (₹399/month):</strong> Access to all premium AI models, 5 file uploads, 200MB file analysis, unlimited saved spaces</li>
              <li style={{ marginBottom: "8px" }}><strong>IQ Max (₹899/month):</strong> Everything in IQ Pro plus team collaboration, priority support, advanced analytics, API access</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.2 Payment Processing
            </h3>
            <p style={{ marginBottom: "12px" }}>
              Payments are processed through Razorpay. By subscribing, you authorize us to charge your 
              payment method for the selected plan.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.3 Auto-Renewal
            </h3>
            <p style={{ marginBottom: "12px" }}>
              Subscriptions automatically renew monthly unless you disable auto-renewal or cancel. You can 
              manage auto-renewal settings from your subscription page. If auto-renewal is disabled, your 
              subscription will end at the conclusion of the current billing period.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.4 Plan Changes
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Upgrades:</strong> Take effect immediately. You'll be charged for the new plan and receive a prorated refund for unused time on the lower plan.</li>
              <li style={{ marginBottom: "8px" }}><strong>Downgrades:</strong> Take effect at the end of your current billing period. You'll retain access to the higher tier until then.</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.5 Cancellation and Refunds
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You may cancel your subscription at any time. Cancellations take effect at the end of the 
              current billing period. We do not provide refunds for partial months, except in cases of 
              plan upgrades where prorated refunds are provided for the unused portion of the lower-tier plan.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              5. Acceptable Use Policy
            </h2>
            <p style={{ marginBottom: "12px" }}>
              You agree NOT to:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Use the Service for any illegal or unauthorized purpose</li>
              <li style={{ marginBottom: "8px" }}>Violate any laws in your jurisdiction</li>
              <li style={{ marginBottom: "8px" }}>Infringe upon the rights of others</li>
              <li style={{ marginBottom: "8px" }}>Upload malicious code, viruses, or harmful content</li>
              <li style={{ marginBottom: "8px" }}>Attempt to gain unauthorized access to our systems</li>
              <li style={{ marginBottom: "8px" }}>Interfere with or disrupt the Service</li>
              <li style={{ marginBottom: "8px" }}>Use the Service to harass, abuse, or harm others</li>
              <li style={{ marginBottom: "8px" }}>Scrape or extract data without permission</li>
              <li style={{ marginBottom: "8px" }}>Reverse engineer or attempt to extract source code</li>
              <li style={{ marginBottom: "8px" }}>Share your account with others</li>
              <li style={{ marginBottom: "8px" }}>Create fake accounts or impersonate others</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              6. Content and Intellectual Property
            </h2>
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.1 Your Content
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You retain ownership of content you upload or create. By using the Service, you grant us a 
              license to use, store, and process your content solely to provide the Service.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.2 AI-Generated Content
            </h3>
            <p style={{ marginBottom: "12px" }}>
              AI-generated responses are provided "as is" and may not always be accurate. You are responsible 
              for verifying information before relying on it. We do not claim ownership of AI-generated content.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.3 Our Intellectual Property
            </h3>
            <p style={{ marginBottom: "12px" }}>
              The Service, including its design, features, code, and branding, is owned by SyntraIQ and 
              protected by intellectual property laws. You may not copy, modify, distribute, or create 
              derivative works without our permission.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              7. Third-Party Services
            </h2>
            <p style={{ marginBottom: "12px" }}>
              The Service integrates with third-party AI providers (OpenAI, Anthropic, Google, xAI) and 
              payment processors (Razorpay). Your use of these services is subject to their respective 
              terms and privacy policies. We are not responsible for third-party services.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              8. Privacy and Data
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Your privacy is important to us. Please review our <a 
                href="/privacy" 
                style={{ color: "var(--accent)", textDecoration: "underline" }}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/privacy');
                }}
              >Privacy Policy</a> to understand how we collect, use, and protect your information.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              9. AI Psychologist Disclaimer
            </h2>
            <p style={{ marginBottom: "12px" }}>
              The AI Psychologist mode is NOT a substitute for professional mental health care. It does not 
              provide medical advice, diagnosis, or treatment. If you are experiencing a mental health emergency, 
              please contact emergency services or a qualified mental health professional immediately.
            </p>
            <p style={{ marginBottom: "12px" }}>
              The AI Psychologist is designed for informational and supportive purposes only and should not 
              replace consultation with licensed healthcare providers.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              10. Disclaimers and Limitations of Liability
            </h2>
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              10.1 Service "As Is"
            </h3>
            <p style={{ marginBottom: "12px" }}>
              The Service is provided "as is" without warranties of any kind, express or implied. We do not 
              guarantee that the Service will be uninterrupted, error-free, or secure.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              10.2 Limitation of Liability
            </h3>
            <p style={{ marginBottom: "12px" }}>
              To the maximum extent permitted by law, SyntraIQ shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages, or any loss of profits or revenues, 
              whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible 
              losses resulting from:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Your use or inability to use the Service</li>
              <li style={{ marginBottom: "8px" }}>Unauthorized access to your data</li>
              <li style={{ marginBottom: "8px" }}>AI-generated content accuracy or reliability</li>
              <li style={{ marginBottom: "8px" }}>Third-party services or content</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              11. Indemnification
            </h2>
            <p style={{ marginBottom: "12px" }}>
              You agree to indemnify and hold harmless SyntraIQ from any claims, damages, losses, liabilities, 
              and expenses (including legal fees) arising from your use of the Service or violation of these terms.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              12. Governing Law and Dispute Resolution
            </h2>
            <p style={{ marginBottom: "12px" }}>
              These Terms are governed by the laws of India. Any disputes shall be resolved through arbitration 
              in accordance with Indian arbitration laws, with the seat of arbitration being in India.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              13. Changes to Service
            </h2>
            <p style={{ marginBottom: "12px" }}>
              We reserve the right to modify, suspend, or discontinue any part of the Service at any time 
              without notice. We may also change pricing for subscription plans with 30 days' notice to 
              existing subscribers.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              14. Contact Information
            </h2>
            <p style={{ marginBottom: "12px" }}>
              For questions about these Terms of Service, please contact us at:
            </p>
            <p style={{ marginBottom: "12px" }}>
              <strong>Email:</strong> support@syntraiq.com
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginTop: "40px" }}>
              By using SyntraIQ, you acknowledge that you have read, understood, and agree to be bound by 
              these Terms of Service.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

