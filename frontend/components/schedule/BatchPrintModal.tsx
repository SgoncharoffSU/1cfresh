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
  const [copies, setCopies] = useState<Record<string, number>>(
    () => Object.fromEntries(entries.map((e) => [e.key, 1])),
  );
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  function toggle(key: string) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setCopyCount(key: string, n: number) {
    setCopies((prev) => ({ ...prev, [key]: Math.min(20, Math.max(1, n || 1)) }));
  }

  async function handlePrint() {
    const selected = entries.filter((e) => checked[e.key]);
    if (selected.length === 0) return;
    setPrinting(true);
    setError('');
    // Single print window, opened synchronously (before any await) so it still
    // counts as part of this click's user gesture and isn't popup-blocked.
    const win = window.open('', 'batch-print');
    if (!win) { setError('Не удалось открыть окно печати — разрешите всплывающие окна'); setPrinting(false); return; }
    win.document.open();
    win.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Пакетная печать</title>' +
      '<style>html,body{margin:0;padding:0;}.doc-page{page-break-after:always;}' +
      '.doc-page:last-child{page-break-after:auto;}</style></head><body></body></html>',
    );
    win.document.close();
    try {
      const parser = new DOMParser();
      let any = false;
      for (const entry of selected) {
        const res = await apiFetch(entry.url);
        if (!res.ok) { setError(`Не удалось сформировать: ${entry.label}`); continue; }
        const html = await res.text();
        // Parse into <head>/<body> and mount each copy in its own shadow root:
        // content flows inline (no iframe borders/scrollbars — literally "one
        // document after another"), while the form's own <style> stays scoped
        // to its shadow tree so different forms' identically-named CSS classes
        // (.title, .items, .sign-block, …) can't bleed into each other.
        const parsed = parser.parseFromString(html, 'text/html');
        const styleHtml = parsed.head.innerHTML;
        const bodyHtml = parsed.body.innerHTML;
        const n = copies[entry.key] ?? 1;
        for (let i = 0; i < n; i++) {
          const host = win.document.createElement('div');
          host.className = 'doc-page';
          win.document.body.appendChild(host);
          const shadow = host.attachShadow({ mode: 'open' });
          shadow.innerHTML = styleHtml + bodyHtml;
          any = true;
        }
      }
      if (any) setTimeout(() => win.print(), 150);
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
            <div key={e.key} className="flex items-center justify-between gap-2 text-xs text-slate-700 py-1">
              <label className="flex items-center gap-2 cursor-pointer min-w-0">
                <input type="checkbox" checked={!!checked[e.key]} onChange={() => toggle(e.key)}
                  className="h-3.5 w-3.5 rounded border-slate-300 flex-shrink-0" />
                <span className="truncate">{e.label}</span>
              </label>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] text-slate-400">копий</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={copies[e.key] ?? 1}
                  disabled={!checked[e.key]}
                  onChange={(ev) => setCopyCount(e.key, parseInt(ev.target.value, 10))}
                  className="w-12 text-xs border border-slate-200 rounded px-1 py-0.5 text-center disabled:opacity-40 disabled:bg-slate-50"
                />
              </div>
            </div>
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
