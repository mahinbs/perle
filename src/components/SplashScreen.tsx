import { useEffect, useState } from "react";

export function SplashScreen() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("../assets/earth.mp4")
      .then((mod) => {
        if (!cancelled) setVideoSrc(mod.default);
      })
      .catch(() => {
        if (!cancelled) setVideoSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="splash-screen" role="status" aria-label="Loading">
        <div className="splash-logo relative w-full">
          {videoSrc ? (
            <video
              src={videoSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full max-w-md mx-auto object-cover rounded-lg"
              aria-hidden
            />
          ) : (
            <div
              className="w-full max-w-md mx-auto h-48 rounded-lg bg-[var(--input-bg)] animate-pulse"
              aria-hidden
            />
          )}
        </div>
        <p className="splash-tagline font-ubuntu text-lg! font-medium">
          Preparing your Syntra<span className="text-gold">IQ</span> experience…
        </p>
      </div>
    </>
  );
}
