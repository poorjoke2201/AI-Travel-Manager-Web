import { useEffect, useState } from 'react';

export default function LoginIntro({ onComplete }) {
  const [isVisible, setIsVisible] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) onComplete();
  }, [onComplete]);

  function finish() {
    setIsVisible(false);
    onComplete();
  }

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-center bg-ink/95 p-6 text-stone-50" role="dialog" aria-label="Opening your travel journal">
      <img
        className={`absolute inset-0 h-full w-full object-cover opacity-80 ${videoFailed ? '' : 'hidden'}`}
        src="/assets/intro/login-intro-fallback.gif"
        alt=""
      />
      <video
        className={`absolute inset-0 h-full w-full object-cover opacity-80 ${videoFailed ? 'hidden' : ''}`}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={() => setVideoFailed(true)}
        poster="/assets/intro/login-intro-fallback.gif"
      >
        <source src="/assets/intro/login-intro.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-ink/35" />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <p className="eyebrow !text-ochre-100">Your journal is ready</p>
        <p className="mt-3 font-display text-3xl">Let&apos;s find the next page.</p>
        <button type="button" onClick={finish} className="mt-8 rounded-xs border border-stone-50/60 px-4 py-2 text-sm font-semibold transition-colors hover:bg-stone-50 hover:text-ink">
          Skip intro
        </button>
      </div>
    </div>
  );
}