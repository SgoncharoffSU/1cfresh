import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (amount: number, currency = 'RUB') =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export const formatDate = (d: Date | string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

export const formatTime = (d: Date | string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(d));

export const formatDateTime = (d: Date | string) => `${formatDate(d)} ${formatTime(d)}`;

export const isOverdue = (dueDate?: Date | string) =>
  dueDate ? new Date(dueDate) < new Date() : false;

/** Firm's user-facing account number — offsets the internal firm.id so displayed
 * numbers start at 1001 instead of 1, without touching the real primary key. */
export const accountNumber = (firmId: number | string) => Number(firmId) + 1000;
