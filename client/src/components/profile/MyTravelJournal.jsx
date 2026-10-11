import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../common/EmptyState';
import ProfileDrawer from './ProfileDrawer';
import { useTrips } from '../../hooks/useTrips';
import * as journalService from '../../services/journalService';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function formatVisitedOn(value) {
  if (!value) return 'Date not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function JournalTile({ entry, onEdit }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageError, setImageError] = useState('');
  const [isLoadingImage, setIsLoadingImage] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    const loadImage = entry.photos?.[0]
      ? journalService.getJournalPhotoUrl(entry._id, entry.photos[0].filename)
      : journalService.getJournalFallbackImage(entry._id);
    loadImage.then((url) => {
      if (url?.startsWith('blob:')) objectUrl = url;
      if (active) setImageUrl(url || null);
    }).catch((error) => {
      if (active) setImageError(error.message || 'Memory image could not be loaded.');
    }).finally(() => {
      if (active) setIsLoadingImage(false);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry._id, entry.photos]);

  return (
    <article className="journal-sheet overflow-hidden">
      <div className="relative h-44 bg-stone-200">
        {isLoadingImage ? <div role="status" aria-label="Loading memory photo" className="absolute inset-0 animate-pulse bg-stone-100" /> : null}
        <img
          src={imageUrl || '/assets/places/placeholder.svg'}
          alt={entry.placeName}
          className="h-full w-full object-cover"
          onError={() => setImageError('The memory image could not be displayed.')}
        />
        {imageError ? <span title={imageError} className="absolute bottom-2 left-2 rounded bg-stone-50/90 px-2 py-1 text-xs text-ink-500">Image unavailable</span> : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="break-words font-display text-xl font-semibold">{entry.placeName}</h3>
          <button type="button" onClick={() => onEdit(entry)} className="shrink-0 text-sm font-semibold text-ocean-700 underline underline-offset-4">Edit</button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-500">
          <span aria-hidden="true">⌖</span>
          <span className="break-words">{[entry.city, entry.state].filter(Boolean).join(', ')}</span>
        </p>
        <p className="mt-2 text-xs text-ink-500">Visited {formatVisitedOn(entry.visitedOn)}</p>
        {entry.note ? <p className="mt-3 line-clamp-3 break-words text-sm text-ink-600">{entry.note}</p> : null}
      </div>
    </article>
  );
}

function JournalEditor({ entry, trips, onClose, onSubmit }) {
  const [fields, setFields] = useState(() => ({
    placeName: entry?.placeName || '',
    city: entry?.city || '',
    state: entry?.state || '',
    note: entry?.note || '',
    visitedOn: entry?.visitedOn || todayUtc(),
    tripId: entry?.tripId || '',
  }));
  const [files, setFiles] = useState([]);
  const [removePhotos, setRemovePhotos] = useState([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const retainedCount = (entry?.photos || []).filter((photo) => !removePhotos.includes(photo.filename)).length;

  function choosePhotos(event) {
    const selected = Array.from(event.target.files || []);
    const capacity = 5 - retainedCount;
    if (selected.length > capacity) {
      setError(`This entry can have at most five photos; ${capacity} slot${capacity === 1 ? '' : 's'} remain.`);
      event.target.value = '';
      return;
    }
    const invalidFile = selected.find((file) => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setError('Choose JPEG or PNG images that are each 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setError('');
    setFiles(selected);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await onSubmit(fields, files, removePhotos);
    } catch (submitError) {
      setError(submitError.message || 'The memory could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">Place name
        <input required maxLength={120} value={fields.placeName} onChange={(event) => setFields({ ...fields, placeName: event.target.value })} className="input-field mt-1" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">City
          <input required maxLength={100} value={fields.city} onChange={(event) => setFields({ ...fields, city: event.target.value })} className="input-field mt-1" />
        </label>
        <label className="block text-sm font-medium">State
          <input maxLength={100} value={fields.state} onChange={(event) => setFields({ ...fields, state: event.target.value })} className="input-field mt-1" />
        </label>
      </div>
      <label className="block text-sm font-medium">Visited on
        <input type="date" required value={fields.visitedOn} onChange={(event) => setFields({ ...fields, visitedOn: event.target.value })} className="input-field mt-1" />
      </label>
      <label className="block text-sm font-medium">Related trip (optional)
        <select value={fields.tripId} onChange={(event) => setFields({ ...fields, tripId: event.target.value })} className="input-field mt-1">
          <option value="">No related trip</option>
          {trips.map((trip) => <option key={trip._id} value={trip._id}>{trip.tripName}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Note
        <textarea maxLength={5000} rows={4} value={fields.note} onChange={(event) => setFields({ ...fields, note: event.target.value })} className="input-field mt-1" />
      </label>
      {entry?.photos?.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Saved photos</legend>
          <div className="space-y-2">
            {entry.photos.map((photo) => (
              <label key={photo.filename} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={removePhotos.includes(photo.filename)} onChange={(event) => setRemovePhotos(event.target.checked ? [...removePhotos, photo.filename] : removePhotos.filter((filename) => filename !== photo.filename))} />
                Remove photo {photo.filename.slice(0, 8)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="block text-sm font-medium">Add photos (up to five total, JPEG/PNG, 5 MB each)
        <input type="file" accept="image/jpeg,image/png" multiple onChange={choosePhotos} className="mt-2 block w-full text-sm" />
      </label>
      {files.length ? <p className="text-xs text-ink-500">{files.map((file) => file.name).join(', ')}</p> : null}
      {error ? <p role="alert" className="text-sm text-clay-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
        {entry?.photos?.length ? <button type="button" disabled={isSaving} onClick={() => setRemovePhotos(entry.photos.map((photo) => photo.filename))} className="mr-auto text-sm text-clay-700 underline">Remove all photos</button> : null}
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save memory'}</button>
      </div>
    </form>
  );
}

export default function MyTravelJournal({ limit = 4 }) {
  const { trips } = useTrips();
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorEntry, setEditorEntry] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState('');

  async function loadEntries() {
    setError('');
    setIsLoading(true);
    try {
      setEntries(await journalService.listJournalEntries());
    } catch (loadError) {
      setError(loadError.message || 'Travel journal entries could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadEntries(); }, []);

  async function saveEntry(fields, files, removePhotos) {
    const normalizedFields = { ...fields, tripId: fields.tripId || null };
    if (editorEntry) {
      await journalService.updateJournalEntry(editorEntry._id, normalizedFields, files, removePhotos);
    } else {
      await journalService.createJournalEntry(normalizedFields, files);
    }
    await loadEntries();
    setEditorEntry(null);
    setIsCreating(false);
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Delete the memory for "${entry.placeName}"? This action cannot be undone.`)) return;
    setActionError('');
    try {
      await journalService.deleteJournalEntry(entry._id);
      await loadEntries();
    } catch (deleteError) {
      setActionError(deleteError.message || 'The journal entry could not be deleted.');
    }
  }

  const shownEntries = limit == null ? entries : entries.slice(0, limit);
  const drawerOpen = isCreating || Boolean(editorEntry);

  return (
    <section aria-labelledby="travel-journal-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Saved memories</p>
          <h2 id="travel-journal-title" className="font-display text-3xl font-semibold">My travel journal</h2>
        </div>
        <Link to="/journal" className="text-sm font-semibold text-ocean-700 underline underline-offset-4">View all</Link>
      </div>
      {actionError ? <p role="alert" className="text-sm text-clay-700">{actionError}</p> : null}
      {error ? (
        <div className="border border-clay-300 bg-clay-100/50 p-4 text-sm text-ink">
          <p role="alert">{error}</p>
          <button type="button" onClick={loadEntries} className="mt-2 font-semibold underline">Try again</button>
        </div>
      ) : null}
      {isLoading ? (
        <div role="status" aria-label="Loading journal entries" className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => <div key={item} className="journal-sheet h-64 animate-pulse bg-stone-100" />)}
        </div>
      ) : (
        <>
          {!entries.length ? <EmptyState title="No journal entries yet" description="Save a place, photo, or note from a trip." /> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shownEntries.map((entry) => (
              <div key={entry._id} className="relative">
                <JournalTile entry={entry} onEdit={(selected) => { setIsCreating(false); setEditorEntry(selected); }} />
                <button type="button" onClick={() => deleteEntry(entry)} className="absolute bottom-4 right-4 rounded bg-stone-50 px-2 py-1 text-xs text-clay-700 shadow-paper">Delete</button>
              </div>
            ))}
            <button type="button" onClick={() => { setEditorEntry(null); setIsCreating(true); }} className="flex min-h-64 flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 bg-stone-50/50 p-6 text-center hover:border-ocean">
              <span aria-hidden="true" className="text-3xl text-ocean-700">＋</span>
              <span className="font-display text-xl font-semibold">Add Memory</span>
              <span className="text-sm text-ink-500">Save your photos, notes and experiences</span>
            </button>
          </div>
        </>
      )}
      <ProfileDrawer isOpen={drawerOpen} onClose={() => { setIsCreating(false); setEditorEntry(null); }} title={editorEntry ? 'Edit memory' : 'Add a travel memory'}>
        {drawerOpen ? (
          <JournalEditor
            key={editorEntry?._id || 'new-memory'}
            entry={editorEntry}
            trips={trips}
            onClose={() => { setIsCreating(false); setEditorEntry(null); }}
            onSubmit={saveEntry}
          />
        ) : null}
      </ProfileDrawer>
    </section>
  );
}
