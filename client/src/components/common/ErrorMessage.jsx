import Button from './Button';

export default function ErrorMessage({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="rounded-xs border border-clay-100 bg-clay-100/40 p-4 text-ink">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}