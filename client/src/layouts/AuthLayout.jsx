import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function AuthLayout() {
  const [videoFailed, setVideoFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone px-4 py-10">
      <div className="grid w-full max-w-5xl items-stretch overflow-hidden border border-stone-300 bg-stone-50 shadow-paper lg:grid-cols-[0.8fr_1fr]">
        <div className="relative block min-h-[14rem] overflow-hidden bg-ocean p-6 text-stone-50 lg:min-h-[34rem] lg:p-10">
          {!videoFailed && !reducedMotion && <video className="absolute inset-0 h-full w-full object-cover opacity-75" autoPlay loop muted playsInline onError={() => setVideoFailed(true)}><source src="/assets/intro/intro.mp4" type="video/mp4" /></video>}
          {videoFailed && !reducedMotion && <img src="/assets/intro/login-intro-fallback.gif" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-ink/45" />
          <img src="/assets/illustrations/airplane.svg" alt="" className="absolute right-12 top-20 h-16 w-16 opacity-70" />
          <div className="relative flex h-full flex-col justify-between">
            <div><p className="eyebrow !text-ochre-100">Travel Manager / entry</p><p className="mt-4 font-display text-4xl">Your next page starts here.</p></div>
            <div className="border-t border-stone-50/30 pt-4 text-sm leading-6 text-stone-50/80">A quiet place for routes, ideas, and the journeys you have not taken yet.</div>
          </div>
        </div>
        <div className="p-6 sm:p-10">
          <Link to="/" className="mb-8 block font-display text-2xl font-semibold text-ink">
            Travel Manager <span className="eyebrow ml-2 align-middle !text-[0.58rem]">Field notes</span>
          </Link>
          <div className="journal-sheet p-6 sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}