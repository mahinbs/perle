import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack, IoIosArrowDown, IoIosArrowUp } from "react-icons/io";

export default function HelpPage() {
  const { navigateTo } = useRouterNavigation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "How do I use SyntraIQ?",
      answer: "Simply type your question or topic into the search bar on the home page. You can also use voice search or upload files to get answers based on your documents."
    },
    {
      question: "Is SyntraIQ free to use?",
      answer: "Yes, SyntraIQ offers a free plan with access to basic features. We also offer Pro and Max plans for advanced models, higher limits, and exclusive features."
    },
    {
      question: "How do I upgrade my plan?",
      answer: "Go to your Profile page and click on the 'Upgrade' button or select 'Subscription' to view available plans and upgrade options."
    },
    {
      question: "Can I delete my search history?",
      answer: "Yes, you can clear your entire search history from the Profile page under the 'Search History' section."
    },
    {
      question: "How do I report a bug?",
      answer: "Email us at business@syntraiq.ai with a description of the issue. You can open the email from the Report Bug option in your Profile. We appreciate your feedback!"
    }
  ];

  return (
    <div className="container">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div className="h1">Help & FAQ</div>
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/profile")}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 className="h3" style={{ marginBottom: 16 }}>Frequently Asked Questions</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              style={{ 
                border: "1px solid var(--border)", 
                borderRadius: "var(--radius-sm)",
                overflow: "hidden"
              }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                style={{
                  width: "100%",
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--card)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 600,
                  fontSize: "var(--font-md)",
                  color: "var(--text)"
                }}
              >
                {faq.question}
                {openIndex === index ? <IoIosArrowUp /> : <IoIosArrowDown />}
              </button>
              {openIndex === index && (
                <div 
                  style={{ 
                    padding: "0 16px 16px 16px", 
                    background: "var(--card)",
                    color: "var(--sub)",
                    lineHeight: 1.6
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="h3" style={{ marginBottom: 12 }}>Still need help?</h3>
        <p className="sub" style={{ marginBottom: 20 }}>
          Our support team is available to assist you with any questions or issues.
        </p>
        <a
          href="mailto:business@syntraiq.ai"
          className="btn"
          style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none", color: "inherit" }}
        >
          Email Support
        </a>
      </div>
    </div>
  );
}
