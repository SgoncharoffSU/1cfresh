'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Loader2, AlertCircle } from 'lucide-react';
import { API, apiFetch, ActFormFields, EMPTY_ACT_FORM_FIELDS } from '@/lib/api';

interface Props {
  clientId: string;
  refKey:   string;
  docNumber: string;
  kind:     'ks2' | 'ks3';
  onClose:  () => void;
}

// Maps ActFormFields keys -> backend field_name, for fields that get pick-from-history
// suggestions. Период (periodFrom/periodTo) is intentionally excluded — a date range is
// unique to each act, remembering it wouldn't be useful.
const HISTORY_FIELDS: Partial<Record<keyof ActFormFields, string>> = {
  objectName: 'object_name',
  contractNumber: 'contract_number',
  contractDate: 'contract_date',
  stroikaName: 'stroika_name',
  podryadchikAddress: 'podryadchik_address',
  podryadchikPhone: 'podryadchik_phone',
  podryadchikOkpo: 'podryadchik_okpo',
  zakazchikAddress: 'zakazchik_address',
  zakazchikPhone: 'zakazchik_phone',
  zakazchikOkpo: 'zakazchik_okpo',
  investorName: 'investor_name',
  investorAddress: 'investor_address',
  investorOkpo: 'investor_okpo',
  okdp: 'okdp',
};

const TITLE: Record<Props['kind'], string> = {
  ks2: 'Печать КС-2 — Акт о приёмке выполненных работ',
  ks3: 'Печать КС-3 — Справка о стоимости выполненных работ',
};

const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-[11px] font-medium text-slate-600 mb-0.5";

/** Print form fields store dates as "дд.мм.гггг" (that's what gets embedded verbatim into
 * the printed HTML), but a native <input type="date"> calendar picker needs ISO "гггг-мм-дд".
 * These convert between the two so the picker works without changing the stored/sent format. */
function ruToIso(ru: string): string {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
function isoToRu(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Text input with a native pick-from-history dropdown (datalist) — type freely or pick a
 * previously used value; new values get remembered server-side once the form is printed.
 * Defined outside ActPrintModal (not as an inline closure) so its identity is stable across
 * renders — an inline component here would remount the <input> on every keystroke and drop
 * focus. */
function HistoryInput({ listId, value, onChange, options, placeholder, className }: {
  listId: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; className?: string;
}) {
  return (
    <>
      <input
        className={className ?? inputCls}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((v) => <option key={v} value={v} />)}
        </datalist>
      )}
    </>
  );
}

export function ActPrintModal({ clientId, refKey, docNumber, kind, onClose }: Props) {
  const [fields, setFields]       = useState<ActFormFields>(EMPTY_ACT_FORM_FIELDS);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [loading, setLoading]     = useState(true);
  const [printing, setPrinting]   = useState(false);
  const [error, setError]         = useState('');
  const [contractFrom1c, setContractFrom1c] = useState(false);

  useEffect(() => {
    const backendNames = Object.values(HISTORY_FIELDS) as string[];
    Promise.all([
      apiFetch(API.actForms.fieldValues(clientId, backendNames)).then((r) => r.ok ? r.json() : {}),
      apiFetch(API.actForms.prefill(clientId, refKey)).then((r) => r.ok ? r.json() : {}),
    ])
      .then(([values, prefill]: [Record<string, string[]>, { contract_number?: string; contract_date?: string }]) => {
        setSuggestions(values);
        setFields((prev) => {
          const next = { ...prev };
          // Pre-fill each field with its most-recently-used value, still fully editable.
          (Object.keys(HISTORY_FIELDS) as (keyof ActFormFields)[]).forEach((key) => {
            const backendName = HISTORY_FIELDS[key]!;
            const first = values[backendName]?.[0];
            if (first) next[key] = first;
          });
          // Договор from 1C (if this document is linked to one) is authoritative —
          // overrides whatever history suggested.
          if (prefill.contract_number) next.contractNumber = prefill.contract_number;
          if (prefill.contract_date)   next.contractDate   = prefill.contract_date;
          return next;
        });
        setContractFrom1c(!!(prefill.contract_number || prefill.contract_date));
      })
      .finally(() => setLoading(false));
  }, [clientId, refKey]);

  function set<K extends keyof ActFormFields>(key: K, value: string) {
    setFields((p) => ({ ...p, [key]: value }));
  }

  async function handlePrint(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPrinting(true);
    try {
      const url = kind === 'ks2'
        ? API.actForms.ks2(clientId, refKey, fields)
        : API.actForms.ks3(clientId, refKey, fields);
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

  /** Bind a remembered field to the shared HistoryInput, resolving its suggestion list. */
  function bound(field: keyof ActFormFields, placeholder?: string, className?: string) {
    const backendName = HISTORY_FIELDS[field];
    const options = backendName ? suggestions[backendName] ?? [] : [];
    return (
      <HistoryInput
        listId={`dl-${field}`}
        value={fields[field]}
        onChange={(v) => set(field, v)}
        options={options}
        placeholder={placeholder}
        className={className}
      />
    );
  }

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
            <p className="text-[11px] text-slate-400 -mt-1">
              Поля ниже начните вводить — появятся ранее использованные варианты для этого клиента.
            </p>

            <div>
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">По этому акту</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className={labelCls}>Объект</label>
                  {bound('objectName', 'Наименование объекта')}
                </div>
                <div>
                  <label className={labelCls}>
                    Договор №{contractFrom1c && <span className="text-emerald-600 normal-case font-normal ml-1">· из 1С</span>}
                  </label>
                  {bound('contractNumber')}
                </div>
                <div>
                  <label className={labelCls}>Договор от</label>
                  {bound('contractDate', 'дд.мм.гггг')}
                </div>
                <div>
                  <label className={labelCls}>Период с</label>
                  <input className={inputCls} type="date" value={ruToIso(fields.periodFrom)} onChange={(e) => set('periodFrom', isoToRu(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Период по</label>
                  <input className={inputCls} type="date" value={ruToIso(fields.periodTo)} onChange={(e) => set('periodTo', isoToRu(e.target.value))} />
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div>
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Реквизиты клиента <span className="font-normal normal-case text-slate-400">— запоминаются, в следующий раз можно выбрать</span>
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className={labelCls}>Подрядчик — адрес/телефон</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">{bound('podryadchikAddress', 'Адрес')}</div>
                    {bound('podryadchikPhone', 'Телефон')}
                  </div>
                  <div className="w-32 mt-2">{bound('podryadchikOkpo', 'ОКПО')}</div>
                </div>
                <div>
                  <label className={labelCls}>Заказчик — адрес/телефон</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">{bound('zakazchikAddress', 'Адрес')}</div>
                    {bound('zakazchikPhone', 'Телефон')}
                  </div>
                  <div className="w-32 mt-2">{bound('zakazchikOkpo', 'ОКПО')}</div>
                </div>
                <div>
                  <label className={labelCls}>Инвестор (необязательно)</label>
                  <div className="mb-2">{bound('investorName', 'Наименование')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">{bound('investorAddress', 'Адрес')}</div>
                    {bound('investorOkpo', 'ОКПО')}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Стройка</label>
                  {bound('stroikaName', 'Наименование, адрес')}
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
              {printing ? 'Формируем…' : 'Распечатать'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
