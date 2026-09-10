import TransportOptionCard from './TransportOptionCard';
import EmptyState from '../common/EmptyState';

export default function TransportSection({ transport, intercityTransport, intracityTransport }) {
  const intercity = intercityTransport?.length ? intercityTransport : transport?.filter((option) => ['flight', 'train', 'bus', 'car'].includes(option.mode)) || [];
  const intracity = intracityTransport?.length ? intracityTransport : transport?.filter((option) => ['bike', 'car', 'bus'].includes(option.mode)) || [];

  if (!transport?.length && !intercity.length && !intracity.length) {
    return <EmptyState title="No transport recommendations yet" description="This will appear once your trip is generated." />;
  }

  return (
    <div className="space-y-6">
      {intercity.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-ink">Intercity travel</h3>
          {intercity.map((option, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <TransportOptionCard key={`intercity-${option.mode}-${idx}`} option={option} />
          ))}
        </div>
      )}

      {intracity.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-ink">Intracity travel</h3>
          {intracity.map((option, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <TransportOptionCard key={`intracity-${option.mode}-${idx}`} option={option} />
          ))}
        </div>
      )}
    </div>
  );
}