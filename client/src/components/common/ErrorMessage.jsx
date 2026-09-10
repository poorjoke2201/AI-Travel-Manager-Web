import Button from './Button';

export default function ErrorMessage({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="border border-clay-300 bg-clay-100/50 p-4 text-ink">
      <p className="eyebrow !text-clay-600">A route interruption</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}