import { useEffect, useRef, useState } from 'react';
import { VOICES } from './voicesData';

function VoicePaper({ voice, index }) {
  const paperRef = useRef(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0, active: false });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.12 },
    );

    if (paperRef.current) observer.observe(paperRef.current);
    return () => observer.disconnect();
  }, []);

  function handlePointerMove(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      active: true,
    });
  }

  return (
    <article
      ref={paperRef}
      className={`voice-paper voice-paper-${index + 1} ${isVisible ? 'voice-paper-visible' : ''}`}
      style={{
        '--voice-rotation': voice.rotation,
        '--pointer-x': pointer.x,
        '--pointer-y': pointer.y,
      }}
      onMouseMove={handlePointerMove}
      onMouseEnter={() => setPointer((current) => ({ ...current, active: true }))}
      onMouseLeave={() => setPointer({ x: 0, y: 0, active: false })}
    >
      <span className="voice-tape" aria-hidden="true" />
      <div className="voice-paper-content">
        <p className="voice-label">{voice.label}</p>
        <blockquote>“{voice.quote}”</blockquote>
        <footer>
          <span>Respondent {voice.respondent}</span>
          <span>{voice.age} · {voice.location}</span>
        </footer>
      </div>
    </article>
  );
}

export default function VoicesSection() {
  return (
    <section className="voices-section" aria-labelledby="voices-heading">
      <div className="voices-heading-row">
        <div>
          <p className="eyebrow voices-kicker">Field notes / 2024–25</p>
          <h2 id="voices-heading">Hear it from them.</h2>
          <p className="voices-intro">Planning a holiday shouldn’t feel like another job.</p>
        </div>
        <p className="voices-index" aria-hidden="true">A collection of lived experience<br />from the planning desk</p>
      </div>

      <div className="voices-rule" />

      <div className="voices-collage">
        {VOICES.map((voice, index) => (
          <VoicePaper key={voice.id} voice={voice} index={index} />
        ))}
      </div>
    </section>
  );
}