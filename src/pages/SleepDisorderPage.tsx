import { IoIosArrowBack } from "react-icons/io";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import sleepDisorderVideo from "../assets/sleep-disorder-video.mp4";
import { HealthWellnessDisclaimer } from "../components/HealthWellnessDisclaimer";

export default function SleepDisorderPage() {
  const { navigateTo } = useRouterNavigation();

  return (
    <div className="container h-full flex flex-col !p-0 bg-[var(--bg)]">
      <div className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="flex items-center gap-3 p-4">
          <button className="btn-ghost glass-button p-2!" onClick={() => navigateTo("/app")} aria-label="Back">
            <IoIosArrowBack size={24} />
          </button>
          <div>
            <div className="h3 mb-0">Better Sleep</div>
            <div className="sub text-sm opacity-70">General wellness tips for rest</div>
          </div>
        </div>
        <HealthWellnessDisclaimer compact />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-6 overflow-y-auto">
        <p className="text-center text-[var(--text)] max-w-md leading-relaxed opacity-90">
          Many people want better rest. Watch this general wellness guide for everyday sleep habits — it is not a medical diagnosis or treatment plan.
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
          onClick={() => navigateTo("/app", { searchQuery: "What are some everyday tips for better sleep and rest?", bypassSleepDisorderRedirect: true })}
        >
          Ask IQ about better sleep
        </button>
      </div>
    </div>
  );
}
