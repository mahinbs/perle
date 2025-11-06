import { FaTools, FaClock, FaEnvelope } from "react-icons/fa";

export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 600,
          width: "100%",
          padding: "48px 32px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent) 0%, rgba(199, 168, 105, 0.7) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
            boxShadow: "0 8px 24px rgba(199, 168, 105, 0.3)",
          }}
        >
          <FaTools
            size={60}
            style={{
              color: "#fff",
              animation: "spin 3s linear infinite",
            }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 36px)",
            fontWeight: 700,
            margin: 0,
            color: "var(--text)",
            lineHeight: 1.2,
          }}
        >
          We'll be back soon!
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "clamp(16px, 3vw, 18px)",
            color: "var(--sub)",
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 480,
          }}
        >
          We're currently performing some maintenance to improve your experience. 
          We'll be back online shortly.
        </p>

        {/* Info Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            width: "100%",
            marginTop: 8,
          }}
        >
          {/* Estimated Time */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "16px",
              background: "var(--bg)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <FaClock
              size={20}
              style={{
                color: "var(--accent)",
                flexShrink: 0,
              }}
            />
            <div style={{ textAlign: "left", flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 2,
                }}
              >
                Estimated Time
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--sub)",
                }}
              >
                We expect to be back within a few hours
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "16px",
              background: "var(--bg)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <FaEnvelope
              size={20}
              style={{
                color: "var(--accent)",
                flexShrink: 0,
              }}
            />
            <div style={{ textAlign: "left", flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 2,
                }}
              >
                Need Help?
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--sub)",
                }}
              >
                Contact us at support@perle.com
              </div>
            </div>
          </div>
        </div>

        {/* Branding */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 24,
            borderTop: "1px solid var(--border)",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--accent)",
              letterSpacing: 1,
            }}
          >
            Perlé
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--sub)",
              marginTop: 4,
            }}
          >
            Elegant AI Search
          </div>
        </div>
      </div>

      {/* CSS Animation */}
      <style>
        {`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
          
          @media (max-width: 640px) {
            .card {
              padding: 32px 24px !important;
            }
          }
        `}
      </style>
    </div>
  );
}

