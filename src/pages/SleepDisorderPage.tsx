import { IoIosArrowBack } from "react-icons/io";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import sleepDisorderVideo from "../assets/sleep-disorder-video.mp4";

export default function SleepDisorderPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div className="container h-screen flex flex-col !p-0 bg-[var(--bg)]">
      <div className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="flex items-center gap-3 p-4">
          <button className="btn-ghost glass-button p-2!" onClick={() => navigateTo("/")} aria-label="Back">
            <IoIosArrowBack size={24} />
          </button>
          <div>
            <div className="h3 mb-0">Sleep Disorders</div>
            <div className="sub text-sm opacity-70">Understanding sleep health</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-6 overflow-y-auto">
        <p className="text-center text-[var(--text)] max-w-md leading-relaxed opacity-90">
          Many people face challenges with sleep disorders. Watch this guide to learn about common sleep issues and practical steps toward better rest.
        </p>
        <div className="w-full max-w-2xl glass-card border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
          <video
            src={sleepDisorderVideo}
            autoPlay
            loop
            muted
            playsInline
            controls
            className="w-full aspect-video object-cover bg-black"
          />
        </div>
        <button
          type="button"
          className="btn glass-button"
          style={{ background: "var(--accent)", color: "#111" }}
          onClick={() => navigateTo("/?searchQuery=How can I improve my sleep if I have a sleep disorder")}
        >
          Ask IQ about sleep disorders
        </button>
      </div>
    </div>
  );
}
