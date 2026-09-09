import TransportOptionCard from './TransportOptionCard';
import EmptyState from '../common/EmptyState';

export default function TransportSection({ transport }) {
  if (!transport?.length) {
    return <EmptyState title="No transport recommendations yet" description="This will appear once your trip is generated." />;
  }

  return (
    <div className="space-y-4">
      {transport.map((option, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <TransportOptionCard key={`${option.mode}-${idx}`} option={option} />
      ))}
    </div>
  );
}