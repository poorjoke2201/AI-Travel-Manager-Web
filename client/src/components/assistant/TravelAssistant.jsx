import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import api from '../../services/api';

const AUTH_PATHS = ['/login', '/register', '/verify-otp'];
const APP_QUICK_QUESTIONS = [
  'How do I create a trip?',
  'What can I do on the trip page?',
  'Where can I find POIs in Mysuru?',
];
const TRIP_QUICK_QUESTIONS = [
  'Summarize this trip',
  'How can I reduce the trip cost?',
  'Help me edit an itinerary activity',
];

function contextForPath(pathname) {
  if (pathname.includes('/trip/')) {
    if (pathname.includes('/itinerary')) return 'itinerary';
    if (pathname.includes('/budget')) return 'budget';
    return 'trip';
  }
  if (pathname.startsWith('/explore')) return 'explore';
  return 'app';
}

export default function TravelAssistant({ enabled = true }) {
  const location = useLocation();
  const params = useParams();
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const hidden = !enabled || location.pathname === '/' || AUTH_PATHS.includes(location.pathname);
  const contextType = useMemo(() => contextForPath(location.pathname), [location.pathname]);
  const tripId = params.id || null;

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setPendingAction(null);
  }, [tripId, contextType]);

  if (hidden) return null;

  async function sendMessage(event, contentOverride = null) {
    event?.preventDefault();
    const content = (contentOverride ?? draft).trim();
    if (!content || isSending) return;

    if (!contentOverride) setDraft('');
    setError(null);
    setMessages((current) => [...current, { role: 'user', content }]);
    setIsSending(true);
    try {
      const { data } = await api.post('/chat/message', {
        conversationId,
        tripId,
        contextType,
        message: content,
      });
      setConversationId(data.data.conversationId);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.data.message,
          sources: data.data.sources || [],
          action: data.data.action || null,
        },
      ]);
      if (data.data.action?.requiresConfirmation) setPendingAction({ ...data.data.action, tripId: tripId || null });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction?.tripId || isSending || (pendingAction.type === 'REPLACE_ITINERARY_ITEM' && !pendingAction.strategy)) return;
    setError(null);
    setIsSending(true);
    try {
      const { data } = await api.post('/chat/action', { tripId: pendingAction.tripId, action: pendingAction });
      setMessages((current) => [...current, { role: 'assistant', content: data.data.message }]);
      setPendingAction(null);
      window.dispatchEvent(new CustomEvent('travel-assistant-trip-updated', { detail: { tripId: pendingAction.tripId } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[1000]">
      {isOpen && (
        <section className="mb-3 flex h-[min(620px,calc(100vh-110px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-stone-300 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-stone-200 bg-indigo px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Travel Assistant</p>
              <p className="text-xs text-white/75">{tripId ? 'Using your current trip' : 'Ask about Travel Manager'}</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="text-xl leading-none text-white/80 hover:text-white" aria-label="Close assistant">×</button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && (
              <div className="space-y-3">
                <div className="rounded-lg bg-stone-50 p-3 text-sm text-ink-500">
                  {tripId ? 'Ask about your itinerary, transport, accommodation, or budget.' : 'Ask how to use the app or get travel-planning help.'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(tripId ? TRIP_QUICK_QUESTIONS : APP_QUICK_QUESTIONS).map((question) => (
                    <button key={question} type="button" onClick={() => sendMessage(null, question)} className="rounded-full border border-indigo/30 px-3 py-1.5 text-left text-xs text-indigo hover:bg-indigo/5">
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'ml-auto bg-indigo text-white' : 'bg-stone-100 text-ink'}`}>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.action && <p className="mt-2 border-t border-current/15 pt-2 text-xs opacity-75">Action proposed for day {message.action.day}, activity {Number(message.action.activityIndex) + 1}. Choose an option below, then confirm.</p>}
                {message.sources?.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-current/15 pt-2 text-xs opacity-75">
                    {message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block truncate underline">{source.title}</a>)}
                  </div>
                )}
              </div>
            ))}
            {isSending && <p className="text-xs text-ink-400">Thinking...</p>}
            {error && <p className="text-xs text-clay">{error}</p>}
            {pendingAction && tripId && (
              <div className="rounded-lg border border-marigold-200 bg-marigold-50 p-3 text-sm text-ink">
                <p className="font-semibold">Apply this itinerary change?</p>
                <p className="mt-1 text-xs text-ink-500">{pendingAction.type === 'REMOVE_ITINERARY_ITEM' ? 'Remove the selected activity.' : `Find a ${pendingAction.strategy || 'replacement'} alternative.`}</p>
                {pendingAction.type === 'REPLACE_ITINERARY_ITEM' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionChoice label="Nearby alternative" selected={pendingAction.strategy === 'nearby'} onClick={() => setPendingAction((current) => ({ ...current, type: 'REPLACE_ITINERARY_ITEM', strategy: 'nearby' }))} />
                    <ActionChoice label="Farther alternative" selected={pendingAction.strategy === 'farther'} onClick={() => setPendingAction((current) => ({ ...current, type: 'REPLACE_ITINERARY_ITEM', strategy: 'farther' }))} />
                    <ActionChoice label="Remove activity" selected={false} onClick={() => setPendingAction((current) => ({ ...current, type: 'REMOVE_ITINERARY_ITEM', strategy: null }))} />
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={confirmAction} disabled={isSending || (pendingAction.type === 'REPLACE_ITINERARY_ITEM' && !pendingAction.strategy)} className="btn-primary !px-3 !py-2">Confirm</button>
                  <button type="button" onClick={() => setPendingAction(null)} className="btn-secondary !px-3 !py-2">Cancel</button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t border-stone-200 p-3">
            <div className="flex gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask the assistant..." maxLength={4000} className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-indigo" />
              <button type="submit" disabled={isSending || !draft.trim()} className="btn-primary !px-3 !py-2">Send</button>
            </div>
          </form>
        </section>
      )}

      <button type="button" onClick={() => setIsOpen((current) => !current)} className="ml-auto flex items-center gap-2 rounded-full bg-indigo px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-700" aria-expanded={isOpen}>
        <span aria-hidden="true">✦</span>
        <span>{isOpen ? 'Close' : 'Travel Assistant'}</span>
      </button>
    </div>
  );
}

function ActionChoice({ label, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1.5 text-xs ${selected ? 'border-indigo bg-indigo text-white' : 'border-stone-300 bg-white text-ink hover:border-indigo'}`}>
      {label}
    </button>
  );
}
