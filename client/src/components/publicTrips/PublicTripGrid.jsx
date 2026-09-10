import PublicTripCard from './PublicTripCard';
import EmptyState from '../common/EmptyState';

export default function PublicTripGrid({ trips }) {
  if (!trips.length) {
    return <EmptyState title="No public trips yet" description="Be the first to share a trip for others to discover." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip, index) => (
        <PublicTripCard key={trip._id} trip={trip} imageIndex={index} />
      ))}
    </div>
  );
}