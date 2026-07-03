'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  CalendarClock, Users, RefreshCw, Send,
  CheckCircle2, ArrowRight, FileText,
  Zap, Shield, BarChart3, Clock, ChevronDown,
  Building2, Menu, X
} from 'lucide-react';

// ── Mini dashboard mockup ──────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Glow */}
      <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 blur-3xl rounded-3xl" />

      <div className="relative bg-white dark:bg-white/10 backdrop-blur-sm border border-slate-200 dark:border-white/20 rounded-2xl overflow-hidden shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-white/10 border-b border-slate-100 dark:border-white/10">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
          <span className="ml-3 text-slate-400 dark:text-white/50 text-xs font-mono">buhgsaas.ru/dashboard</span>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-14 bg-slate-50 dark:bg-white/5 border-r border-slate-100 dark:border-white/10 py-4 flex flex-col items-center gap-3">
            {[FileText, Users, CalendarClock, BarChart3].map((Icon, i) => (
              <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-blue-500' : 'bg-slate-200 dark:bg-white/10'}`}>
                <Icon size={14} className={i === 0 ? 'text-white' : 'text-slate-500 dark:text-white'} />
              </div>
            ))}
          </div>

          {/* Main */}
          <div className="flex-1 p-4">
            <div className="text-slate-500 dark:text-white/70 text-[10px] font-medium mb-3 uppercase tracking-wider">Документы клиентов</div>

            {/* Client rows */}
            {[
              { name: 'ООО «Альфа»', doc: 'Счёт №124', status: 'Создан', color: 'bg-green-400' },
              { name: 'ИП Морозова', doc: 'Реализация', status: 'Отправлен', color: 'bg-blue-400' },
              { name: 'ООО «Старт»', doc: 'Счёт-фактура', status: 'Проведён', color: 'bg-emerald-400' },
              { name: 'ИП Сидоров', doc: 'Счёт №98',   status: 'Создан', color: 'bg-green-400' },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-white/5">
                <div className={`w-1.5 h-1.5 rounded-full ${row.color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-800 dark:text-white text-[11px] font-medium truncate">{row.name}</div>
                  <div className="text-slate-400 dark:text-white/40 text-[10px]">{row.doc}</div>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-white/50 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">{row.status}</span>
              </div>
            ))}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: 'Счетов', value: '24' },
                { label: 'Клиентов', value: '8' },
                { label: 'За месяц', value: '₽ 186k' },
              ].map((s, i) => (
                <div key={i} className="bg-slate-100 dark:bg-white/10 rounded-lg p-2 text-center">
                  <div className="text-slate-800 dark:text-white text-sm font-bold">{s.value}</div>
                  <div className="text-slate-400 dark:text-white/40 text-[9px]">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating notification */}
      <div className="absolute -right-4 top-16 bg-white rounded-xl shadow-xl px-3 py-2 flex items-center gap-2 border border-slate-100 text-xs">
        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={12} className="text-green-600" />
        </div>
        <div>
          <div className="text-slate-800 font-semibold text-[11px]">Счёт создан</div>
          <div className="text-slate-400 text-[10px]">ООО «Альфа» · только что</div>
        </div>
      </div>

      {/* Floating schedule badge */}
      <div className="absolute -left-4 bottom-10 bg-white rounded-xl shadow-xl px-3 py-2 flex items-center gap-2 border border-slate-100">
        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
          <CalendarClock size={12} className="text-blue-600" />
        </div>
        <div>
          <div className="text-slate-800 font-semibold text-[11px]">Следующий запуск</div>
          <div className="text-slate-400 text-[10px]">1 июля · 12 счетов</div>
        </div>
      </div>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon, title, desc, accent = false
}: { icon: React.ElementType; title: string; desc: string; accent?: boolean }) {
  return (
    <div className={`relative p-6 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${accent ? 'bg-[#0f2444] border-[#1c3a5e] text-white' : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-900 dark:text-white'}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${accent ? 'bg-blue-500/20' : 'bg-slate-100 dark:bg-white/10'}`}>
        <Icon size={20} className={accent ? 'text-blue-400' : 'text-[#1c3a5e] dark:text-blue-300'} />
      </div>
      <h3 className={`text-base font-semibold mb-2 ${accent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{title}</h3>
      <p className={`text-sm leading-relaxed ${accent ? 'text-white/60' : 'text-slate-500 dark:text-white/50'}`}>{desc}</p>
    </div>
  );
}

// ── Step ──────────────────────────────────────────────────────────────────────
function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#1c3a5e] text-white text-sm font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="pt-1.5">
        <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{title}</h4>
        <p className="text-sm text-slate-500 dark:text-white/50 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const token        = useAuthStore((s) => s.token);
  const user         = useAuthStore((s) => s.user);
  const dashboardHref = user ? `/cli/${user.firmId}/dashboard` : '/login';
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled]  = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#050b16] text-slate-900 dark:text-slate-100 antialiased">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-[#050b16]/90 backdrop-blur border-b border-slate-200/60 dark:border-white/10 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <LogoIcon className="h-8 w-auto" />
            <span className="font-bold text-lg tracking-tight text-[#1c3a5e] dark:text-white transition-colors">BuhgSaaS</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-white/80 transition-colors">
            <a href="#features" className="hover:text-blue-500 transition-colors">Возможности</a>
            <a href="#how"      className="hover:text-blue-500 transition-colors">Как работает</a>
            <a href="#pricing"  className="hover:text-blue-500 transition-colors">Тарифы</a>
          </nav>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {token ? (
              <Link href={dashboardHref} className="text-sm font-semibold px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm">
                Перейти в кабинет
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-lg transition-colors text-slate-700 dark:text-white/90 hover:bg-slate-100 dark:hover:bg-white/10">
                  Войти
                </Link>
                <Link href="/register" className="text-sm font-semibold px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm">
                  Начать бесплатно
                </Link>
              </>
            )}
          </div>

          {/* Mobile: theme toggle + menu button */}
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg text-slate-700 dark:text-white">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white dark:bg-[#050b16] border-t border-slate-100 dark:border-white/10 shadow-lg">
            <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col gap-3">
              <a href="#features" onClick={() => setMenuOpen(false)} className="text-slate-600 dark:text-white/70 text-sm py-2">Возможности</a>
              <a href="#how"      onClick={() => setMenuOpen(false)} className="text-slate-600 dark:text-white/70 text-sm py-2">Как работает</a>
              <a href="#pricing"  onClick={() => setMenuOpen(false)} className="text-slate-600 dark:text-white/70 text-sm py-2">Тарифы</a>
              <hr className="border-slate-100 dark:border-white/10" />
              {token ? (
                <Link href={dashboardHref} className="text-center text-sm font-semibold text-white bg-blue-500 py-2.5 rounded-lg">Перейти в кабинет</Link>
              ) : (
                <>
                  <Link href="/login"    className="text-center text-sm font-medium text-slate-700 dark:text-white/90 py-2 border border-slate-200 dark:border-white/20 rounded-lg">Войти</Link>
                  <Link href="/register" className="text-center text-sm font-semibold text-white bg-blue-500 py-2.5 rounded-lg">Начать бесплатно</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-white via-slate-50 to-blue-50 dark:from-[#060f1e] dark:via-[#0f2444] dark:to-[#1c3a5e]">
        {/* Grid bg */}
        <div className="absolute inset-0 opacity-[0.4] dark:opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(100,116,139,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,.08) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 dark:bg-indigo-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-20 w-full">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            {/* Left: text */}
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-blue-500/10 dark:bg-blue-500/15 border border-blue-400/40 dark:border-blue-400/30 rounded-full px-4 py-1.5 text-blue-700 dark:text-blue-300 text-xs font-medium mb-8">
                <Zap size={11} className="text-blue-500 dark:text-blue-400" />
                Интеграция с 1С:Фреш через OData API
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white leading-tight mb-6">
                Бухгалтерия<br />
                для тех, кто<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-400">
                  ведёт много<br />клиентов
                </span>
              </h1>

              <p className="text-lg text-slate-600 dark:text-white/60 leading-relaxed mb-10 max-w-lg">
                Подключите облачную 1С:Фреш, автоматизируйте выставление счетов, реализаций и счёт-фактур по расписанию. Контролируйте документооборот всех клиентов в одном окне.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/register"
                  className="inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold px-7 py-3.5 rounded-xl text-base transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5">
                  Попробовать бесплатно
                  <ArrowRight size={16} />
                </Link>
                <Link href="/login"
                  className="inline-flex items-center justify-center gap-2 bg-slate-900/5 hover:bg-slate-900/10 border border-slate-200 text-slate-900 dark:bg-white/10 dark:hover:bg-white/15 dark:border-white/20 dark:text-white font-semibold px-7 py-3.5 rounded-xl text-base transition-all">
                  Войти в кабинет
                </Link>
              </div>

              {/* Trust points */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-10">
                {['15 дней бесплатно', 'Без карты', 'Поддержка 1С:Фреш'].map((t) => (
                  <div key={t} className="flex items-center gap-1.5 text-slate-500 dark:text-white/50 text-sm">
                    <CheckCircle2 size={13} className="text-green-500 dark:text-green-400" />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: mockup */}
            <div className="hidden lg:block">
              <DashboardMockup />
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-slate-400 dark:text-white/30 text-xs">
          <span>Узнать больше</span>
          <ChevronDown size={16} className="animate-bounce" />
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 dark:bg-white/5 border-y border-slate-100 dark:border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-5">
          <p className="text-center text-xs text-slate-400 dark:text-white/40 uppercase tracking-widest mb-6">Создано для специалистов, работающих с</p>
          <div className="flex flex-wrap justify-center items-center gap-10">
            {[
              '1С:Фреш (облако)',
              'Облачная бухгалтерия',
              'Аутсорсинг учёта',
              'Бухгалтерские фирмы',
            ].map((t) => (
              <div key={t} className="flex items-center gap-2 text-slate-400 dark:text-white/40 text-sm font-medium">
                <Building2 size={15} className="text-slate-300 dark:text-white/30" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-16">
          <p className="text-blue-500 text-sm font-semibold uppercase tracking-wider mb-3">Возможности</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
            Всё что нужно бухгалтеру<br />в одном месте
          </h2>
          <p className="text-slate-500 dark:text-white/50 text-lg max-w-xl mx-auto">
            BuhgSaaS — это не просто синхронизация. Это полный инструмент для ведения клиентов на 1С:Фреш.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            icon={CalendarClock}
            title="Документы по расписанию"
            desc="Настройте однажды — система сама создаёт счёт, реализацию и счёт-фактуру в нужную дату. Периодичность: ежемесячно, еженедельно, по числу."
            accent
          />
          <FeatureCard
            icon={Users}
            title="Несколько клиентов"
            desc="Все контрагенты, договоры и документы в едином кабинете. Переключайтесь между клиентами в один клик, без путаницы."
          />
          <FeatureCard
            icon={RefreshCw}
            title="Синхронизация с 1С:Фреш"
            desc="Прямое подключение через OData API. Документы создаются прямо в вашей 1С, без промежуточных шагов — они сразу в учёте."
          />
          <FeatureCard
            icon={Send}
            title="Доставка клиентам"
            desc="Автоматическая отправка документов через Telegram или Email. Клиент получает уведомление как только счёт создан."
          />
          <FeatureCard
            icon={FileText}
            title="Полный документооборот"
            desc="Счёт на оплату → Реализация → Счёт-фактура. Все три документа создаются и связываются автоматически по договору."
          />
          <FeatureCard
            icon={Shield}
            title="Безопасность данных"
            desc="Ваши учётные данные 1С хранятся зашифрованно. Доступ только через защищённые каналы. Соответствие требованиям ФЗ-152."
          />
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" className="py-24 bg-slate-50 dark:bg-white/5">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-16">
            <p className="text-blue-500 text-sm font-semibold uppercase tracking-wider mb-3">Как работает</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
              Запустите за 15 минут
            </h2>
            <p className="text-slate-500 dark:text-white/50 text-lg max-w-md mx-auto">
              Не нужно устанавливать ничего. Только браузер и доступ к 1С:Фреш.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Steps */}
            <div className="flex flex-col gap-8">
              <Step
                n="1"
                title="Зарегистрируйтесь"
                desc="Создайте аккаунт для вашей бухгалтерии. Укажите название фирмы и email. Первые 15 дней бесплатно."
              />
              <Step
                n="2"
                title="Подключите 1С:Фреш"
                desc="Введите OData-логин и пароль от вашей базы 1С:Фреш. Система подключится и синхронизирует контрагентов и договоры."
              />
              <Step
                n="3"
                title="Добавьте клиентов и расписания"
                desc="Выберите договоры из 1С, настройте номенклатуру, ставку НДС, периодичность и дату создания документов."
              />
              <Step
                n="4"
                title="Документы создаются сами"
                desc="В указанную дату система автоматически создаёт счёт, реализацию и счёт-фактуру прямо в 1С и уведомляет вас и клиента."
              />
            </div>

            {/* Timeline visual */}
            <div className="relative">
              <div className="bg-white dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-white/80">Расписание — Июнь 2026</span>
                  <span className="text-xs text-slate-400 dark:text-white/40">8 клиентов</span>
                </div>

                {[
                  { date: '1 июн', name: 'ООО «Альфа»',   docs: 'Счёт + Реализация', done: true  },
                  { date: '1 июн', name: 'ИП Морозова',    docs: 'Счёт + Реализация + СФ', done: true  },
                  { date: '5 июн', name: 'ООО «Старт»',    docs: 'Счёт на оплату', done: true  },
                  { date: '15 июн', name: 'АО «Ресурс»',   docs: 'Реализация + СФ', done: false },
                  { date: '30 июн', name: 'ИП Сидоров',    docs: 'Счёт + Реализация', done: false },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center gap-4 px-6 py-3.5 border-b border-slate-50 dark:border-white/5 ${row.done ? '' : 'opacity-50'}`}>
                    <div className="w-12 text-xs text-slate-400 dark:text-white/40 font-mono flex-shrink-0">{row.date}</div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${row.done ? 'bg-green-400' : 'bg-slate-300 dark:bg-white/20'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">{row.name}</div>
                      <div className="text-xs text-slate-400 dark:text-white/40 truncate">{row.docs}</div>
                    </div>
                    {row.done && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />}
                  </div>
                ))}

                <div className="px-6 py-4 bg-slate-50 dark:bg-white/5 flex items-center justify-between text-xs text-slate-400 dark:text-white/40">
                  <span>Создано за месяц: 3 из 5</span>
                  <span className="text-green-600 dark:text-green-400 font-medium">₽ 248 000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ─────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 max-w-6xl mx-auto px-5">
        <div className="text-center mb-16">
          <p className="text-blue-500 text-sm font-semibold uppercase tracking-wider mb-3">Тарифы</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
            Прозрачная цена
          </h2>
          <p className="text-slate-500 dark:text-white/50 text-lg max-w-md mx-auto">
            Все тарифы включают 15 дней бесплатного периода. Карта не нужна.
          </p>
        </div>

        {/* Trial badge */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-full px-5 py-2 text-green-700 dark:text-green-400 text-sm font-medium">
            <CheckCircle2 size={15} className="text-green-500" />
            Все тарифы — 15 дней бесплатно, без привязки карты
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {[
            {
              name: 'Профи',
              price: '2 900 ₽',
              sub: 'в месяц',
              desc: 'Для бухгалтеров, ведущих несколько клиентов',
              features: [
                'До 5 пользователей',
                'До 30 клиентов',
                'До 5 интеграций с 1С',
                'Полный документооборот (счёт + реализация + СФ)',
                'Telegram & Email уведомления',
                'Безлимитные расписания',
                'До 500 авто-документов в месяц',
              ],
              overages: ['+5 ₽ за документ сверх лимита', '+500 ₽/мес за интеграцию с 1С сверх лимита'],
              cta: 'Начать 15 дней бесплатно',
              href: '/register',
              accent: true,
            },
            {
              name: 'Бюро',
              price: '6 900 ₽',
              sub: 'в месяц',
              desc: 'Для бухгалтерских бюро и аутсорсеров',
              features: [
                'Неограниченно пользователей',
                'Неограниченно клиентов',
                'Неограниченно интеграций с 1С',
                'Безлимитные авто-документы',
                'Приоритетная поддержка',
                'Персональный онбординг',
                'API доступ',
              ],
              overages: [],
              cta: 'Начать 15 дней бесплатно',
              href: '/register',
              accent: false,
            },
          ].map((plan) => (
            <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-7 ${plan.accent ? 'bg-[#0f2444] border-[#1c3a5e] shadow-xl shadow-blue-900/20' : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/10'}`}>
              {plan.accent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-semibold px-4 py-1 rounded-full">
                  Популярный
                </div>
              )}
              <div className={`text-sm font-semibold mb-1 ${plan.accent ? 'text-blue-300' : 'text-slate-400 dark:text-white/40'}`}>{plan.name}</div>
              <p className={`text-xs mb-4 ${plan.accent ? 'text-white/40' : 'text-slate-400 dark:text-white/40'}`}>{plan.desc}</p>
              <div className={`mb-1 ${plan.accent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                <span className="text-3xl font-extrabold">{plan.price}</span>
                <span className={`text-sm ml-1 ${plan.accent ? 'text-white/40' : 'text-slate-400 dark:text-white/40'}`}>{plan.sub}</span>
              </div>
              <div className={`text-xs mb-5 mt-1 ${plan.accent ? 'text-green-400' : 'text-green-600 dark:text-green-400'}`}>
                15 дней бесплатно
              </div>
              <hr className={`mb-5 ${plan.accent ? 'border-white/10' : 'border-slate-100 dark:border-white/10'}`} />
              <ul className="flex flex-col gap-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <CheckCircle2 size={14} className={plan.accent ? 'text-blue-400' : 'text-green-500'} />
                    <span className={plan.accent ? 'text-white/70' : 'text-slate-600 dark:text-white/70'}>{f}</span>
                  </li>
                ))}
                {plan.overages.map((o) => (
                  <li key={o} className="flex items-center gap-2.5 text-xs mt-1">
                    <ArrowRight size={12} className={plan.accent ? 'text-white/30' : 'text-slate-300 dark:text-white/30'} />
                    <span className={plan.accent ? 'text-white/40' : 'text-slate-400 dark:text-white/40'}>{o}</span>
                  </li>
                ))}
              </ul>
              <Link href={plan.href}
                className={`mt-8 text-center text-sm font-semibold py-3 rounded-xl transition-all ${plan.accent ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg' : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white'}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-[#060f1e] dark:via-[#0f2444] dark:to-[#1c3a5e] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.4] dark:opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(100,116,139,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,.08) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-blue-500/10 dark:bg-blue-500/20 blur-3xl" />

        <div className="relative max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-5">
            Начните автоматизировать<br />бухгалтерию уже сегодня
          </h2>
          <p className="text-slate-600 dark:text-white/60 text-lg mb-10 max-w-xl mx-auto">
            Первые 15 дней бесплатно, без привязки карты. Подключите 1С:Фреш и создайте первые документы за 15 минут.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register"
              className="inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all shadow-xl shadow-blue-500/20 hover:-translate-y-0.5">
              Создать аккаунт бухгалтера
              <ArrowRight size={16} />
            </Link>
            <Link href="/login"
              className="inline-flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-900/5 dark:border-white/20 dark:hover:bg-white/10 text-slate-900 dark:text-white font-semibold px-8 py-4 rounded-xl text-base transition-all">
              Уже есть аккаунт
            </Link>
          </div>

          <div className="flex justify-center gap-8 mt-12">
            {[
              { icon: Clock,         text: '15 дней бесплатно' },
              { icon: Shield,        text: 'Данные защищены' },
              { icon: CheckCircle2,  text: 'Поддержка 24/7' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-slate-500 dark:text-white/40 text-sm">
                <Icon size={14} className="text-blue-500 dark:text-blue-400" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-50 dark:bg-[#060f1e] border-t border-slate-100 dark:border-white/5 py-12">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <LogoIcon className="h-8 w-auto" />
                <span className="font-bold text-lg text-slate-900 dark:text-white">BuhgSaaS</span>
              </div>
              <p className="text-slate-500 dark:text-white/40 text-sm leading-relaxed max-w-xs">
                Рабочее место бухгалтера для автоматизации документооборота с 1С:Фреш. Для тех, кто ценит своё время.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-slate-500 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Продукт</h4>
              <ul className="flex flex-col gap-2.5">
                {['Возможности', 'Как работает', 'Тарифы', 'Безопасность'].map((t) => (
                  <li key={t}><a href="#" className="text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white text-sm transition-colors">{t}</a></li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-slate-500 dark:text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Компания</h4>
              <ul className="flex flex-col gap-2.5">
                {[
                  { label: 'Войти',              href: '/login'    },
                  { label: 'Регистрация',         href: '/register' },
                  { label: 'Политика приватности', href: '#'        },
                  { label: 'Поддержка',           href: '#'        },
                ].map(({ label, href }) => (
                  <li key={label}><Link href={href} className="text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white text-sm transition-colors">{label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-slate-400 dark:text-white/25 text-xs">© 2026 BuhgSaaS. Все права защищены.</p>
            <p className="text-slate-400 dark:text-white/25 text-xs">Создано для бухгалтеров России · 1С:Фреш OData</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
