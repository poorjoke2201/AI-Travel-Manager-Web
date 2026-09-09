import { Link } from 'react-router-dom';
import TripCard from './TripCard';
import EmptyState from '../common/EmptyState';
import Button from '../common/Button';

export default function TripGrid({ trips, emptyTitle = 'No trips yet', emptyDescription }) {
  if (!trips.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription || 'Start planning your first trip and it will show up here.'}
        action={
          <Link to="/create-trip">
            <Button>Create trip</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => (
        <TripCard key={trip._id} trip={trip} />
      ))}
    </div>
  );
}