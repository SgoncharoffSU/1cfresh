'use client';

import { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { API, apiFetch } from '@/lib/api';
import { ApiDocFull } from '@/components/dashboard/InvoicePanel';
import { Button } from '@/components/ui/button';

interface FormEntry {
  key:             string;
  label:           string;
  url:             string;
  defaultChecked:  boolean;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'Счёт', SALE: 'Реализация', FACTURA: 'Счёт-фактура', CONTRACT: 'Договор',
};

/** Every print form applicable to one document, by its 1C doc type. КС-2/КС-3
 * need manual fields (see ActPrintModal) so they're deliberately not offered
 * here — batch print is a one-click action with no per-form input. */
function formsForDoc(doc: ApiDocFull, clientId: string): FormEntry[] {
  if (doc.type === 'INVOICE') {
    return [{ key: `invoice-${doc.id}`, label: 'Счёт', url: API.documents.print(clientId, doc.id), defaultChecked: true }];
  }
  if (doc.type === 'SALE') {
    return [
      { key: `upd-${doc.id}`,        label: 'УПД',                     url: API.documents.upd(clientId, doc.id),        defaultChecked: true },
      { key: `act-${doc.id}`,        label: 'Акт об оказании услуг',   url: API.documents.serviceAct(clientId, doc.id), defaultChecked: false },
      { key: `naklad-${doc.id}`,     label: 'Накладная',               url: API.documents.nakladnaya(clientId, doc.id), defaultChecked: false },
      { key: `torg12-${doc.id}`,     label: 'ТОРГ-12',                 url: API.documents.torg12(clientId, doc.id),     defaultChecked: false },
    ];
  }
  if (doc.type === 'FACTURA') {
    return [{ key: `sf-${doc.id}`, label: 'Счёт-фактура', url: API.documents.schetFaktura(clientId, doc.id), defaultChecked: false }];
  }
  return [];
}

interface Props {
  clientId:  string;
  chainDocs: ApiDocFull[];   // clicked doc + its basis parent + its children, deduped
  triggerDocId: string;      // which doc in chainDocs the menu was opened from
  onClose:   () => void;
}

export function BatchPrintModal({ clientId, chainDocs, triggerDocId, onClose }: Props) {
  const entries = chainDocs.flatMap((doc) =>
    formsForDoc(doc, clientId).map((f) => ({
      ...f,
      // Disambiguate which document a form belongs to when it's not the one the
      // menu was opened from (e.g. printing a счёт's own related реализация forms).
      label: doc.id === triggerDocId ? f.label : `${f.label} (${DOC_TYPE_LABEL[doc.type] ?? doc.type} №${doc.number})`,
    })),
  );

  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(entries.map((e) => [e.key, e.defaultChecked])),
  );
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  function toggle(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handlePrint() {
    const selected = entries.filter((e) => checked[e.key]);
    if (selected.length === 0) return;
    setPrinting(true);
    setError('');
    try {
      for (const entry of selected) {
        const res = await apiFetch(entry.url);
        if (!res.ok) { setError(`Не удалось сформировать: ${entry.label}`); continue; }
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html' });
        window.open(URL.createObjectURL(blob), '_blank');
      }
      onClose();
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                      w-full max-w-sm bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-sm font-bold text-slate-900">Пакетная печать</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-2 overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет доступных форм для печати</p>
          ) : entries.map((e) => (
            <label key={e.key} className="flex items-center gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input type="checkbox" checked={!!checked[e.key]} onChange={() => toggle(e.key)}
                className="h-3.5 w-3.5 rounded border-slate-300" />
              {e.label}
            </label>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={printing || entries.every((e) => !checked[e.key])}
            className="w-full flex items-center justify-center gap-2"
          >
            <Printer className="h-3.5 w-3.5" />
            {printing ? 'Формируем…' : 'Распечатать выбранное'}
          </Button>
        </div>
      </div>
    </>
  );
}
