import React, { useEffect, useRef, useState } from "react";

interface VoiceResponseTextProps {
  text?: string;
  speaking: boolean;
}

const VoiceResponseTextComponent: React.FC<VoiceResponseTextProps> = ({
  text: providedText,
  speaking,
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Typewriter effect
  useEffect(() => {
    if (!providedText) {
      setDisplayedText("");
      return;
    }

    let currentIndex = 0;
    setDisplayedText(""); // Reset on new text

    const intervalId = setInterval(() => {
      if (currentIndex < providedText.length) {
        setDisplayedText((prev) => prev + providedText[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(intervalId);
      }
    }, 25); // Typing speed

    return () => clearInterval(intervalId);
  }, [providedText]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedText]);

  const hasText = displayedText.length > 0;

  return (
    <div
      ref={containerRef}
      className={`
        w-full text-center text-(--text)
        text-[clamp(1rem,3vh,1.5rem)] leading-[1.6]
        max-w-[800px]
        min-h-[60px] max-h-[25vh]
        p-[2vh_2vw]
        
        flex items-center justify-center overflow-x-hidden overflow-y-auto
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        [-webkit-overflow-scrolling:touch]
        transition-[max-height,opacity,padding] duration-300 ease-in-out
        ${hasText ? (speaking ? 'opacity-95' : 'opacity-70') : 'opacity-0'}
      `}
    >
      {hasText && (
        <div className="w-full break-after-auto whitespace-pre-wrap">
          {displayedText}
        </div>
      )}
    </div>
  );
};

export default React.memo(VoiceResponseTextComponent);


