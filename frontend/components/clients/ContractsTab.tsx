'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch, API } from '@/lib/api';
import { ChevronDown, ChevronUp, RefreshCw, Trash2, Save, Plus, X, Mail } from 'lucide-react';
import { TelegramIcon } from '@/components/icons/TelegramIcon';

// ── types ──────────────────────────────────────────────────────────────────────

interface ContractSchedule {
  id: number;
  doc_type_target: string;  // 'all' | 'INVOICE' | 'SALE' | 'FACTURA'
  basis_doc_type: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'minutes';
  week_day: number | null;
  month_day: string | null;
  create_invoice: boolean;
  create_sale: boolean;
  create_factura: boolean;
  month_in_nomenclature: boolean;
  delivery_channel: string | null;
  delivery_address: string | null;
  custom_fields: string[] | null;
  items: { description: string; qty: number; price: number; vat: string }[] | null;
  template_invoice_ref: string | null;
  is_active: boolean;
  next_run: string | null;
  last_run: string | null;
  run_count: number;
  error_count: number;
  last_error: string | null;
}

interface Contract {
  ref_key: string;
  name: string;
  counterparty_key: string;
  counterparty_name: string;
  counterparty_inn: string;
  amount: number;
  date_start: string | null;
  deletion_mark: boolean;
  synced_at: string;
  raw_fields: Record<string, unknown>;
  schedules: ContractSchedule[];
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('ru-RU'); } catch { return s; }
}

function fmtAmount(n: number): string {
  return n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
}

const WEEK_DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FIELD_BLACKLIST = ['Ref_Key', '@odata.etag', 'DataVersion'];
const isRawKey = (k: string) => !FIELD_BLACKLIST.includes(k) && !k.endsWith('_Type');

// ── nomenclature ───────────────────────────────────────────────────────────────

interface NomItem {
  description: string;
  qty: number;
  price: number;
  vat: string;
  nomenclature_key?: string;
  periodicity?: string;
}

interface CatalogItem {
  key: string;
  name: string;
  price: number;
  vat: string;
  nomenclature_key: string | null;
  periodicity?: string;
}

const DEFAULT_VAT_OPTIONS = ['БезНДС', 'НДС20', 'НДС22', 'НДС10', 'НДС0'];

function NomenclatureSection({
  clientId,
  items,
  onChange,
}: {
  clientId: string;
  items: NomItem[];
  onChange: (items: NomItem[]) => void;
}) {
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [search,  setSearch]    = useState('');
  const [loading, setLoading]   = useState(false);
  const [open,    setOpen]      = useState(false);

  // Load catalog once on mount
  useEffect(() => {
    setLoading(true);
    apiFetch(API.contracts.nomenclature(clientId))
      .then(r => r.ok ? r.json() : [])
      .then(data => { setCatalog(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  const filtered = search.length > 0
    ? catalog.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : catalog;

  // Динамический список ставок НДС из каталога 1С
  const vatOptions = useMemo(() => {
    const fromCatalog = catalog.map(c => c.vat).filter(Boolean);
    const fromItems   = items.map(i => i.vat).filter(Boolean);
    const unique = Array.from(new Set([...DEFAULT_VAT_OPTIONS, ...fromCatalog, ...fromItems]));
    return unique;
  }, [catalog, items]);

  function addItem(c: CatalogItem) {
    // Don't add duplicate by key
    if (items.some(it => (it.nomenclature_key ?? it.description) === (c.nomenclature_key ?? c.name))) return;
    onChange([...items, { description: c.name, qty: 1, price: c.price, vat: c.vat, nomenclature_key: c.nomenclature_key ?? undefined, periodicity: c.periodicity }]);
    setSearch('');
    setOpen(false);
  }

  function update(i: number, field: keyof NomItem, val: string | number) {
    onChange(items.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  const total = items.reduce((s, r) => s + r.qty * r.price, 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-medium">Номенклатура из 1С:</p>

      {/* Search / picker */}
      <div className="relative">
        <div className="flex gap-1">
          <input
            value={search}
            onFocus={() => setOpen(true)}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            placeholder={loading ? 'Загрузка…' : 'Поиск по справочнику 1С…'}
            className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => { setSearch(''); setOpen(false); }}
              className="text-gray-400 hover:text-gray-600 px-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && filtered.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-0.5 border rounded bg-white shadow-lg max-h-48 overflow-y-auto">
            {filtered.slice(0, 50).map(c => (
              <button key={c.key} onClick={() => addItem(c)}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-800">{c.name}</span>
                <span className="ml-2 text-gray-400">{c.price > 0 ? `${c.price.toLocaleString('ru-RU')} ₽` : ''} {c.vat}</span>
              </button>
            ))}
          </div>
        )}
        {open && search && filtered.length === 0 && !loading && (
          <div className="absolute z-20 left-0 right-0 mt-0.5 border rounded bg-white shadow text-xs text-gray-400 px-2 py-2">
            Не найдено
          </div>
        )}
      </div>

      {/* Selected items table */}
      {items.length > 0 && (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1 font-medium text-gray-500">Наименование</th>
                <th className="text-right px-2 py-1 font-medium text-gray-500 w-14">Кол.</th>
                <th className="text-right px-2 py-1 font-medium text-gray-500 w-20">Цена</th>
                <th className="text-right px-2 py-1 font-medium text-gray-500 w-20">Сумма</th>
                <th className="px-2 py-1 w-16 font-medium text-gray-500">НДС</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-gray-700 truncate max-w-[140px]" title={row.description}>
                    {row.description}
                  </td>
                  <td className="px-1 py-0.5">
                    <input type="number" min="0.001" step="any" value={row.qty}
                      onChange={e => update(i, 'qty', parseFloat(e.target.value) || 1)}
                      className="w-full text-right border-0 bg-transparent focus:ring-0 outline-none text-xs" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input type="number" min="0" step="any" value={row.price}
                      onChange={e => update(i, 'price', parseFloat(e.target.value) || 0)}
                      className="w-full text-right border-0 bg-transparent focus:ring-0 outline-none text-xs" />
                  </td>
                  <td className="px-2 py-0.5 text-right text-gray-600">
                    {(row.qty * row.price).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-1 py-0.5">
                    <select value={row.vat} onChange={e => update(i, 'vat', e.target.value)}
                      className="w-full border-0 bg-transparent text-xs focus:ring-0 outline-none">
                      {vatOptions.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-0.5 text-center">
                    <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end px-2 py-1 bg-gray-50 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Итого: {total.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── schedule form helpers ──────────────────────────────────────────────────────

interface ScheduleForm {
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'minutes';
  week_day: number;   // для weekly: 0-6; для minutes: интервал в минутах
  month_day: string;
  create_invoice: boolean;
  create_sale: boolean;
  create_factura: boolean;
  month_in_nomenclature: boolean;
  delivery_channel: string;
  delivery_address: string;
  is_active: boolean;
  nomItems: NomItem[];
}

function defaultForm(s?: ContractSchedule | null): ScheduleForm {
  const nomItems: NomItem[] = s?.items?.map(it => ({
    description:      it.description ?? '',
    qty:              it.qty ?? 1,
    price:            it.price ?? 0,
    vat:              it.vat ?? 'БезНДС',
    nomenclature_key: (it as any).nomenclature_key ?? undefined,
  })) ?? [];

  return {
    frequency:             ((s?.frequency ?? 'monthly') as ScheduleForm['frequency']),
    week_day:              s?.week_day ?? 5,
    month_day:             s?.month_day ?? '1',
    create_invoice:        s?.create_invoice ?? true,
    create_sale:           s?.create_sale ?? false,
    create_factura:        s?.create_factura ?? false,
    month_in_nomenclature: s?.month_in_nomenclature ?? false,
    delivery_channel:      s?.delivery_channel ?? '',
    delivery_address:      s?.delivery_address ?? '',
    is_active:             s?.is_active ?? true,
    nomItems,
  };
}

// ── mini schedule form ─────────────────────────────────────────────────────────

function ScheduleForm({
  form,
  onChange,
}: {
  form: ScheduleForm;
  onChange: (f: ScheduleForm) => void;
}) {
  function set<K extends keyof ScheduleForm>(k: K, v: ScheduleForm[K]) {
    onChange({ ...form, [k]: v });
  }

  return (
    <div className="space-y-2">
      {/* Frequency */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          ['monthly',  'Ежемесячно'],
          ['weekly',   'Еженедельно'],
          ['quarterly','Ежеквартально'],
          ['minutes',  '⏱ Каждые N мин'],
        ] as [ScheduleForm['frequency'], string][]).map(([f, label]) => (
          <button key={f} onClick={() => set('frequency', f)}
            className={`px-2.5 py-0.5 rounded text-xs border ${form.frequency === f
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Day / interval picker */}
      {form.frequency === 'minutes' ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Интервал:</span>
          {[1, 2, 5, 10, 15, 30, 60].map(m => (
            <button key={m} onClick={() => set('week_day', m)}
              className={`px-2 py-0.5 rounded text-xs border ${form.week_day === m
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-300'}`}>
              {m} мин
            </button>
          ))}
        </div>
      ) : form.frequency === 'weekly' ? (
        <div className="flex gap-1 flex-wrap">
          {WEEK_DAY_NAMES.map((d, i) => (
            <button key={i} onClick={() => set('week_day', i)}
              className={`w-7 h-7 rounded text-xs border ${form.week_day === i
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300'}`}>
              {d}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-gray-500">Число:</span>
          {(['first', ...Array.from({ length: 28 }, (_, i) => String(i + 1)), 'last']).map((v) => (
            <button key={v} onClick={() => set('month_day', v)}
              className={`min-w-[26px] h-6 px-1 rounded text-xs border ${form.month_day === v
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300'}`}>
              {v === 'first' ? 'Нач' : v === 'last' ? 'Кон' : v}
            </button>
          ))}
        </div>
      )}

      {/* Delivery */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="text-xs text-gray-500">Отправить:</span>
        {(['', 'EMAIL', 'TG', 'EDO'] as const).map((ch) => (
          <button key={ch} onClick={() => set('delivery_channel', ch)}
            className={`px-2 py-0.5 rounded text-xs border flex items-center gap-1 ${form.delivery_channel === ch
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300'}`}>
            {ch === 'EMAIL' ? <Mail className="h-3.5 w-3.5" /> : ch === 'TG' ? <TelegramIcon className="h-3.5 w-3.5" /> : ch === 'EDO' ? 'ЭДО' : 'Нет'}
          </button>
        ))}
        {form.delivery_channel && (
          <input value={form.delivery_address}
            onChange={e => set('delivery_address', e.target.value)}
            className="border rounded px-2 py-0.5 text-xs flex-1 min-w-[140px]"
            placeholder={form.delivery_channel === 'TG' ? 'chat_id / @username' : 'email@example.com'} />
        )}
      </div>
    </div>
  );
}

// ── unified schedule panel ─────────────────────────────────────────────────────

function UnifiedScheduleSection({
  clientId,
  contract,
  schedule,
  onSaved,
}: {
  clientId: string;
  contract: Contract;
  schedule: ContractSchedule | null;
  onSaved: (s: ContractSchedule | null) => void;
}) {
  const [form, setForm] = useState<ScheduleForm>(() => defaultForm(schedule));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        frequency: form.frequency,
        month_day: form.month_day,
        create_invoice: form.create_invoice,
        create_sale: form.create_sale,
        create_factura: form.create_factura,
        month_in_nomenclature: form.month_in_nomenclature,
        delivery_channel: form.delivery_channel || null,
        delivery_address: form.delivery_address || null,
        is_active: form.is_active,
        basis_doc_type: 'CONTRACT',
        doc_type_target: 'all',
        items:                 form.nomItems.length > 0 ? form.nomItems : null,
        template_invoice_ref:  null,
      };
      if (form.frequency === 'weekly' || form.frequency === 'minutes') body.week_day = form.week_day;
      const r = await apiFetch(API.contracts.upsertSchedule(clientId, contract.ref_key, 'all', 'CONTRACT'), {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const saved: ContractSchedule = await r.json();
      onSaved(saved);
      setMsg('Сохранено');
    } catch (e: unknown) {
      setMsg('Ошибка: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  async function del() {
    if (!schedule) return;
    if (!confirm('Удалить расписание?')) return;
    await apiFetch(API.contracts.deleteSchedule(clientId, contract.ref_key, 'all'), { method: 'DELETE' });
    onSaved(null);
    setForm(defaultForm(null));
    setMsg('Удалено');
  }

  return (
    <div className="space-y-3">
      {/* What to create */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Создавать:</p>
        <div className="flex gap-4 flex-wrap items-center">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="checkbox" checked={!!form.create_invoice}
              onChange={e => setForm(f => ({
                ...f,
                create_invoice: e.target.checked,
                // снять зависимые если счёт отключён
                create_sale:    e.target.checked ? f.create_sale    : false,
                create_factura: e.target.checked ? f.create_factura : false,
              }))}
              className="h-4 w-4 rounded" />
            Счёт
          </label>

          {form.create_invoice && (
            <>
              <span className="text-gray-300 text-xs">→</span>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={!!form.create_sale}
                  onChange={e => setForm(f => ({
                    ...f,
                    create_sale: e.target.checked,
                    create_factura: e.target.checked ? f.create_factura : false,
                  }))}
                  className="h-4 w-4 rounded" />
                Реализацию
              </label>

              {form.create_sale && (
                <>
                  <span className="text-gray-300 text-xs">→</span>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!form.create_factura}
                      onChange={e => setForm(f => ({ ...f, create_factura: e.target.checked }))}
                      className="h-4 w-4 rounded" />
                    Счёт-фактуру
                  </label>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <NomenclatureSection
        clientId={clientId}
        items={form.nomItems}
        onChange={it => setForm(f => ({ ...f, nomItems: it }))}
      />

      <ScheduleForm form={form} onChange={setForm} />

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={form.is_active}
          onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
          className="h-4 w-4 rounded" />
        Активно
      </label>

      {schedule && (
        <div className="text-xs text-gray-400 space-y-0.5">
          {schedule.next_run && <p>Следующий: {fmtDate(schedule.next_run)}</p>}
          {schedule.last_run && <p>Последний: {fmtDate(schedule.last_run)} (×{schedule.run_count})</p>}
          {schedule.error_count > 0 && <p className="text-red-500">Ошибок: {schedule.error_count} — {schedule.last_error}</p>}
        </div>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {schedule && (
          <button onClick={del}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">
            <Trash2 className="h-3.5 w-3.5" /> Удалить
          </button>
        )}
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}

// ── per-type schedule section ─────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Счёт',
  SALE: 'Реализация',
  FACTURA: 'Счёт-фактура',
};

function TypeScheduleSection({
  clientId,
  contract,
  docType,
  schedule,
  onSaved,
}: {
  clientId: string;
  contract: Contract;
  docType: 'INVOICE' | 'SALE' | 'FACTURA';
  schedule: ContractSchedule | null;
  onSaved: (s: ContractSchedule | null) => void;
}) {
  const [enabled, setEnabled] = useState(!!schedule?.is_active);
  const [form, setForm] = useState<ScheduleForm>(() => defaultForm(schedule));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        frequency: form.frequency,
        month_day: form.month_day,
        create_invoice: docType === 'INVOICE',
        create_sale: docType === 'SALE',
        create_factura: docType === 'FACTURA',
        month_in_nomenclature: false,
        delivery_channel: form.delivery_channel || null,
        delivery_address: form.delivery_address || null,
        is_active: enabled,
        basis_doc_type: 'CONTRACT',
        doc_type_target: docType,
      };
      if (form.frequency === 'weekly' || form.frequency === 'minutes') body.week_day = form.week_day;
      const r = await apiFetch(API.contracts.upsertSchedule(clientId, contract.ref_key, docType, 'CONTRACT'), {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const saved: ContractSchedule = await r.json();
      onSaved(saved);
      setMsg('Сохранено');
    } catch (e: unknown) {
      setMsg('Ошибка: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  async function del() {
    if (!schedule) return;
    await apiFetch(API.contracts.deleteSchedule(clientId, contract.ref_key, docType), { method: 'DELETE' });
    onSaved(null);
    setMsg('Удалено');
  }

  return (
    <div className={`border rounded-md p-3 space-y-2 ${enabled ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50/30'}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 rounded" />
          {DOC_TYPE_LABELS[docType]}
        </label>
        {schedule && (
          <span className="text-xs text-gray-400">×{schedule.run_count} запусков</span>
        )}
      </div>

      {enabled && (
        <>
          <ScheduleForm form={form} onChange={setForm} />
          <div className="flex gap-2 items-center">
            <button onClick={save} disabled={saving}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
              {saving ? '…' : 'Сохранить'}
            </button>
            {schedule && (
              <button onClick={del} className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">
                Удалить
              </button>
            )}
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
          </div>
          {schedule?.next_run && (
            <p className="text-xs text-gray-400">Следующий: {fmtDate(schedule.next_run)}</p>
          )}
        </>
      )}
    </div>
  );
}

// ── main schedule panel ────────────────────────────────────────────────────────

function SchedulePanel({
  clientId,
  contract,
  onSaved,
}: {
  clientId: string;
  contract: Contract;
  onSaved: (schedules: ContractSchedule[]) => void;
}) {
  const unified   = contract.schedules.find(s => s.doc_type_target === 'all') ?? null;
  const perInv    = contract.schedules.find(s => s.doc_type_target === 'INVOICE') ?? null;
  const perSale   = contract.schedules.find(s => s.doc_type_target === 'SALE') ?? null;
  const perFac    = contract.schedules.find(s => s.doc_type_target === 'FACTURA') ?? null;

  const hasPerType = !!(perInv || perSale || perFac);
  const [mode, setMode] = useState<'unified' | 'separate'>(hasPerType ? 'separate' : 'unified');

  // Local copies of schedules for live updates
  const [schedules, setSchedules] = useState<ContractSchedule[]>(contract.schedules);

  function updateSchedule(docTypeTarget: string, s: ContractSchedule | null) {
    setSchedules(prev => {
      const filtered = prev.filter(x => x.doc_type_target !== docTypeTarget);
      if (s) return [...filtered, s];
      return filtered;
    });
    onSaved(s ? [...schedules.filter(x => x.doc_type_target !== docTypeTarget), s]
               : schedules.filter(x => x.doc_type_target !== docTypeTarget));
  }

  return (
    <div className="border rounded-md p-3 bg-white space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Расписание выставления</p>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button onClick={() => setMode('unified')}
          className={`px-3 py-1 rounded-full text-xs border ${mode === 'unified'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          Единое расписание
        </button>
        <button onClick={() => setMode('separate')}
          className={`px-3 py-1 rounded-full text-xs border ${mode === 'separate'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          Свои расписания
        </button>
      </div>

      {mode === 'separate' && (
        <p className="text-xs text-gray-500">
          Каждый тип документа создаётся по своему расписанию независимо.
          При создании Счёт-фактуры, если нет связанного счёта — используется договор как основание.
        </p>
      )}

      {mode === 'unified' ? (
        <UnifiedScheduleSection
          clientId={clientId}
          contract={contract}
          schedule={schedules.find(s => s.doc_type_target === 'all') ?? null}
          onSaved={s => updateSchedule('all', s)}
        />
      ) : (
        <div className="space-y-2">
          {(['INVOICE', 'SALE', 'FACTURA'] as const).map(dt => (
            <TypeScheduleSection
              key={dt}
              clientId={clientId}
              contract={contract}
              docType={dt}
              schedule={schedules.find(s => s.doc_type_target === dt) ?? null}
              onSaved={s => updateSchedule(dt, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── contract row ───────────────────────────────────────────────────────────────

function ContractRow({ clientId, contract: initial }: { clientId: string; contract: Contract }) {
  const [contract, setContract] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() =>
    initial.schedules[0]?.custom_fields ?? []
  );
  const [addingField, setAddingField] = useState(false);

  const allKeys = Object.keys(contract.raw_fields).filter(isRawKey);
  const displayKeys = visibleKeys.length > 0 ? visibleKeys.filter(k => allKeys.includes(k)) : [];

  function onSchedulesSaved(newSchedules: ContractSchedule[]) {
    setContract(c => ({ ...c, schedules: newSchedules }));
    if (newSchedules[0]?.custom_fields) setVisibleKeys(newSchedules[0].custom_fields);
  }

  async function addField(key: string) {
    const next = [...visibleKeys, key];
    setVisibleKeys(next);
    setAddingField(false);
    try {
      await apiFetch(API.contracts.updateFields(clientId, contract.ref_key), {
        method: 'PATCH', body: JSON.stringify(next),
      });
    } catch {}
  }

  async function removeField(key: string) {
    const next = visibleKeys.filter(k => k !== key);
    setVisibleKeys(next);
    try {
      await apiFetch(API.contracts.updateFields(clientId, contract.ref_key), {
        method: 'PATCH', body: JSON.stringify(next),
      });
    } catch {}
  }

  const hiddenKeys = allKeys.filter(k => !visibleKeys.includes(k));
  const hasSchedule = contract.schedules.some(s => s.is_active);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-sm truncate">{contract.name || contract.ref_key}</span>
          {hasSchedule && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
              Расписание
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {contract.amount > 0 && <span className="text-sm text-gray-600">{fmtAmount(contract.amount)}</span>}
          {contract.date_start && <span className="text-xs text-gray-400">{fmtDate(contract.date_start)}</span>}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 space-y-3 border-t">
          {/* Pinned fields */}
          {displayKeys.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {displayKeys.map(k => (
                <div key={k} className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="text-sm text-gray-800 break-all">{fmt(contract.raw_fields[k])}</p>
                  </div>
                  <button onClick={() => removeField(k)} className="text-gray-300 hover:text-gray-500 mt-0.5 shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add field */}
          {!addingField ? (
            <button onClick={() => setAddingField(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <Plus className="h-3 w-3" /> Добавить поле
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Выберите поле:</p>
              <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                {hiddenKeys.length === 0 && <p className="text-xs text-gray-400">Все поля уже добавлены</p>}
                {hiddenKeys.map(k => (
                  <button key={k} onClick={() => addField(k)} className="text-left text-sm px-2 py-0.5 hover:bg-blue-50 rounded">
                    <span className="text-gray-700">{k}</span>
                    <span className="text-gray-400 ml-2 text-xs">{fmt(contract.raw_fields[k])}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setAddingField(false)} className="self-start text-xs text-gray-400 hover:text-gray-600">Отмена</button>
            </div>
          )}

          {/* All fields toggle */}
          <button onClick={() => setShowAllFields(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            {showAllFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showAllFields ? 'Скрыть все поля 1С' : 'Все поля из 1С'}
          </button>
          {showAllFields && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-t pt-2">
              {allKeys.map(k => (
                <div key={k}>
                  <p className="text-gray-400">{k}</p>
                  <p className="text-gray-700 break-all">{fmt(contract.raw_fields[k])}</p>
                </div>
              ))}
            </div>
          )}

          {/* Schedule toggle */}
          <button onClick={() => setShowSchedule(v => !v)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            {showSchedule ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {hasSchedule ? 'Редактировать расписание' : 'Настроить расписание выставления'}
          </button>
          {showSchedule && (
            <SchedulePanel clientId={clientId} contract={contract} onSaved={onSchedulesSaved} />
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function ContractsTab({ clientId }: { clientId: string }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch(API.contracts.list(clientId));
      if (!r.ok) throw new Error(await r.text());
      setContracts(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function syncContracts() {
    setSyncing(true);
    try {
      await apiFetch(API.contracts.sync(clientId), { method: 'POST' });
      setTimeout(load, 3000);
    } catch { setSyncing(false); }
  }

  if (loading) return <p className="text-sm text-gray-400 py-6 text-center">Загрузка договоров…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {contracts.length === 0 ? 'Нет договоров' : `${contracts.length} договор(а)`}
        </p>
        <button onClick={syncContracts} disabled={syncing}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Синхронизация…' : 'Синхронизировать'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {contracts.length === 0 && !error && (
        <p className="text-sm text-gray-400 py-4 text-center">
          Договоры не найдены. Нажмите «Синхронизировать», чтобы загрузить из 1С.
        </p>
      )}

      <div className="space-y-2">
        {contracts.map(c => <ContractRow key={c.ref_key} clientId={clientId} contract={c} />)}
      </div>
    </div>
  );
}
