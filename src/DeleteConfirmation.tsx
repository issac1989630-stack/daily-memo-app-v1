import { useState } from 'react';

export default function DeleteConfirmation({ description, onConfirm, onClose }: {
  description: string;
  onConfirm: (pin: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-emerald-950/60 backdrop-blur-sm p-4">
    <form role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      if (pin !== '2026') { setError('密碼不正確，請重新輸入。'); setPin(''); return; }
      setBusy(true); setError('');
      try { await onConfirm(pin); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '未能刪除，資料仍保留，請重試。'); setPin(''); }
      finally { setBusy(false); }
    }}>
      <h2 id="delete-confirm-title" className="text-xl font-black text-emerald-900">家長／老師確認刪除</h2>
      <p className="mt-3 text-slate-600">{description}</p>
      <label className="block mt-5 font-bold text-slate-700">確認密碼<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} required autoFocus disabled={busy} value={pin} onChange={event => { setPin(event.target.value); setError(''); }} className="mt-2 w-full rounded-xl border-2 border-emerald-100 p-3 text-slate-800" /></label>
      {error && <p role="alert" className="mt-3 font-bold text-red-600">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-full bg-slate-100 px-4 py-3 font-bold text-slate-600">取消</button>
        <button type="submit" disabled={busy || pin.length !== 4} className="rounded-full bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-40">{busy ? '處理中…' : '確認刪除'}</button>
      </div>
    </form>
  </div>;
}
