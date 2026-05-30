import { useState } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { IoIosArrowBack, IoIosSend, IoMdMail, IoMdCall, IoMdPin } from "react-icons/io";
import { useToast } from "../contexts/ToastContext";

export default function ContactPage() {
  const { goBack, navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "General Inquiry",
    message: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      showToast({
        message: "Message sent successfully!",
        type: "success",
        duration: 3000
      });
      setFormData({
        name: "",
        email: "",
        subject: "General Inquiry",
        message: ""
      });
    }, 1500);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

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
        <div className="h1">Contact Us</div>
        <button
          className="btn-ghost glass-button"
          onClick={() => goBack()}
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <p style={{ lineHeight: 1.6, marginBottom: 24, opacity: 0.8 }}>
          Have a question or feedback? We'd love to hear from you. Fill out the form below and our team will get back to you as soon as possible.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, opacity: 0.7 }}>Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Your name"
              className="glass-input"
              style={{ width: "100%", padding: "12px 16px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, opacity: 0.7 }}>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="your@email.com"
              className="glass-input"
              style={{ width: "100%", padding: "12px 16px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, opacity: 0.7 }}>Subject</label>
            <select
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className="glass-input"
              style={{ width: "100%", padding: "12px 16px", appearance: "none" }}
            >
              <option value="General Inquiry">General Inquiry</option>
              <option value="Technical Support">Technical Support</option>
              <option value="Billing">Billing</option>
              <option value="Feedback">Feedback</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, opacity: 0.7 }}>Message</label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              placeholder="How can we help?"
              className="glass-input"
              style={{ width: "100%", padding: "12px 16px", minHeight: 120, resize: "vertical" }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary"
            style={{ 
              marginTop: 8, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: 8,
              height: 50,
              fontSize: "var(--font-md)"
            }}
          >
            {isSubmitting ? (
              "Sending..."
            ) : (
              <>
                <IoIosSend size={20} /> Send Message
              </>
            )}
          </button>
        </form>
      </div>

      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        <div className="glass-card" style={{ flex: "1 1 250px", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 className="h3" style={{ marginBottom: 4 }}>Contact Info</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="glass-button" style={{ width: 40, height: 40, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IoMdMail size={20} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: "var(--font-xs)", opacity: 0.6 }}>Email</div>
              <div style={{ fontSize: "var(--font-sm)" }}>support@syntraiq.com</div>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="glass-button" style={{ width: 40, height: 40, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IoMdCall size={20} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: "var(--font-xs)", opacity: 0.6 }}>Phone</div>
              <div style={{ fontSize: "var(--font-sm)" }}>+1 (555) 123-4567</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="glass-button" style={{ width: 40, height: 40, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IoMdPin size={20} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: "var(--font-xs)", opacity: 0.6 }}>Location</div>
              <div style={{ fontSize: "var(--font-sm)" }}>San Francisco, CA</div>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ flex: "1 1 250px", padding: 20 }}>
          <h3 className="h3" style={{ marginBottom: 12 }}>FAQ</h3>
          <p style={{ fontSize: "var(--font-sm)", opacity: 0.8, marginBottom: 16 }}>
            Looking for quick answers? Check out our help center for common questions and troubleshooting.
          </p>
          <button 
            className="btn-ghost glass-button" 
            onClick={() => navigateTo("/help")}
            style={{ width: "100%", justifyContent: "center" }}
          >
            Visit Help Center
          </button>
        </div>
      </div>
      
      <div style={{ textAlign: "center", marginTop: 32, opacity: 0.6, fontSize: "var(--font-sm)" }}>
        © {new Date().getFullYear()} SyntraIQ. All rights reserved.
      </div>
    </div>
  );
}
