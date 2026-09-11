import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const HERO_SLIDES = [
  {
    image: '/assets/destinations/landing-hero-01.webp',
    caption: 'First light, somewhere new',
  },
  {
    image: '/assets/destinations/landing-hero-02.webp',
    caption: 'Take the long way through',
  },
  {
    image: '/assets/destinations/landing-hero-03.webp',
    caption: 'A table worth remembering',
  },
  {
    image: '/assets/destinations/landing-hero-04.webp',
    caption: 'Leave room for the unexpected',
  },
];

const FEATURE_ITEMS = [
  {
    label: 'AI trip planning',
    title: 'A plan with room to wander.',
    description:
      'Shape a complete journey around your pace, budget, and the places you actually want to see.',
    image: '/assets/features/feature-planning.webp',
  },
  {
    label: 'Recommendations',
    title: 'Find the places between the landmarks.',
    description:
      'Collect thoughtful stays, food, and discoveries that make a destination feel personal.',
    image: '/assets/features/feature-recommendations.webp',
  },
  {
    label: 'POI discovery',
    title: 'Follow the details that catch your eye.',
    description:
      'Explore places on the map and keep the discoveries that belong in your story.',
    image: '/assets/features/feature-places.webp',
  },
  {
    label: 'Smart routes',
    title: 'See the shape of the journey.',
    description:
      'Connect each stop into a route that respects time, distance, and the joy of taking the long way.',
    image: '/assets/features/feature-routes.webp',
  },
  {
    label: 'Stays',
    title: 'A good place to come back to.',
    description:
      'Compare stays that give your itinerary a useful, comfortable centre.',
    image: '/assets/features/feature-stays.webp',
  },
];

const FEATURE_POSITIONS = [
  { rotate: '-7deg', x: '-4%', y: '10%' },
  { rotate: '5deg', x: '2%', y: '-4%' },
  { rotate: '-3deg', x: '0%', y: '8%' },
  { rotate: '7deg', x: '-2%', y: '-5%' },
  { rotate: '-6deg', x: '3%', y: '10%' },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const [activeFeature, setActiveFeature] = useState(0);
  const [featureParallax, setFeatureParallax] = useState({ x: 0, y: 0 });
  const [featureTransition, setFeatureTransition] = useState(0);

  const slide = HERO_SLIDES[activeSlide];

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (isPaused || reducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setActiveSlide(
        (current) => (current + 1) % HERO_SLIDES.length,
      );
    }, 6500);

    return () => window.clearInterval(timer);
  }, [isPaused]);

  function moveSlide(direction) {
    setActiveSlide(
      (current) =>
        (current + direction + HERO_SLIDES.length) %
        HERO_SLIDES.length,
    );
  }

  function handleParallax(event) {
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    setParallax({
      x:
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y:
        ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    });
  }

  function handleFeatureParallax(event) {
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    setFeatureParallax({
      x:
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y:
        ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    });
  }

  function selectFeature(index) {
    setActiveFeature(index);
    setFeatureTransition((current) => current + 1);
    setFeatureParallax({ x: 0, y: 0 });
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-20 pt-10 lg:pt-16">
      {/* HERO */}
      <section className="relative grid min-h-[32rem] items-center gap-12 overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative z-10 max-w-xl">
          <p className="eyebrow">A living atlas for the curious</p>

          <h1 className="mt-5 max-w-lg font-display text-6xl font-medium leading-[0.98] tracking-tight text-ink sm:text-7xl">
            Make room for the way you travel.
          </h1>

          <p className="mt-7 max-w-md text-lg leading-8 text-ink-500">
            Shape a journey around your pace, your curiosities, and the
            little places worth remembering.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={isAuthenticated ? '/create-trip' : '/register'}
              className="btn-primary"
            >
              Open a new page
            </Link>

            <Link to="/explore" className="btn-secondary">
              Browse the atlas
            </Link>
          </div>

          <p className="mt-8 font-display text-lg italic text-ocean-700">
            Plans with a pulse, not a checklist.
          </p>
        </div>

        <div
          className="relative min-h-[30rem] lg:min-h-[34rem]"
          aria-label="A journal spread showing a route through a destination"
          onMouseMove={handleParallax}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => {
            setIsPaused(false);
            setParallax({ x: 0, y: 0 });
          }}
          onFocus={() => setIsPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsPaused(false);
            }
          }}
        >
          <div
            className="absolute right-2 top-8 h-80 w-[78%] rotate-3 border border-stone-300 bg-[#d9c7a7] p-3 shadow-paper transition-transform duration-300 sm:right-10"
            style={{
              transform: `translate(${parallax.x * 5}px, ${
                parallax.y * 5
              }px) rotate(3deg)`,
            }}
          >
            <div className="relative h-full overflow-hidden border border-ink/20 bg-ocean p-5">
              <img
                key={slide.image}
                src={slide.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity duration-700"
              />

              <div className="absolute inset-0 bg-ink/25" />

              <div className="relative">
                <span className="eyebrow !text-stone-50">
                  Atlas / {String(activeSlide + 1).padStart(2, '0')}
                </span>
              </div>

              <div className="relative mt-24 flex items-center gap-3 text-stone-50">
                <span className="h-3 w-3 rounded-full border-2 border-stone-50" />

                <span className="h-px w-24 border-t border-dashed border-stone-50" />

                <span className="text-sm">{slide.caption}</span>
              </div>

              <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-50">
                  {String(activeSlide + 1).padStart(2, '0')} /{' '}
                  {String(HERO_SLIDES.length).padStart(2, '0')}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveSlide(-1)}
                    aria-label="Previous journal image"
                    className="rounded-full border border-stone-50/70 px-2 py-1 text-xs text-stone-50 transition-colors hover:bg-stone-50 hover:text-ink"
                  >
                    Prev
                  </button>

                  <button
                    type="button"
                    onClick={() => moveSlide(1)}
                    aria-label="Next journal image"
                    className="rounded-full border border-stone-50/70 px-2 py-1 text-xs text-stone-50 transition-colors hover:bg-stone-50 hover:text-ink"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className="journal-sheet absolute bottom-2 left-4 z-20 w-64 -rotate-6 p-5 transition-transform duration-300 sm:left-16"
            style={{
              transform: `translate(${parallax.x * -8}px, ${
                parallax.y * -6
              }px) rotate(-6deg)`,
            }}
          >
            <p className="font-display text-2xl text-ink">
              Notes from the road
            </p>

            <p className="mt-4 text-sm leading-6 text-ink-500">
              A loose collection of places, pauses, and plans for the
              next crossing.
            </p>

            <div className="mt-5 flex items-center justify-between border-t border-stone-300 pt-3 text-xs uppercase tracking-widest text-ink-500">
              <span>Field note</span>
              <span>04—26</span>
            </div>
          </div>

          <div
            className="absolute bottom-24 right-0 z-20 rotate-12 rounded-sm border border-clay bg-clay-100 px-4 py-2 font-display text-sm text-clay-600 shadow-paper transition-transform duration-300"
            style={{
              transform: `translate(${parallax.x * 11}px, ${
                parallax.y * 9
              }px) rotate(12deg)`,
            }}
          >
            take the scenic route
          </div>

          <img
            src="/assets/ephemera/passport-stamp.webp"
            alt=""
            className="absolute left-0 top-10 z-20 h-20 w-20 -rotate-12 object-contain opacity-90 transition-transform duration-300"
            style={{
              transform: `translate(${parallax.x * -12}px, ${
                parallax.y * -10
              }px) rotate(-12deg)`,
            }}
          />

          <img
            src="/assets/ephemera/luggage.webp"
            alt=""
            className="absolute bottom-0 right-8 z-20 h-24 w-24 rotate-6 object-contain drop-shadow-md transition-transform duration-300"
            style={{
              transform: `translate(${parallax.x * 14}px, ${
                parallax.y * 8
              }px) rotate(6deg)`,
            }}
          />

          <img
            src="/assets/illustrations/compass.svg"
            alt=""
            className="absolute right-4 top-0 z-20 h-16 w-16 opacity-90 transition-transform duration-300"
            style={{
              transform: `translate(${parallax.x * 10}px, ${
                parallax.y * -8
              }px) rotate(${parallax.x * 8}deg)`,
            }}
          />

          <img
            src="/assets/illustrations/camera.svg"
            alt=""
            className="absolute bottom-2 left-0 z-20 h-16 w-16 -rotate-12 opacity-90 transition-transform duration-300"
            style={{
              transform: `translate(${parallax.x * -14}px, ${
                parallax.y * 10
              }px) rotate(-12deg)`,
            }}
          />

          <div
            className="absolute left-24 top-0 z-20 h-5 w-28 rotate-2 bg-[#d8cda9]/90 shadow-sm"
            style={{
              transform: `translate(${parallax.x * -5}px, ${
                parallax.y * -5
              }px) rotate(2deg)`,
            }}
          />
        </div>
      </section>

      {/* FEATURE SECTION */}
      <section
        className="relative mt-16 min-h-[calc(100svh-7rem)] overflow-hidden border-y border-stone-300 py-8 sm:py-10"
        onMouseMove={handleFeatureParallax}
        onMouseLeave={() => setFeatureParallax({ x: 0, y: 0 })}
      >
        <p className="relative z-30 text-center eyebrow">
          The travel manager / in motion
        </p>

        <h2 className="relative z-30 ml-2 mt-5 max-w-2xl translate-y-1 text-left font-handwritten text-6xl font-bold leading-[0.82] tracking-normal sm:ml-3 sm:text-7xl lg:max-w-3xl">
          A travel manager that moves with you.
        </h2>

        {/* BACKGROUND NEWSPAPERS */}
        <img
          src="/assets/ephemera/newspaper%20-%20bottom%20left.webp"
          alt=""
          className="pointer-events-none absolute -bottom-16 -left-24 z-0 w-[25rem] -rotate-6 opacity-45 sm:w-[32rem]"
        />

        <img
          src="/assets/ephemera/newspaper%20-%20top%20right.webp"
          alt=""
          className="pointer-events-none absolute -right-10 top-16 z-10 w-[20rem] rotate-0 opacity-60 sm:right-0 sm:w-[28rem]"
        />

        <div className="relative z-20 mx-auto mt-8 max-w-6xl">
          {/* MAIN FEATURE CONTENT */}
          <div className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
            {/* TEXT */}
            <div className="max-w-xl text-center lg:ml-auto lg:translate-x-8 lg:pr-0 lg:text-right">
              <p className="eyebrow">
                {FEATURE_ITEMS[activeFeature].label}
              </p>

              <h3
                key={FEATURE_ITEMS[activeFeature].title}
                className="mt-4 font-display text-4xl font-bold italic leading-tight sm:text-5xl"
              >
                {FEATURE_ITEMS[activeFeature].title}
              </h3>

              <p className="mt-5 ml-auto max-w-lg text-base leading-7 text-ink-500">
                {FEATURE_ITEMS[activeFeature].description}
              </p>

              <div className="mt-6 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.18em] text-ink-500 lg:justify-end">
                <span className="h-px w-12 bg-clay" />
                Choose a chapter
              </div>
            </div>

            {/* FEATURE IMAGE */}
            <div
              className="relative h-[18rem] sm:h-[23rem]"
              aria-live="polite"
            >
              <img
                key={`${FEATURE_ITEMS[activeFeature].image}-${featureTransition}`}
                src={FEATURE_ITEMS[activeFeature].image}
                alt={FEATURE_ITEMS[activeFeature].label}
                className="feature-hero-enter absolute left-1/2 top-1/2 h-[16rem] w-[min(78vw,25rem)] -translate-x-1/2 -translate-y-1/2 rotate-2 object-contain transition-transform duration-500 sm:h-[21rem] sm:w-[min(52vw,31rem)] lg:-ml-16"
                style={{
                  transform: `translate(calc(-50% - 7rem + ${
                    featureParallax.x * 9
                  }px), calc(-50% + ${
                    featureParallax.y * 6
                  }px)) rotate(2deg) scale(1.04)`,
                }}
              />

              <img
                src="/assets/illustrations/airplane.svg"
                alt=""
                className="absolute right-[4%] top-0 h-12 w-12 opacity-80 transition-transform duration-300"
                style={{
                  transform: `translate(${featureParallax.x * 8}px, ${
                    featureParallax.y * -6
                  }px) rotate(8deg)`,
                }}
              />

              <img
                src="/assets/illustrations/location.svg"
                alt=""
                className="absolute bottom-5 left-[4%] h-12 w-12 opacity-80 transition-transform duration-300"
                style={{
                  transform: `translate(${featureParallax.x * -7}px, ${
                    featureParallax.y * 7
                  }px)`,
                }}
              />
            </div>
          </div>

          {/* FEATURE SELECTORS */}
          <div className="relative mx-auto mt-3 flex max-w-5xl items-end justify-center gap-1 sm:gap-5">
            {FEATURE_ITEMS.map((feature, index) => (
              <button
                key={feature.label}
                type="button"
                onClick={() => selectFeature(index)}
                aria-label={`Show ${feature.label}`}
                aria-pressed={activeFeature === index}
                className={`group relative w-1/5 text-left transition-all duration-500 ${
                  activeFeature === index
                    ? '-translate-y-5 scale-110 opacity-100'
                    : 'opacity-75 hover:-translate-y-3 hover:opacity-100'
                }`}
                style={{
                  transform: `translate(${
                    featureParallax.x * (index - 2) * 2
                  }px, ${
                    featureParallax.y * (index % 2 ? 3 : -3)
                  }px) rotate(${FEATURE_POSITIONS[index].rotate})`,
                }}
              >
                <img
                  src={feature.image}
                  alt=""
                  className="h-14 w-full object-contain drop-shadow-md transition-transform duration-500 group-hover:scale-110 sm:h-20"
                />

                <span
                  className={`mt-2 block text-center text-[0.6rem] font-bold uppercase tracking-wider ${
                    activeFeature === index
                      ? 'text-clay-600'
                      : 'text-ink-500'
                  }`}
                >
                  {feature.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}