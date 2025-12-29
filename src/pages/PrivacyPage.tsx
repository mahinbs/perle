import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack } from "react-icons/io";

export default function PrivacyPage() {
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
          Privacy Policy
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
              1. Introduction
            </h2>
            <p style={{ marginBottom: "12px" }}>
              SyntraIQ ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
            <p style={{ marginBottom: "12px" }}>
              By using SyntraIQ, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              2. Information We Collect
            </h2>
            
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              2.1 Information You Provide
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Account Information:</strong> Name, email address, password (encrypted)</li>
              <li style={{ marginBottom: "8px" }}><strong>Profile Settings:</strong> Notification preferences, dark mode preference, search history settings, voice search settings</li>
              <li style={{ marginBottom: "8px" }}><strong>Payment Information:</strong> Payment details are processed by Razorpay. We store only subscription status and plan information</li>
              <li style={{ marginBottom: "8px" }}><strong>Content:</strong> Search queries, conversation history, uploaded files, bookmarks, saved spaces, and library items</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              2.2 Automatically Collected Information
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Usage Data:</strong> Search patterns, features used, interaction timestamps</li>
              <li style={{ marginBottom: "8px" }}><strong>Device Information:</strong> Browser type, device type, operating system</li>
              <li style={{ marginBottom: "8px" }}><strong>Log Data:</strong> IP address, access times, pages viewed</li>
              <li style={{ marginBottom: "8px" }}><strong>Session Data:</strong> Authentication tokens, session duration</li>
              <li style={{ marginBottom: "8px" }}><strong>Local Storage:</strong> Preferences, temporary data, cached content</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              2.3 Voice Data
            </h3>
            <p style={{ marginBottom: "12px" }}>
              When you use voice search features, your voice input is processed by your browser's speech 
              recognition API. We do not store raw audio recordings, only the resulting text transcriptions.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              2.4 File Uploads
            </h3>
            <p style={{ marginBottom: "12px" }}>
              Files you upload (images, PDFs, documents) are temporarily processed to provide AI analysis. 
              Files are not permanently stored unless you explicitly save them to your Library.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              3. How We Use Your Information
            </h2>
            <p style={{ marginBottom: "12px" }}>
              We use collected information for:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Service Delivery:</strong> Providing search results, AI responses, and core features</li>
              <li style={{ marginBottom: "8px" }}><strong>Account Management:</strong> Creating and managing your account, authentication, password reset</li>
              <li style={{ marginBottom: "8px" }}><strong>Personalization:</strong> Maintaining your preferences, search history, and saved content</li>
              <li style={{ marginBottom: "8px" }}><strong>Subscription Management:</strong> Processing payments, managing subscriptions, handling upgrades/downgrades</li>
              <li style={{ marginBottom: "8px" }}><strong>Communication:</strong> Sending verification emails, subscription updates, service announcements</li>
              <li style={{ marginBottom: "8px" }}><strong>Service Improvement:</strong> Analyzing usage patterns, fixing bugs, developing new features</li>
              <li style={{ marginBottom: "8px" }}><strong>Security:</strong> Detecting fraud, preventing abuse, protecting against security threats</li>
              <li style={{ marginBottom: "8px" }}><strong>Compliance:</strong> Meeting legal obligations and enforcing our Terms of Service</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              4. How We Share Your Information
            </h2>
            
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.1 Third-Party Service Providers
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We share information with third-party services that help us operate:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Supabase:</strong> Database and authentication services (user data, search history, profiles)</li>
              <li style={{ marginBottom: "8px" }}><strong>AI Providers:</strong> OpenAI (GPT models), Anthropic (Claude), Google (Gemini), xAI (Grok) - Your queries and conversations</li>
              <li style={{ marginBottom: "8px" }}><strong>Razorpay:</strong> Payment processing (subscription and billing information)</li>
              <li style={{ marginBottom: "8px" }}><strong>Banana.dev:</strong> AI model hosting and inference</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.2 Team Collaboration (IQ Max Only)
            </h3>
            <p style={{ marginBottom: "12px" }}>
              If you use IQ Max team features, your shared Spaces and content may be visible to team members 
              you've granted access to.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.3 Legal Requirements
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We may disclose your information if required by law, court order, or government request, or to 
              protect our rights, property, or safety.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.4 Business Transfers
            </h3>
            <p style={{ marginBottom: "12px" }}>
              In the event of a merger, acquisition, or sale of assets, your information may be transferred 
              to the acquiring entity.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              4.5 What We Don't Share
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We do NOT sell your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              5. Data Storage and Security
            </h2>
            
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              5.1 Where We Store Data
            </h3>
            <p style={{ marginBottom: "12px" }}>
              Your data is stored on secure servers provided by Supabase. Data may be processed and stored in 
              multiple geographic locations.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              5.2 Security Measures
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Passwords are encrypted using industry-standard hashing (bcrypt)</li>
              <li style={{ marginBottom: "8px" }}>HTTPS encryption for data transmission</li>
              <li style={{ marginBottom: "8px" }}>Authentication tokens with expiration</li>
              <li style={{ marginBottom: "8px" }}>Row-level security policies in database</li>
              <li style={{ marginBottom: "8px" }}>Regular security audits and updates</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              5.3 Data Retention
            </h3>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}><strong>Account Data:</strong> Retained while your account is active</li>
              <li style={{ marginBottom: "8px" }}><strong>Search History:</strong> Retained according to your preferences (can be disabled or cleared)</li>
              <li style={{ marginBottom: "8px" }}><strong>Conversation History:</strong> Free users: last 5 messages per mode; Premium users: extended history</li>
              <li style={{ marginBottom: "8px" }}><strong>Deleted Data:</strong> Permanently deleted within 30 days of account deletion</li>
              <li style={{ marginBottom: "8px" }}><strong>Backup Data:</strong> May be retained for up to 90 days in encrypted backups</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              6. Your Privacy Rights and Choices
            </h2>
            
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.1 Access and Portability
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You can access and export all your data through the "Export Data" feature in your profile settings. 
              This includes your account information, search history, library items, and saved spaces.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.2 Correction and Updates
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You can update your profile information (name, email, preferences) at any time through your 
              account settings.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.3 Deletion
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You can delete your account at any time through your profile settings. This will permanently 
              delete:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Account information</li>
              <li style={{ marginBottom: "8px" }}>Search history</li>
              <li style={{ marginBottom: "8px" }}>Library items and bookmarks</li>
              <li style={{ marginBottom: "8px" }}>Saved spaces and conversations</li>
              <li style={{ marginBottom: "8px" }}>Subscription information (after active period ends)</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.4 Search History Control
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You can:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Disable search history tracking in settings</li>
              <li style={{ marginBottom: "8px" }}>Clear all search history at any time</li>
              <li style={{ marginBottom: "8px" }}>Delete individual search entries</li>
            </ul>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.5 Communication Preferences
            </h3>
            <p style={{ marginBottom: "12px" }}>
              You can manage notification preferences in your account settings. Note that certain transactional 
              emails (verification, password reset, subscription updates) cannot be disabled.
            </p>

            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              6.6 Do Not Track
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We do not currently respond to "Do Not Track" signals as there is no industry standard for 
              compliance.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              7. Cookies and Local Storage
            </h2>
            <p style={{ marginBottom: "12px" }}>
              We use browser local storage to:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Maintain your login session (authentication token)</li>
              <li style={{ marginBottom: "8px" }}>Remember your preferences (theme, settings)</li>
              <li style={{ marginBottom: "8px" }}>Cache data for better performance</li>
              <li style={{ marginBottom: "8px" }}>Store temporary conversation data</li>
            </ul>
            <p style={{ marginBottom: "12px" }}>
              You can clear local storage through your browser settings, but this may affect functionality.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              8. Children's Privacy
            </h2>
            <p style={{ marginBottom: "12px" }}>
              SyntraIQ is not intended for users under 13 years of age. We do not knowingly collect information 
              from children under 13. If you believe we have collected information from a child under 13, 
              please contact us immediately.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              9. International Users
            </h2>
            <p style={{ marginBottom: "12px" }}>
              SyntraIQ is operated from India. If you access the Service from outside India, your information 
              may be transferred to and processed in India. By using the Service, you consent to this transfer.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              10. AI and Machine Learning
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Your conversations and queries may be processed by third-party AI providers (OpenAI, Anthropic, 
              Google, xAI) to generate responses. Each provider has its own data processing policies:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>We do not use your data to train AI models</li>
              <li style={{ marginBottom: "8px" }}>AI providers may use data according to their policies</li>
              <li style={{ marginBottom: "8px" }}>Conversations in AI Friend and AI Psychologist modes are processed the same way</li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              11. Changes to Privacy Policy
            </h2>
            <p style={{ marginBottom: "12px" }}>
              We may update this Privacy Policy from time to time. We will notify you of significant changes by:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Updating the "Last Updated" date</li>
              <li style={{ marginBottom: "8px" }}>Sending an email to your registered address</li>
              <li style={{ marginBottom: "8px" }}>Displaying a prominent notice in the Service</li>
            </ul>
            <p style={{ marginBottom: "12px" }}>
              Continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              12. Contact Us
            </h2>
            <p style={{ marginBottom: "12px" }}>
              If you have questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <p style={{ marginBottom: "12px" }}>
              <strong>Email:</strong> privacy@syntraiq.com<br />
              <strong>Support:</strong> support@syntraiq.com
            </p>
            <p style={{ marginBottom: "12px" }}>
              For data access, correction, or deletion requests, please use the built-in features in your 
              profile settings or contact us at the email above.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginTop: "40px" }}>
              By using SyntraIQ, you acknowledge that you have read and understood this Privacy Policy and 
              agree to our collection, use, and disclosure of your information as described herein.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

