/**
 * ИП Гончаров Сергей Юрьевич
 *
 * ИНН ИП (физ. лицо / ИП) — 12 знаков.
 * Структура: RRNN NNNNNN CC
 *   RR = код региона (50 = Московская обл.)
 *   NN = номер ИФНС (21)
 *   NNNNNN = порядковый номер
 *   CC = 2 контрольные цифры (рассчитаны по алгоритму ФНС)
 * Результат: 502111111105 — проходит официальную проверку.
 *
 * Для сравнения форматы других форм:
 *   ООО / ЗАО / АО  — 10 знаков (пример: 7700000001)
 *   Госучреждение   — 10 знаков, начинается на 77/78/...
 *   ИП / ФЛ         — 12 знаков (данный случай)
 *   ОГРНИП          — 15 знаков (ЮЛ = 13 знаков)
 */

export const REAL_CLIENT = {
  id:         'goncharov-sg',
  inn:        '502111111105',       // 12 знаков — ИП/ФЛ
  ogrnip:     '324502100012345',    // 15 знаков — ОГРНИП
  name:       'ИП Гончаров Сергей Юрьевич',
  shortName:  'Гончаров С.Ю.',
  initials:   'ГС',
  phone:      '+7 (916) 000-11-11',
  email:      'goncharovsergey494@gmail.com',
  region:     'Московская обл., г. Одинцово',
  bankBik:    '044525225',          // Сбербанк
  bankName:   'ПАО Сбербанк',
  checkingAcc:'40802810038000000001',
} as const;

export const ACCOUNTANT = {
  name:     'Иванова Анна Сергеевна',
  shortName:'Иванова А.С.',
  initials: 'ИА',
  login:    'accountant',
  password: 'Buhg2024!',
} as const;

export const TEST_CREDENTIALS = [
  {
    role:     'Бухгалтер',
    name:     ACCOUNTANT.name,
    login:    ACCOUNTANT.login,
    password: ACCOUNTANT.password,
    inn:      '',
    hint:     'Рабочее место бухгалтера — чат, задачи, реестр',
  },
] as const;
