// ─── Enums ───────────────────────────────────────────────────────────────────

export type IntegrationKey =
  | 'TG'
  | 'MAX'
  | 'VK'
  | 'INTERNAL_CHAT'
  | '1C'
  | 'MOYSKLAD'
  | 'B24'
  | 'DIADOC'
  | 'PORTAL';

export type DocumentStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'REJECTED' | 'OVERDUE';
export type DocumentType   = 'INVOICE' | 'ACT' | 'UPD' | 'CONTRACT' | 'BILL';
export type TaskPriority   = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus     = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type UserRole       = 'ACCOUNTANT' | 'CLIENT' | 'ADMIN';

// ─── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id:         string;
  name:       string;
  email:      string;
  role:       UserRole;
  avatarUrl?: string;
  companyId:  string;
  createdAt:  Date;
}

export interface Counterparty {
  id:           string;
  name:         string;
  inn:          string;
  kpp?:         string;
  email?:       string;
  phone?:       string;
  diadocBoxId?: string;
  companyId:    string;
}

export interface DocumentRegistry {
  id:             string;
  number:         string;
  type:           DocumentType;
  status:         DocumentStatus;
  is_posted:      boolean;
  deletion_mark:  boolean;
  sent_via:       string | null;
  counterpartyId: string;
  counterparty:   Counterparty;
  amount:         number;
  currency:       string;
  date:           Date;
  dueDate?:       Date;
  onecGuid?:      string;
  pdfUrl?:        string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface Integration {
  key:        IntegrationKey;
  label:      string;
  icon:       string;
  enabled:    boolean;
  connected:  boolean;
  config?:    Record<string, string>;
}

export interface ChatMessage {
  id:            string;
  channel:       IntegrationKey;
  senderId:      string;
  senderName:    string;
  senderAvatar?: string;
  text:          string;
  attachments?:  string[];
  timestamp:     Date;
  read:          boolean;
  clientId?:     string;
  tgChatId?:     number | string;
  username?:     string;
  done?:         boolean;
  doneAt?:       string;
}

export interface Task {
  id:               string;
  title:            string;
  description?:     string;
  priority:         TaskPriority;
  status:           TaskStatus;
  assigneeId?:      string;
  assignee?:        User;
  clientId?:        string;
  counterpartyId?:  string;
  dueDate?:         Date;
  sourceMessageIds?: string[];
  quotedText?:      string;
  createdAt:        Date;
  updatedAt:        Date;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export type WidgetKey = 'stats' | 'documents' | 'integrations';

export interface WidgetVisibility {
  stats:        boolean;
  documents:    boolean;
  integrations: boolean;
}
