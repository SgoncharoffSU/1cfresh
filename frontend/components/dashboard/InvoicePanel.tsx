'use client';

import { useState } from 'react';
import { X, User, MessageSquare, Package, CalendarClock, Printer, CheckCircle2, Circle, Trash2, Mail, Send } from 'lucide-react';
import { API } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { ScheduleModal, DocSchedule } from '@/components/schedule/ScheduleModal';
import { SendNowModal } from '@/components/schedule/SendNowModal';
import { ActPrintModal } from '@/components/schedule/ActPrintModal';
import { TelegramIcon } from '@/components/icons/TelegramIcon';

export interface ApiDocItem {
  line_number: string;
  description: string;
  quantity:    number;
  price:       number;
  amount:      number;
  vat_rate:    string;
  vat_amount:  number;
}

export interface ApiDocFull {
  id:           string;
  type:         string;
  number:       string;
  date:         string | null;
  amount:       number;
  currency:     string;
  status:       string;
  is_posted:     boolean;
  deletion_mark: boolean;
  sent_via:      string | null;
  counterparty: { id: string; name: string; inn: string };
  synced_at:    string;
  items:        ApiDocItem[];
  comment:      string;
}

interface Props {
  doc:      ApiDocFull | null;
  clientId: string;
  onClose:  () => void;
  onScheduleCreated?: (s: DocSchedule) => void;
}

const CHANNEL_ICON: Record<string, JSX.Element> = {
  TG:    <TelegramIcon className="h-3 w-3" />,
  EMAIL: <Mail className="h-3 w-3" />,
};
const VAT_LABEL: Record<string, string> = {
  'БезНДС':    'Без НДС',
  'НДС0':      '0%',
  'НДС10':     '10%',
  'НДС18':     '18%',
  'НДС20':     '20%',
  'НДС10/110': '10/110',
  'НДС18/118': '18/118',
  'НДС20/120': '20/120',
};

export function InvoicePanel({ doc, clientId, onClose, onScheduleCreated }: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendNowOpen,  setSendNowOpen]  = useState(false);
  const [actPrintKind, setActPrintKind] = useState<'ks2' | 'ks3' | null>(null);
  if (!doc) return null;

  const docDate  = doc.date ? new Date(doc.date) : null;
  const syncedAt = new Date(doc.synced_at);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 z-40"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-white z-50 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900">
                {doc.type === 'INVOICE' ? 'Счёт на оплату' : 'Реализация'} №{doc.number}
              </h2>
              {/* Помечен на удаление */}
              {doc.deletion_mark && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-600">
                  <Trash2 className="h-3 w-3" /> Помечен на удаление
                </span>
              )}
              {/* Проведён / Не проведён */}
              {!doc.deletion_mark && (doc.is_posted ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Проведён
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                  <Circle className="h-3 w-3" /> Не проведён
                </span>
              ))}
              {/* Канал отправки */}
              {doc.sent_via && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700">
                  {CHANNEL_ICON[doc.sent_via] ?? null} Отправлен
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {docDate
                ? docDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'Дата не указана'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0 ml-4"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Counterparty */}
          <section className="rounded-lg border border-slate-100 p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Контрагент
            </p>
            <div className="flex items-start gap-2.5">
              <div className="h-8 w-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{doc.counterparty.name || '—'}</p>
                {doc.counterparty.inn
                  ? <p className="text-xs text-muted-foreground">ИНН: {doc.counterparty.inn}</p>
                  : <p className="text-xs text-muted-foreground">ИНН не указан</p>
                }
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60">
                  {doc.counterparty.id}
                </p>
              </div>
            </div>
          </section>

          {/* Comment */}
          {doc.comment && (
            <section className="rounded-lg border border-slate-100 p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Комментарий
              </p>
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700 leading-relaxed">{doc.comment}</p>
              </div>
            </section>
          )}

          {/* Line items */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Номенклатура · {doc.items.length}{' '}
                {doc.items.length === 1 ? 'позиция' : doc.items.length < 5 ? 'позиции' : 'позиций'}
              </p>
            </div>

            {doc.items.length > 0 ? (
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium w-6">#</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Наименование / Содержание</th>
                      <th className="text-right px-2 py-2 text-muted-foreground font-medium w-10">Кол.</th>
                      <th className="text-right px-2 py-2 text-muted-foreground font-medium w-24">Цена</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium w-24">Сумма</th>
                      <th className="text-right px-2 py-2 text-muted-foreground font-medium w-14">НДС</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {doc.items.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {item.line_number || i + 1}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">
                          <p className="line-clamp-3 leading-snug">{item.description || '—'}</p>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-muted-foreground">
                          {VAT_LABEL[item.vat_rate] ?? (item.vat_rate || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-slate-200 rounded-lg">
                Позиции не загружены
              </div>
            )}
          </section>

          {/* Total */}
          <div className="flex justify-between items-center px-4 py-3 bg-slate-900 text-white rounded-lg">
            <span className="text-sm font-medium opacity-80">Итого к оплате</span>
            <span className="text-lg font-bold tabular-nums">{formatCurrency(doc.amount)}</span>
          </div>

          {/* 1C meta */}
          <div className="text-[10px] text-muted-foreground space-y-0.5 pt-2 border-t border-slate-100">
            <p>Тип: {doc.type === 'INVOICE' ? 'Счёт на оплату покупателю' : 'Реализация товаров и услуг'}</p>
            <p>GUID в 1С: <span className="font-mono">{doc.id}</span></p>
            <p>Синхронизировано: {syncedAt.toLocaleString('ru-RU')}</p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 border-t border-slate-100 px-5 py-3 space-y-2">
          <div className="flex gap-2">
            {/* Print form */}
            <a
              href={API.documents.print(clientId, doc.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                         border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium
                         hover:bg-slate-100 hover:border-slate-300 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Печатная форма
            </a>
            {/* Send now */}
            <button
              onClick={() => setSendNowOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                         border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium
                         hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
            >
              <Send className="h-4 w-4" />
              Отправить
            </button>
            {/* Schedule */}
            <button
              onClick={() => setScheduleOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                         border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium
                         hover:bg-blue-100 hover:border-blue-300 transition-colors"
            >
              <CalendarClock className="h-4 w-4" />
              Расписание
            </button>
          </div>
          {doc.type === 'SALE' && (
            <div className="flex gap-2">
              <button
                onClick={() => setActPrintKind('ks2')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                           border border-slate-200 bg-white text-slate-700 text-sm font-medium
                           hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <Printer className="h-4 w-4" />
                КС-2
              </button>
              <button
                onClick={() => setActPrintKind('ks3')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                           border border-slate-200 bg-white text-slate-700 text-sm font-medium
                           hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <Printer className="h-4 w-4" />
                КС-3
              </button>
            </div>
          )}
        </div>
      </div>

      {actPrintKind && (
        <ActPrintModal
          clientId={clientId}
          refKey={doc.id}
          docNumber={doc.number}
          kind={actPrintKind}
          onClose={() => setActPrintKind(null)}
        />
      )}

      {scheduleOpen && (
        <ScheduleModal
          doc={doc}
          clientId={clientId}
          existing={null}
          onClose={() => setScheduleOpen(false)}
          onSaved={(s) => { onScheduleCreated?.(s); }}
        />
      )}
      {sendNowOpen && (
        <SendNowModal
          doc={doc}
          clientId={clientId}
          onClose={() => setSendNowOpen(false)}
          onSent={() => {}}
        />
      )}
    </>
  );
}
