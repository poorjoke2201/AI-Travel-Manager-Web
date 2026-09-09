export default function WeatherAdvice({ advice }) {
  if (!advice) return null;
  return (
    <div className="rounded-xs border border-marigold-100 bg-marigold-100/50 p-4">
      <p className="mb-1 text-sm font-semibold text-marigold-600">AI-estimated guidance, not a verified forecast</p>
      <p className="text-sm text-ink">{advice}</p>
    </div>
  );
}