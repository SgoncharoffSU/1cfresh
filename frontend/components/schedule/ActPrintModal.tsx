'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Loader2, AlertCircle } from 'lucide-react';
import { API, apiFetch } from '@/lib/api';

interface Props {
  clientId: string;
  refKey:   string;
  docNumber: string;
  kind:     'ks2' | 'ks3';
  onClose:  () => void;
}

interface Profile {
  podryadchik_address: string;
  podryadchik_phone:   string;
  podryadchik_okpo:    string;
  zakazchik_address:   string;
  zakazchik_phone:     string;
  zakazchik_okpo:      string;
  investor_name:       string;
  investor_address:    string;
  investor_okpo:       string;
  stroika_name:        string;
  okdp:                string;
}

const EMPTY_PROFILE: Profile = {
  podryadchik_address: '', podryadchik_phone: '', podryadchik_okpo: '',
  zakazchik_address: '', zakazchik_phone: '', zakazchik_okpo: '',
  investor_name: '', investor_address: '', investor_okpo: '',
  stroika_name: '', okdp: '',
};

const TITLE: Record<Props['kind'], string> = {
  ks2: 'Печать КС-2 — Акт о приёмке выполненных работ',
  ks3: 'Печать КС-3 — Справка о стоимости выполненных работ',
};

export function ActPrintModal({ clientId, refKey, docNumber, kind, onClose }: Props) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [objectName,     setObjectName]     = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [contractDate,   setContractDate]   = useState('');
  const [periodFrom,     setPeriodFrom]     = useState('');
  const [periodTo,       setPeriodTo]       = useState('');
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(API.actForms.profile(clientId))
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setProfile({ ...EMPTY_PROFILE, ...data }); })
      .finally(() => setLoading(false));
  }, [clientId]);

  function set<K extends keyof Profile>(key: K, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function handlePrint(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPrinting(true);
    try {
      await apiFetch(API.actForms.profile(clientId), {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      const url = kind === 'ks2'
        ? API.actForms.ks2(clientId, refKey, { object: objectName, contractNumber, contractDate, periodFrom, periodTo })
        : API.actForms.ks3(clientId, refKey, { object: objectName, contractNumber, contractDate, periodFrom, periodTo });
      const res = await apiFetch(url);
      if (!res.ok) { setError('Не удалось сформировать документ'); return; }
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      onClose();
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setPrinting(false);
    }
  }

  const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-[11px] font-medium text-slate-600 mb-0.5";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                      w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{TITLE[kind]}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">На основании реализации №{docNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handlePrint} className="p-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">По этому акту</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className={labelCls}>Объект</label>
                  <input className={inputCls} value={objectName} onChange={(e) => setObjectName(e.target.value)} placeholder="Наименование объекта" />
                </div>
                <div>
                  <label className={labelCls}>Договор №</label>
                  <input className={inputCls} value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Договор от</label>
                  <input className={inputCls} type="text" placeholder="дд.мм.гггг" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Период с</label>
                  <input className={inputCls} type="text" placeholder="дд.мм.гггг" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Период по</label>
                  <input className={inputCls} type="text" placeholder="дд.мм.гггг" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div>
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Постоянные реквизиты клиента <span className="font-normal normal-case text-slate-400">— заполняются один раз</span>
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className={labelCls}>Подрядчик — адрес/телефон</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={`${inputCls} col-span-2`} value={profile.podryadchik_address} onChange={(e) => set('podryadchik_address', e.target.value)} placeholder="Адрес" />
                    <input className={inputCls} value={profile.podryadchik_phone} onChange={(e) => set('podryadchik_phone', e.target.value)} placeholder="Телефон" />
                  </div>
                  <input className={`${inputCls} mt-2 w-32`} value={profile.podryadchik_okpo} onChange={(e) => set('podryadchik_okpo', e.target.value)} placeholder="ОКПО" />
                </div>
                <div>
                  <label className={labelCls}>Заказчик — адрес/телефон</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={`${inputCls} col-span-2`} value={profile.zakazchik_address} onChange={(e) => set('zakazchik_address', e.target.value)} placeholder="Адрес" />
                    <input className={inputCls} value={profile.zakazchik_phone} onChange={(e) => set('zakazchik_phone', e.target.value)} placeholder="Телефон" />
                  </div>
                  <input className={`${inputCls} mt-2 w-32`} value={profile.zakazchik_okpo} onChange={(e) => set('zakazchik_okpo', e.target.value)} placeholder="ОКПО" />
                </div>
                <div>
                  <label className={labelCls}>Инвестор (необязательно)</label>
                  <input className={`${inputCls} mb-2`} value={profile.investor_name} onChange={(e) => set('investor_name', e.target.value)} placeholder="Наименование" />
                  <div className="grid grid-cols-3 gap-2">
                    <input className={`${inputCls} col-span-2`} value={profile.investor_address} onChange={(e) => set('investor_address', e.target.value)} placeholder="Адрес" />
                    <input className={inputCls} value={profile.investor_okpo} onChange={(e) => set('investor_okpo', e.target.value)} placeholder="ОКПО" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Стройка</label>
                  <input className={inputCls} value={profile.stroika_name} onChange={(e) => set('stroika_name', e.target.value)} placeholder="Наименование, адрес" />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={printing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {printing ? 'Формируем…' : 'Сохранить и распечатать'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
