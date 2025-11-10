import logo from "../assets/images/logo.png";

export function SplashScreen() {
  return (
    <>
      <div className="splash-screen" role="status" aria-label="Loading">
        <div className="splash-logo">
          <img src={logo} alt="SyntraIQ logo" />
        </div>
        <p className="splash-tagline">Preparing your SyntraIQ experience…</p>
      </div>
      <style>
        {`
          .splash-screen {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 18px;
            background: radial-gradient(circle at top, var(--card), var(--bg));
            color: var(--text);
            z-index: 10000;
            transition: opacity 0.6s ease;
          }

          .splash-logo {
            width: clamp(180px, 40vw, 240px);
            filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.25));
            animation: splash-pop 0.9s ease forwards;
          }

          .splash-logo img {
            width: 100%;
            height: auto;
            display: block;
            object-fit: contain;
          }

          .splash-tagline {
            margin: 0;
            font-size: var(--font-md);
            font-weight: 600;
            letter-spacing: 0.04em;
            color: var(--sub);
            animation: splash-fade-in 1.3s ease forwards;
          }

          @keyframes splash-pop {
            0% {
              transform: scale(0.92);
              opacity: 0;
            }
            60% {
              transform: scale(1.03);
              opacity: 1;
            }
            100% {
              transform: scale(1);
            }
          }

          @keyframes splash-fade-in {
            0% {
              opacity: 0;
              transform: translateY(8px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @media (max-width: 480px) {
            .splash-screen {
              gap: 14px;
            }

            .splash-tagline {
              font-size: var(--font-sm);
            }
          }
        `}
      </style>
    </>
  );
}

