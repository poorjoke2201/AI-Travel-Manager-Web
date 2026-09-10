import { useEffect, useState } from 'react';
import api from '../../services/api';

const CATEGORIES = ['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous'];

export default function BudgetSection({ tripId }) {
  const [budget, setBudget] = useState(null);
  const [form, setForm] = useState({ amount: '', category: 'food', description: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'UPI' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function loadBudget() {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/trips/${tripId}/budget`);
      setBudget(data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadBudget(); }, [tripId]);

  async function addExpense(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await api.post(`/trips/${tripId}/expenses`, { ...form, amount: Number(form.amount) });
      setForm((current) => ({ ...current, amount: '', description: '' }));
      await loadBudget();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeExpense(expenseId) {
    try {
      await api.delete(`/expenses/${expenseId}`);
      await loadBudget();
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
        <h2 className="mb-4 text-lg font-semibold">Add expense</h2>
        <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
          <input required type="number" min="0.01" step="0.01" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2">{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" />
          <input placeholder="Payment method" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2" />
          <input required placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-md border border-stone-300 px-3 py-2 sm:col-span-2" />
          <button disabled={isSaving} className="btn-primary sm:col-span-2">{isSaving ? 'Adding...' : 'Add expense'}</button>
        </form>
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Recent expenses</h2>
        {budget.expenses.length ? <div className="space-y-2">{budget.expenses.map((expense) => <div key={expense._id} className="flex items-center justify-between border-b border-stone-200 py-2 text-sm"><span>{expense.description}<span className="ml-2 text-xs capitalize text-ink-400">{expense.category}</span></span><span className="flex items-center gap-3"><strong>₹{expense.amount.toLocaleString()}</strong><button type="button" onClick={() => removeExpense(expense._id)} className="text-xs text-clay hover:underline">Delete</button></span></div>)}</div> : <p className="text-sm text-ink-500">No actual expenses recorded yet.</p>}
      </section>
    </div>
  );
}

function BudgetStat({ label, value, tone }) {
  return <div className="card"><p className="text-sm text-ink-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === 'critical' ? 'text-clay' : tone === 'warning' ? 'text-marigold-600' : 'text-ink'}`}>₹{value.toLocaleString()}</p></div>;
}
