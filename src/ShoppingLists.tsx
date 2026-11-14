import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ShoppingCart, MapPin, Pencil, Trash2, X, Lock } from 'lucide-react';
import { supabase } from './lib/supabase';

interface ShoppingItem { id: string; text: string; is_completed: boolean }
interface ShoppingList {
  id: string; location: string; shopping_date: string; items: ShoppingItem[]; updated_at: string;
}
interface Draft { id: string | null; location: string; date: string; items: ShoppingItem[]; version: string | null; requestId: string }
const newItem = (): ShoppingItem => ({ id: crypto.randomUUID(), text: '', is_completed: false });
const accessStorageKey = 'memo.shopping.read-access.v1';
const inputStyle = 'w-full min-w-0 rounded-xl border-2 border-emerald-100 bg-white p-3 text-base text-slate-800 outline-none focus:border-emerald-400';

function errorText(message: string) {
  if (message.includes('PIN_INCORRECT')) return '密碼不正確，請重新輸入。';
  if (message.includes('LIST_CHANGED')) return '這張清單剛被更新。請返回清單，再開啟修改，避免覆蓋最新進度。';
  if (message.includes('LIST_NOT_FOUND')) return '找不到這張清單，可能已被刪除。';
  return '未能儲存，請檢查連線後再試。';
}

export default function ShoppingLists({ selectedDate, onDateChange }: { selectedDate: string; onDateChange: (date: string) => void }) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const accessToken = useRef('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmation, setConfirmation] = useState<'SAVE' | ShoppingList | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const pending = useRef(new Set<string>());

  const reload = useCallback(async () => {
    if (!accessToken.current) { setLoading(false); return; }
    const { data, error: readError } = await supabase.rpc('memo_get_shopping_lists_with_access', { p_access_token: accessToken.current });
    if (readError) setError('未能讀取購物清單，請稍後重試。');
    else { setLists((data || []) as ShoppingList[]); setError(''); }
    setLoading(false);
  }, []);

  useEffect(() => {
    try { accessToken.current = localStorage.getItem(accessStorageKey) || ''; } catch { /* This browser may disable local storage. */ }
    void reload();
    const refresh = () => { if (document.visibilityState === 'visible') void reload(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reload]);

  function openDraft(list?: ShoppingList) {
    setError('');
    setDraft(list ? { id: list.id, location: list.location, date: list.shopping_date, items: list.items.map(item => ({ ...item })), version: list.updated_at, requestId: list.id }
      : { id: null, location: '', date: selectedDate, items: [newItem()], version: null, requestId: crypto.randomUUID() });
  }

  function requestSave(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.location.trim() || !draft.date || !draft.items.length || draft.items.some(item => !item.text.trim())) {
      setError('請填寫地點、日期和每件貨物的名稱。'); return;
    }
    setPin(''); setPinError(''); setConfirmation('SAVE');
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !confirmation) return;
    setSaving(true); setPinError('');
    try {
      if (confirmation === 'SAVE' && draft) {
        const { data, error: saveError } = await supabase.rpc('memo_save_shopping_list_with_access', {
          p_id: draft.id || draft.requestId, p_location: draft.location.trim(), p_date: draft.date,
          p_items: draft.items.map(item => ({ ...item, text: item.text.trim() })), p_pin: pin,
          p_expected_updated_at: draft.version, p_access_token: accessToken.current || null,
        });
        if (saveError) { setPinError(errorText(saveError.message)); return; }
        const saved = data as { list: ShoppingList; access_token: string };
        accessToken.current = saved.access_token;
        try { localStorage.setItem(accessStorageKey, saved.access_token); } catch { /* Keep access in memory for this visit. */ }
        const result = saved.list;
        setLists(previous => [...previous.filter(list => list.id !== result.id), result]);
        onDateChange(result.shopping_date); setDraft(null);
      } else if (confirmation !== 'SAVE') {
        const { error: deleteError } = await supabase.rpc('memo_delete_shopping_list', {
          p_id: confirmation.id, p_pin: pin, p_expected_updated_at: confirmation.updated_at,
        });
        if (deleteError) { setPinError(errorText(deleteError.message)); return; }
        setLists(previous => previous.filter(list => list.id !== confirmation.id));
      }
      setConfirmation(null); void reload();
    } catch { setPinError('連線中斷，資料仍保留，請再試一次。'); }
    finally { setPin(''); setSaving(false); }
  }

  async function toggleItem(list: ShoppingList, item: ShoppingItem) {
    if (pending.current.has(list.id)) return;
    pending.current.add(list.id); setBusyIds([...pending.current]); setError('');
    try {
      const { data, error: updateError } = await supabase.rpc('memo_set_shopping_item_with_access', {
        p_id: list.id, p_item_id: item.id, p_completed: !item.is_completed, p_access_token: accessToken.current,
      });
      if (updateError) setError('未能更新打剔狀態，請再試一次。');
      else setLists(previous => previous.map(row => row.id === list.id ? data as ShoppingList : row));
    } catch { setError('連線中斷，打剔狀態未儲存，請再試一次。'); }
    finally { pending.current.delete(list.id); setBusyIds([...pending.current]); }
  }


  return (
    <section className="px-4 sm:px-0 pb-12" aria-label="購物清單">
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700 font-bold">{error}<button onClick={() => { void reload(); }} className="ml-3 underline">重新讀取</button></div>}
      {draft ? (
        <form onSubmit={requestSave} className="mx-auto max-w-xl rounded-3xl bg-white p-5 sm:p-7 shadow-sm border border-emerald-100">
          <h2 className="text-xl font-black text-emerald-900 mb-5">{draft.id ? '修改購物清單' : '新增購物清單'}</h2>
          <label className="block font-bold text-slate-700 mb-4">地點<input className={inputStyle + ' mt-2'} required maxLength={120} placeholder="例如：超級市場" value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
          <label className="block font-bold text-slate-700 mb-4">購物日期<input type="date" className={inputStyle + ' mt-2'} required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
          <p className="font-bold text-slate-700 mb-2">要買的貨物</p>
          <div className="space-y-3">
            {draft.items.map((item, index) => <div key={item.id} className="flex gap-2 items-center">
              <input aria-label={'第 ' + (index + 1) + ' 件貨物'} className={inputStyle} required maxLength={200} placeholder={'第 ' + (index + 1) + ' 件貨物'} value={item.text} onChange={event => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, text: event.target.value } : row) })} />
              <button type="button" aria-label={'刪除第 ' + (index + 1) + ' 件貨物'} disabled={draft.items.length === 1} className="p-3 text-slate-400 hover:text-red-600 disabled:opacity-20" onClick={() => setDraft({ ...draft, items: draft.items.filter(row => row.id !== item.id) })}><X className="w-5 h-5" /></button>
            </div>)}
          </div>
          <button type="button" disabled={draft.items.length >= 50} onClick={() => setDraft({ ...draft, items: [...draft.items, newItem()] })} className="mt-4 flex items-center gap-2 px-3 py-3 font-bold text-emerald-700 disabled:opacity-40"><Plus className="w-5 h-5" />加一件貨物</button>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => { setDraft(null); setError(''); }} className="rounded-full px-5 py-3 bg-slate-100 font-bold text-slate-600">返回</button>
            <button type="submit" className="rounded-full px-5 py-3 bg-emerald-600 font-black text-white flex items-center gap-2"><Lock className="w-4 h-4" />儲存清單</button>
          </div>
        </form>
      ) : <>
        <div className="flex justify-between items-center gap-3 mb-5"><h2 className="text-lg font-black text-emerald-900">我的購物清單</h2><button onClick={() => openDraft()} className="rounded-full bg-emerald-600 text-white px-4 py-3 flex items-center gap-2 font-bold"><Plus className="w-5 h-5" />新增清單</button></div>
        {loading ? <p className="p-8 text-center text-slate-500">正在讀取購物清單…</p> : lists.filter(list => list.shopping_date === selectedDate).length === 0 ? <div className="p-10 text-center rounded-3xl border-2 border-dashed border-emerald-200"><ShoppingCart className="w-10 h-10 text-emerald-400 mx-auto mb-3" /><p className="font-bold text-emerald-800">這一天還沒有購物清單</p><p className="text-sm text-slate-500 mt-2">新增地點和貨物，準備一起出發。</p></div> : <div className="grid gap-4 md:grid-cols-2">
          {lists.filter(list => list.shopping_date === selectedDate).map(list => {
            const completed = list.items.filter(item => item.is_completed).length;
            return <article key={list.id} className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-xl font-black text-emerald-900 break-words"><MapPin className="w-5 h-5 shrink-0" />{list.location}</h3>
              <p className="mt-2 text-sm font-bold text-slate-500">{list.shopping_date} · {completed === list.items.length ? '全部買齊！' : '已購買 ' + completed + ' / ' + list.items.length + ' 件'}</p>
              <div className="mt-4 divide-y divide-slate-100">{list.items.map(item => <label key={item.id} className="flex items-center gap-3 py-4 cursor-pointer">
                <input type="checkbox" checked={item.is_completed} disabled={busyIds.includes(list.id)} onChange={() => { void toggleItem(list, item); }} className="w-6 h-6 shrink-0 accent-emerald-600 disabled:opacity-40" />
                <span className={'font-bold break-words min-w-0 ' + (item.is_completed ? 'line-through text-slate-400' : 'text-slate-800')}>{item.text}</span>
              </label>)}</div>
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 mt-3 pt-3">
                <button disabled={busyIds.includes(list.id)} onClick={() => openDraft(list)} className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-emerald-700"><Pencil className="w-4 h-4" />修改</button>
                <button disabled={busyIds.includes(list.id)} onClick={() => { setPin(''); setPinError(''); setConfirmation(list); }} className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-red-500"><Trash2 className="w-4 h-4" />刪除</button>
              </div>
            </article>;
          })}
        </div>}
      </>}
      {confirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/60 backdrop-blur-sm p-4">
        <form onSubmit={confirm} role="dialog" aria-modal="true" aria-labelledby="shopping-confirm-title" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
          <h2 id="shopping-confirm-title" className="text-xl font-black text-emerald-900">家長／老師確認</h2>
          <p className="mt-3 text-slate-600">{confirmation === 'SAVE' ? '請輸入密碼，確認儲存這張購物清單。' : '請輸入密碼，確認刪除「' + confirmation.location + '」的購物清單。'}</p>
          <label className="block mt-5 font-bold text-slate-700">確認密碼<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} required autoFocus disabled={saving} value={pin} onChange={event => { setPin(event.target.value); setPinError(''); }} className={inputStyle + ' mt-2'} /></label>
          {pinError && <p role="alert" className="text-red-600 font-bold mt-3">{pinError}</p>}
          <div className="flex gap-3 mt-6"><button type="button" disabled={saving} onClick={() => { setConfirmation(null); setPin(''); setPinError(''); }} className="px-4 py-3 rounded-full bg-slate-100 text-slate-600 font-bold">返回修改</button><button type="submit" disabled={saving || pin.length !== 4} className="px-4 py-3 rounded-full bg-emerald-600 text-white font-bold disabled:opacity-40">{saving ? '儲存中…' : confirmation === 'SAVE' ? '確認儲存' : '確認刪除'}</button></div>
        </form>
      </div>}
    </section>
  );
}
