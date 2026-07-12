import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Подключение 1С:Fresh — BuhgSaaS',
  description: 'Как выдать доступ к базе 1С:Fresh и подключить её в BuhgSaaS',
};

function StepList({ accent, steps }: { accent: 'onec' | 'app'; steps: { title: React.ReactNode; body?: React.ReactNode }[] }) {
  const idxClass = accent === 'onec' ? 'bg-orange-600' : 'bg-blue-600';
  return (
    <ol className="divide-y divide-slate-100">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3.5 py-3.5 first:pt-0 last:pb-0">
          <span className={`h-6 w-6 rounded-full ${idxClass} text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
            {i + 1}
          </span>
          <div className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300 space-y-2">
            <p>{s.title}</p>
            {s.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-[12px] rounded-md px-2.5 py-1 mr-1.5 mt-1">
      <span className="text-slate-400">{k}</span>
      <span className="text-emerald-300 font-mono">{v}</span>
    </span>
  );
}

export default function OnecConnectInfoPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto">

        <p className="text-[12px] font-semibold tracking-wide uppercase text-slate-400 mb-2">Инструкция · интеграция</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">
          Подключение 1С:Fresh к BuhgSaaS
        </h1>
        <p className="text-[15px] text-slate-500 dark:text-slate-400 max-w-lg mb-6 leading-relaxed">
          Два шага: сначала в 1С выпускается отдельный технический пользователь для обмена данными,
          затем его логин, пароль и адрес базы вводятся в карточке клиента в приложении.
        </p>
        <div className="flex flex-wrap gap-4 mb-10 text-[13px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-orange-600" />Часть 1 — в 1С:Fresh</span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Часть 2 — в приложении</span>
        </div>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 sm:p-6 mb-6">
          <div className="flex items-baseline gap-2.5 pb-3 mb-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wide bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400 rounded px-2 py-0.5">1С</span>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Выдать доступ к базе</h2>
            <span className="ml-auto text-[12px] text-slate-400">Администрирование</span>
          </div>

          <StepList
            accent="onec"
            steps={[
              { title: <>В левом меню откройте <b>Администрирование</b> → <b>Синхронизация данных</b>.</> },
              { title: <>Внизу страницы найдите ссылку <b>«Настройки стандартного интерфейса OData»</b> и перейдите по ней.</> },
              {
                title: <>На вкладке <b>«Авторизация»</b> поставьте галку <b>«Создать для использования автоматического REST-сервиса отдельные имя пользователя и пароль»</b>.</>,
                body: (
                  <div className="text-[13px] bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2">
                    <b>Важно.</b> 1С сама предупреждает: не используйте для OData свой рабочий логин с правами на всю базу.
                    Заведите отдельного пользователя — он не сможет заходить в само приложение, только читать и писать данные через сервис.
                  </div>
                ),
              },
              {
                title: <>Заполните имя пользователя и пароль. Их нужно будет один раз передать в приложение — сохраните на время настройки.</>,
                body: (
                  <div className="flex flex-wrap">
                    <Field k="Пользователь" v="odata.user" />
                    <Field k="Пароль" v="••••••••••••" />
                  </div>
                ),
              },
              { title: <>Нажмите <b>«Сохранить и закрыть»</b>.</> },
              {
                title: (
                  <>
                    Возьмите адрес OData-сервиса этой базы — понадобится в приложении. Проще всего собрать его
                    из адресной строки браузера: домен кластера (например <code className="text-[13px] bg-slate-100 dark:bg-slate-800 rounded px-1">msk1.1cfresh.com</code>)
                    и номер приложения, который виден в шапке базы рядом с номером абонента.
                  </>
                ),
                body: (
                  <div className="flex flex-wrap">
                    <Field k="Адрес" v="https://<кластер>.1cfresh.com/a/ea/<ID приложения>/odata/standard.odata" />
                  </div>
                ),
              },
            ]}
          />
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 sm:p-6 mb-6">
          <div className="flex items-baseline gap-2.5 pb-3 mb-1 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wide bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded px-2 py-0.5">Приложение</span>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Подключить базу в BuhgSaaS</h2>
            <span className="ml-auto text-[12px] text-slate-400">Карточка клиента</span>
          </div>

          <StepList
            accent="app"
            steps={[
              { title: <>Откройте карточку нужного клиента и перейдите на вкладку <b>«Интеграции»</b>.</> },
              { title: <>В строке <b>«1С:Предприятие»</b> нажмите <b>«Настроить»</b> (или «Подключить», если это первое подключение).</> },
              {
                title: <>В окне <b>«Подключение 1С:Фреш»</b> заполните три поля данными из части 1:</>,
                body: (
                  <div className="flex flex-wrap">
                    <Field k="URL OData-сервиса" v="из шага 6" />
                    <Field k="Пользователь" v="из шага 4" />
                    <Field k="Пароль" v="из шага 4" />
                  </div>
                ),
              },
              { title: <>Нажмите <b>«Подключить и проверить»</b> — приложение сразу отправит тестовый запрос в 1С этими же учётными данными и покажет результат.</> },
            ]}
          />
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 sm:p-6">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mb-3">Как понять, что всё получилось</h2>
          <div className="space-y-2 text-[14px] text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />Статус строки «1С:Предприятие» меняется на <b>«Подключён»</b></div>
            <div className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />Внизу списка появляется отметка синхронизации, например «1С · обновлено 18:12 · 3 клиентов · авто через 2 мин»</div>
          </div>
          <div className="mt-4 text-[13px] bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
            Дальше синхронизация идёт сама по расписанию — вручную нажимать «Синхронизировать» нужно, только если хотите
            подтянуть свежие документы прямо сейчас, не дожидаясь автообновления.
          </div>
        </section>

        <p className="text-[12.5px] text-slate-400 leading-relaxed mt-8 pt-5 border-t border-slate-200 dark:border-slate-800">
          Логин и пароль, выданные в шаге 4, дают доступ только к чтению и записи документов через OData — зайти под ними
          в само приложение 1С нельзя. Если понадобится отключить интеграцию, проще всего снять галку «Создать отдельные
          имя пользователя и пароль» в тех же настройках 1С — доступ у старых учётных данных пропадёт.
        </p>
      </div>
    </div>
  );
}
