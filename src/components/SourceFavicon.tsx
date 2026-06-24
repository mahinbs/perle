import React, { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  getSourceDomain,
  getSourceFaviconCandidates,
  getSourceLetter,
  resolveSourceFaviconUrl,
} from "../utils/sourceFavicon";

type SourceFaviconProps = {
  url: string;
  domain?: string;
  title?: string;
  snippet?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  rounded?: boolean | "sm";
};

const letterAvatarStyle = (
  size: number,
  borderRadius: string | number | undefined,
  style?: React.CSSProperties
): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--input-bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: Math.max(10, Math.round(size * 0.55)),
  fontWeight: 700,
  flexShrink: 0,
  ...style,
});

export const SourceFavicon: React.FC<SourceFaviconProps> = ({
  url,
  domain,
  title,
  snippet,
  size = 18,
  className,
  style,
  rounded = true,
}) => {
  const isNative = Capacitor.isNativePlatform();
  const host = getSourceDomain(url, domain, title, snippet);
  const candidates = useMemo(
    () => getSourceFaviconCandidates(url, domain, title, snippet),
    [url, domain, title, snippet]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = null;
  };

  useEffect(() => {
    setCandidateIndex(0);
    setImgSrc(null);
    revokeObjectUrl();

    if (candidates.length === 0) return;

    let cancelled = false;

    const load = async () => {
      if (isNative) {
        const resolved = await resolveSourceFaviconUrl(url, domain, 0, title, snippet);
        if (cancelled) {
          if (resolved?.startsWith("blob:")) URL.revokeObjectURL(resolved);
          return;
        }
        objectUrlRef.current = resolved;
        setImgSrc(resolved);
        return;
      }

      setImgSrc(candidates[0]);
    };

    void load();

    return () => {
      cancelled = true;
      revokeObjectUrl();
    };
  }, [url, domain, title, snippet, candidates, isNative]);

  const tryNextCandidate = async () => {
    const nextIndex = candidateIndex + 1;
    if (nextIndex >= candidates.length) {
      setImgSrc(null);
      setCandidateIndex(nextIndex);
      return;
    }

    if (isNative) {
      const resolved = await resolveSourceFaviconUrl(url, domain, nextIndex, title, snippet);
      revokeObjectUrl();
      objectUrlRef.current = resolved;
      setImgSrc(resolved);
      setCandidateIndex(nextIndex);
      return;
    }

    setCandidateIndex(nextIndex);
    setImgSrc(candidates[nextIndex]);
  };

  const borderRadius =
    rounded === "sm" ? 4 : rounded ? "50%" : undefined;

  if (candidates.length === 0 || !imgSrc || candidateIndex >= candidates.length) {
    return (
      <span
        className={className}
        aria-hidden
        style={letterAvatarStyle(size, borderRadius, style)}
      >
        {getSourceLetter(host)}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={imgSrc}
      alt=""
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const img = e.currentTarget;
        // gstatic returns a 1×1 or 2×2 transparent pixel for unknown domains.
        // This doesn't fire onError, so we detect it here and skip to next candidate.
        if (img.naturalWidth <= 2 || img.naturalHeight <= 2) {
          void tryNextCandidate();
        }
      }}
      onError={() => {
        void tryNextCandidate();
      }}
      style={{
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        minHeight: size,
        maxHeight: size,
        borderRadius,
        objectFit: "cover",
        flexShrink: 0,
        background: "var(--card)",
        display: "block",
        transform: "translateZ(0)",
        position: "relative",
        zIndex: 2,
        ...style,
      }}
    />
  );
};
