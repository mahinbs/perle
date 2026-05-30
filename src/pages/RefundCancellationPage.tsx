import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack } from "react-icons/io";

export default function RefundCancellationPage() {
  const { goBack } = useRouterNavigation();

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
          onClick={() => goBack()}
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
          Refund & Cancellation Policy
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
              1. Subscription Cancellation
            </h2>
            <p style={{ marginBottom: "12px" }}>
              You may cancel your SyntraIQ subscription at any time. To cancel your subscription, please follow these steps:
            </p>
            <ol style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Navigate to your <strong>Profile</strong>.</li>
              <li style={{ marginBottom: "8px" }}>Select <strong>Subscription Settings</strong>.</li>
              <li style={{ marginBottom: "8px" }}>Click on <strong>Cancel Subscription</strong> or turn off <strong>Auto-Renewal</strong>.</li>
            </ol>
            <p style={{ marginBottom: "12px" }}>
              Alternatively, you can contact our support team at <a href="mailto:support@syntraiq.com" style={{ color: "var(--accent)" }}>support@syntraiq.com</a> with your registered email address, and we will assist you with the cancellation.
            </p>
            <p style={{ marginBottom: "12px" }}>
              Upon cancellation, your subscription will remain active, and you will retain full access to your plan's premium features (IQ Pro or IQ Max) until the end of your current billing cycle. No further recurring charges will be made to your payment method.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              2. Refund Eligibility
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Except as explicitly stated in this policy or required by applicable law, all subscription payments (monthly or annual) made to SyntraIQ are non-refundable.
            </p>
            <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, marginTop: "16px", marginBottom: "12px" }}>
              2.1 Special Exceptions
            </h3>
            <p style={{ marginBottom: "12px" }}>
              We may consider refund requests on a case-by-case basis under the following circumstances:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>
                <strong>Technical Issues:</strong> If a technical issue on our end prevents you from accessing the service for a prolonged period, or if you were charged multiple times for a single subscription due to a system error.
              </li>
              <li style={{ marginBottom: "8px" }}>
                <strong>Accidental Renewal:</strong> If your subscription auto-renewed and you submit a refund request within 48 hours of the renewal charge, provided you have not logged in, uploaded files, or performed any AI searches/analyses since the renewal occurred.
              </li>
              <li style={{ marginBottom: "8px" }}>
                <strong>Upgrade Prorations:</strong> If you upgrade your plan, the unused portion of your lower-tier plan will be prorated and credited back to your account according to our billing provider terms.
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              3. Payment Processing via Razorpay
            </h2>
            <p style={{ marginBottom: "12px" }}>
              All transactions, payments, and subscriptions on SyntraIQ are securely processed through Razorpay. 
              Refunds, when approved, will be initiated back to the original payment method used at the time of purchase.
            </p>
            <p style={{ marginBottom: "12px" }}>
              Please note that once a refund is approved and initiated by us, it may take <strong>5 to 7 business days</strong> for the funds to reflect in your bank account or credit card statement, depending on your financial institution and Razorpay's processing times.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              4. Downgrades and Plan Modifications
            </h2>
            <p style={{ marginBottom: "12px" }}>
              If you choose to downgrade your plan from IQ Max to IQ Pro or to the Free tier:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>
                The downgrade will take effect at the end of your current billing period. 
              </li>
              <li style={{ marginBottom: "8px" }}>
                You will retain access to your higher-tier plan limits until that date.
              </li>
              <li style={{ marginBottom: "8px" }}>
                No partial refunds or credits will be issued for the remaining days of your active high-tier billing cycle.
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              5. How to Request a Refund
            </h2>
            <p style={{ marginBottom: "12px" }}>
              To request a refund, please send an email to our support team at <a href="mailto:support@syntraiq.com" style={{ color: "var(--accent)" }}>support@syntraiq.com</a> with the following details:
            </p>
            <ul style={{ marginLeft: "24px", marginBottom: "12px" }}>
              <li style={{ marginBottom: "8px" }}>Your registered account email address.</li>
              <li style={{ marginBottom: "8px" }}>The transaction ID or Razorpay payment ID (found in your email receipt).</li>
              <li style={{ marginBottom: "8px" }}>A brief explanation of the reason for your refund request.</li>
            </ul>
            <p style={{ marginBottom: "12px" }}>
              We will review your request and notify you of the approval or rejection of your refund within 2-3 business days.
            </p>
          </section>

          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "16px" }}>
              6. Policy Updates
            </h2>
            <p style={{ marginBottom: "12px" }}>
              SyntraIQ reserves the right to update this Refund & Cancellation Policy at any time. Any changes will be posted on this page with an updated "Last Updated" date. Continued use of our service after changes are made indicates your acceptance of the updated policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
