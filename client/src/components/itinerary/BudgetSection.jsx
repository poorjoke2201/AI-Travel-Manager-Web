import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const CATEGORIES = ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'];

const EMPTY_FORM = {
  amount: '',
  category: 'food',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: 'UPI',
  payerId: '',
  participants: [],
  splitType: 'equal',
  customAmounts: {},
  percentages: {},
};

export default function BudgetSection({ tripId }) {
  const { user } = useAuth();
  const [budget, setBudget] = useState(null);
  const [trip, setTrip] = useState(null);
  const [billImage, setBillImage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const members = useMemo(() => {
    const acceptedMembers = trip?.groupMembers?.filter((member) => member.userId || member.phoneNumber) || [];
    const ownerEntry = trip?.userId ? { userId: String(trip.userId), name: user?.username || 'Trip lead', email: user?.email || null, role: 'owner', status: 'accepted' } : null;
    const baseMembers = ownerEntry ? [ownerEntry, ...acceptedMembers] : acceptedMembers;
    const unique = [];
    const seen = new Set();
    for (const member of baseMembers) {
      const key = String(member.userId || member.phoneNumber || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(member);
    }
    return unique;
  }, [trip, user?.username, user?.email]);

  async function loadTripAndBudget() {
    setIsLoading(true);
    try {
      const [tripRes, budgetRes] = await Promise.all([
        api.get(`/trips/${tripId}`),
        api.get(`/trips/${tripId}/budget`),
      ]);
      setTrip(tripRes.data.data);
      setBudget(budgetRes.data.data);
      const tripMembers = tripRes.data.data.groupMembers || [];
      const defaultPayer = String(user?._id || user?.id || tripRes.data.data.userId || tripMembers[0]?.userId || '');
      const defaultParticipants = Array.from(new Set([
        defaultPayer,
        ...(tripMembers || []).map((member) => String(member.userId || member.phoneNumber || '')).filter(Boolean),
        ...(tripRes.data.data.userId ? [String(tripRes.data.data.userId)] : []),
      ])).filter(Boolean);
      setForm((current) => ({
        ...current,
        payerId: defaultPayer || current.payerId || tripRes.data.data.userId || '',
        participants: defaultParticipants.length ? defaultParticipants : [defaultPayer || tripRes.data.data.userId || ''],
      }));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadTripAndBudget(); }, [tripId]);

  function toggleParticipant(memberId) {
    if (!memberId) return;
    const normalized = String(memberId);
    setForm((current) => {
      const exists = current.participants.includes(normalized);
      const nextParticipants = exists
        ? current.participants.filter((entry) => entry !== normalized)
        : [...current.participants, normalized];
      return { ...current, participants: nextParticipants };
    });
  }

  function updateSplitValue(memberId, value) {
    const normalized = String(memberId);
    setForm((current) => ({
      ...current,
      customAmounts: { ...current.customAmounts, [normalized]: value },
      percentages: { ...current.percentages, [normalized]: value },
    }));
  }

  function handleBillImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setBillImage(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  async function addExpense(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        splitType: form.splitType || 'equal',
        payerId: form.payerId || trip?.userId,
        participants: form.participants.length ? form.participants : [form.payerId || trip?.userId],
        customAmounts: form.splitType === 'custom' ? form.customAmounts : undefined,
        percentages: form.splitType === 'percentage' ? form.percentages : undefined,
        billImage: billImage || undefined,
      };

      await api.post(`/trips/${tripId}/expenses`, payload);
      setBillImage('');
      setForm((current) => ({ ...EMPTY_FORM, payerId: current.payerId || trip?.userId || '', participants: current.participants.length ? current.participants : [current.payerId || trip?.userId || ''] }));
      await loadTripAndBudget();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeExpense(expenseId) {
    try {
      await api.delete(`/expenses/${expenseId}`);
      await loadTripAndBudget();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) return <p className="text-sm text-ink-500">Loading budget...</p>;
  if (error && !budget) return <p className="text-sm text-clay">{error}</p>;
  if (!budget) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <BudgetStat label="Total budget" value={budget.plannedTotal} />
        <BudgetStat label="Spent" value={budget.spent} />
        <BudgetStat label="Remaining" value={budget.remaining} tone={budget.status} />
      </div>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Planned vs actual</h2>
          <span className={`text-sm font-semibold capitalize ${budget.status === 'critical' ? 'text-clay' : budget.status === 'warning' ? 'text-marigold-600' : 'text-teal'}`}>{budget.status}</span>
        </div>
        <div className="space-y-3">
          {budget.categories.map((item) => (
            <div key={item.category}>
              <div className="flex justify-between text-sm"><span className="capitalize">{item.category}</span><span>₹{item.actual.toLocaleString()} / ₹{item.planned.toLocaleString()}</span></div>
              <div className="mt-1 h-2 rounded-full bg-stone-200"><div className={`h-2 rounded-full ${item.difference < 0 ? 'bg-clay' : 'bg-teal'}`} style={{ width: `${Math.min(100, Math.max(0, item.percentageUsed))}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Add expense</h2>
          {budget.balances?.length ? <span className="text-xs text-ink-500">{budget.balances.length} balances tracked</span> : null}
        </div>

        <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
          <input required type="number" min="0.01" step="0.01" placeholder="Total amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2">{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>

          <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" />
          <select value={form.splitType} onChange={(event) => setForm({ ...form, splitType: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" aria-label="Split type">
            <option value="equal">Equal split</option>
            <option value="custom">Custom split</option>
            <option value="percentage">Percentage split</option>
          </select>

          {members.length ? (
            <>
              <select value={form.payerId} onChange={(event) => setForm({ ...form, payerId: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2">
                {members.map((member) => (
                  <option key={member.userId || member.phoneNumber} value={String(member.userId || member.phoneNumber || '')}>
                    {member.name || member.phoneNumber || 'Traveller'}
                  </option>
                ))}
              </select>

              <div className="rounded-md border border-stone-300 p-3 sm:col-span-2">
                <p className="mb-2 text-sm font-medium text-ink">Who was included in the bill?</p>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => {
                    const memberId = String(member.userId || member.phoneNumber || '');
                    const active = form.participants.includes(memberId);
                    return (
                      <button
                        key={memberId}
                        type="button"
                        onClick={() => toggleParticipant(memberId)}
                        className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-ocean bg-ocean-50 text-ocean' : 'border-stone-300 bg-white text-ink'}`}
                      >
                        {member.name || member.phoneNumber || 'Traveller'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          {form.splitType === 'custom' && form.participants.length ? (
            <div className="space-y-2 sm:col-span-2">
              {form.participants.map((memberId) => {
                const member = members.find((entry) => String(entry.userId || entry.phoneNumber || '') === memberId);
                return (
                  <div key={memberId} className="grid gap-2 sm:grid-cols-[1fr_150px]">
                    <label className="rounded-md border border-stone-300 px-3 py-2 text-sm text-ink">{member?.name || member?.phoneNumber || 'Traveller'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.customAmounts[memberId] || ''}
                      onChange={(event) => updateSplitValue(memberId, event.target.value)}
                      placeholder="₹ owed"
                      className="rounded-md border border-stone-300 px-3 py-2"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {form.splitType === 'percentage' && form.participants.length ? (
            <div className="space-y-2 sm:col-span-2">
              {form.participants.map((memberId) => {
                const member = members.find((entry) => String(entry.userId || entry.phoneNumber || '') === memberId);
                return (
                  <div key={memberId} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <label className="rounded-md border border-stone-300 px-3 py-2 text-sm text-ink">{member?.name || member?.phoneNumber || 'Traveller'}</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.percentages[memberId] || ''}
                      onChange={(event) => updateSplitValue(memberId, event.target.value)}
                      placeholder="%"
                      className="rounded-md border border-stone-300 px-3 py-2"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <input placeholder="Payment method" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2 sm:col-span-2" />
          <label className="flex flex-col gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm text-ink sm:col-span-2">
            <span>Bill photo (optional)</span>
            <input type="file" accept="image/*" onChange={handleBillImageChange} className="text-xs" />
          </label>
          {billImage ? <img src={billImage} alt="Uploaded bill" className="h-24 w-full rounded-md object-cover sm:col-span-2" /> : null}
          <input required placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2 sm:col-span-2" />
          <button disabled={isSaving} className="btn-primary sm:col-span-2">{isSaving ? 'Adding...' : 'Add expense'}</button>
        </form>
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
      </section>

      {budget.balances?.length ? (
        <section className="card">
          <h2 className="mb-4 text-lg font-semibold">Settlements</h2>
          <div className="space-y-2">
            {budget.balances.map((entry) => (
              <div key={entry.userId} className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <span>{entry.name}</span>
                <span className={Number(entry.net) > 0 ? 'text-teal' : 'text-clay'}>
                  {Number(entry.net) > 0 ? `gets ₹${Math.abs(entry.net).toLocaleString()}` : `owes ₹${Math.abs(entry.net).toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Recent expenses</h2>
        {budget.expenses.length ? <div className="space-y-3">{budget.expenses.map((expense) => (
          <div key={expense._id} className="flex items-start justify-between gap-3 border-b border-stone-200 py-2 text-sm">
            <div className="space-y-1">
              <div><span>{expense.description}</span><span className="ml-2 text-xs capitalize text-ink-400">{expense.category}</span></div>
              {expense.billImage ? <img src={expense.billImage} alt="Bill receipt" className="mt-2 h-20 w-32 rounded-md object-cover" /> : null}
            </div>
            <span className="flex items-center gap-3"><strong>₹{expense.amount.toLocaleString()}</strong><button type="button" onClick={() => removeExpense(expense._id)} className="text-xs text-clay hover:underline">Delete</button></span>
          </div>
        ))}</div> : <p className="text-sm text-ink-500">No actual expenses recorded yet.</p>}
      </section>
    </div>
  );
}

function BudgetStat({ label, value, tone }) {
  return <div className="card"><p className="text-sm text-ink-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === 'critical' ? 'text-clay' : tone === 'warning' ? 'text-marigold-600' : 'text-ink'}`}>₹{value.toLocaleString()}</p></div>;
}
