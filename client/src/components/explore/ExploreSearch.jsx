import { useState } from 'react';
import CityAutocomplete from '../common/CityAutocomplete';
import Button from '../common/Button';

export default function ExploreSearch({ onSearch, isLoading }) {
  const [query, setQuery] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <CityAutocomplete
        name="destination-search"
        placeholder="Search a destination, e.g. Mysuru"
        value={query}
        onChange={setQuery}
        className="flex-1"
      />
      <Button type="submit" isLoading={isLoading}>
        Search
      </Button>
    </form>
  );
}