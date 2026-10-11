import { useMemo, useState } from 'react';
import api from '../../../services/api';
import { BUDGET_CATEGORIES } from '../../../config/budgetCategories';

const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Net banking', 'Other'];

export default function ReportDialog({ tripId, budget, onClose }) {
  const [type, setType] = useState('full');
  const [personId, setPersonId] = useState('');
  const [category, setCategory] = useState('food');
  const [day, setDay] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const days = useMemo(() => Array.from({ length: budget.tripDays }, (_, index) => index + 1), [budget.tripDays]);

  async function download(event) {
    event.preventDefault();
    if (from && to && from > to) {
      setError('The start date must be on or before the end date.');
      return;
    }
    setIsLoading(true);
    setError('');
    const params = {
      type,
      ...(type === 'person' && personId ? { personId } : {}),
      ...(type === 'category' ? { category } : {}),
      ...(type === 'day' && day ? { day } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
    };
    try {
      const expenseParams = {
        ...(params.personId ? { personId: params.personId } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.day ? { day: params.day } : {}),
        ...(params.from ? { from: params.from } : {}),
        ...(params.to ? { to: params.to } : {}),
        ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
      };
      const expenseResponse = await api.get(`/trips/${tripId}/expenses`, { params: expenseParams });
      if (!expenseResponse.data.data.length && type !== 'person') {
        setError('No expenses match these filters. Adjust the filters before generating the report.');
        return;
      }
      if (!expenseResponse.data.data.length && type === 'person') {
        const settlementResponse = await api.get(`/trips/${tripId}/settlements`);
        const matchesSettlement = settlementResponse.data.data.some((settlement) => (
          (!params.personId || String(settlement.fromMember) === params.personId || String(settlement.toMember) === params.personId)
          && (!params.from || settlement.date >= params.from)
          && (!params.to || settlement.date <= params.to)
          && (!params.paymentMethod || settlement.method === params.paymentMethod)
        ));
        if (!matchesSettlement) {
          setError('No expenses or settlements match this person and the selected filters.');
          return;
        }
      }
      const response = await api.get(`/trips/${tripId}/expenses/report.pdf`, {
        params,
        responseType: 'blob',
      });
      const filenameMatch = response.headers['content-disposition']?.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] || 'trip_budget_report.pdf';
      const fileUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = fileUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3" onMouseDown={(event) => event.target === event.currentTarget && !isLoading && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div><h2 id="report-dialog-title" className="text-lg font-semibold text-ink">Download budget report</h2><p className="mt-1 text-sm text-ink-500">The server generates a PDF from the trip expense ledger.</p></div>
          <button type="button" disabled={isLoading} onClick={onClose} aria-label="Close report dialog" className="rounded-md px-2 py-1 text-ink-500 hover:bg-stone-100 disabled:opacity-50">✕</button>
        </header>
        <form onSubmit={download} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-ink">Report type
            <select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
              <option value="full">Full trip</option><option value="person">Per person</option><option value="category">Per category</option><option value="day">Per day</option>
            </select>
          </label>
          {type === 'person' && <label className="block text-sm font-medium text-ink">Person
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
              <option value="">Everyone</option>{budget.perPerson.map((person) => <option key={person.memberId} value={person.memberId}>{person.name}</option>)}
            </select>
          </label>}
          {type === 'category' && <label className="block text-sm font-medium text-ink">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
              {BUDGET_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>}
          {type === 'day' && <label className="block text-sm font-medium text-ink">Trip day
            <select value={day} onChange={(event) => setDay(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
              <option value="">All days</option><option value="before">Before trip</option>{days.map((item) => <option key={item} value={item}>Day {item}</option>)}<option value="after">After trip</option>
            </select>
          </label>}
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Optional date range</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-ink-500">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-ink" /></label>
              <label className="text-xs text-ink-500">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-ink" /></label>
            </div>
          </div>
          <label className="block text-sm font-medium text-ink">Payment method
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
              <option value="">All methods</option>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          {error && <p role="alert" className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={isLoading} onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isLoading} className="btn-primary disabled:opacity-50">{isLoading ? 'Generating…' : 'Download PDF'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
