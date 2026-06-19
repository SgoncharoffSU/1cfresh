import { ChatMessage } from '@/types';
import { REAL_CLIENT } from '@/constants/client';

export const SEED_MESSAGES: ChatMessage[] = [
  { id:'m1', channel:'TG',            senderId:'u2', senderName:'Алексей К.', text:'Добрый день! Когда будет готов акт за май?',             timestamp:new Date('2024-06-10T09:12:00'), read:true,  clientId:'cl1' },
  { id:'m2', channel:'TG',            senderId:'u1', senderName:'Бухгалтер',  text:'Готовим, отправим сегодня до 17:00.',                    timestamp:new Date('2024-06-10T09:15:00'), read:true,  clientId:'cl1' },
  { id:'m3', channel:'INTERNAL_CHAT', senderId:'u3', senderName:'Мария П.',   text:'Нужно подписать договор с АО Техснаб, срок — сегодня.', timestamp:new Date('2024-06-10T10:03:00'), read:false, clientId:'cl2' },
  { id:'m4', channel:'VK',            senderId:'u4', senderName:'Дмитрий Р.', text:'Пришёл запрос на УПД по счёту СЧ-2024-001.',            timestamp:new Date('2024-06-10T10:45:00'), read:false, clientId:'cl3' },
  { id:'m5', channel:'TG',            senderId:'u2', senderName:'Алексей К.', text:'Также уточните сумму НДС в счёте за апрель.',            timestamp:new Date('2024-06-10T11:00:00'), read:false, clientId:'cl1' },
  { id:'m6', channel:'INTERNAL_CHAT', senderId:'u3', senderName:'Мария П.',   text:'Диадок: не проходит подпись на ДОГ-2024-003.',           timestamp:new Date('2024-06-10T11:20:00'), read:false, clientId:'cl2' },
  { id:'m7', channel:'TG',            senderId:'u5', senderName:'Сергей В.',  text:'Счёт выставлен, жду подтверждения оплаты.',              timestamp:new Date('2024-06-10T12:10:00'), read:false, clientId:'cl4' },
  { id:'m8', channel:'VK',            senderId:'u4', senderName:'Дмитрий Р.', text:'Когда поступят деньги по акту АКТ-2024-041?',           timestamp:new Date('2024-06-10T12:35:00'), read:false, clientId:'cl3' },
];

export const REAL_MESSAGES: ChatMessage[] = [
  {
    id: 'tg-real-1', channel: 'TG', senderId: REAL_CLIENT.id,
    senderName: REAL_CLIENT.shortName, clientId: REAL_CLIENT.id,
    text: 'Добрый день! Подключился через Telegram. Как выставить счёт клиенту?',
    timestamp: new Date('2024-06-14T10:00:00'), read: false,
  },
];
