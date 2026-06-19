import { Task } from '@/types';

export const DEMO_TASKS: Task[] = [
  { id:'task-d1', title:'Подготовить декларацию за Q1',      priority:'HIGH',   status:'TODO',        clientId:'cl1', createdAt:new Date('2024-06-09T00:00:00'), updatedAt:new Date('2024-06-09T00:00:00') },
  { id:'task-d2', title:'Отчёт 6-НДФЛ за квартал',           priority:'MEDIUM', status:'TODO',        clientId:'cl2', createdAt:new Date('2024-06-10T00:00:00'), updatedAt:new Date('2024-06-10T00:00:00') },
  { id:'task-d3', title:'Проверить первичку по кварталу',     priority:'LOW',    status:'IN_PROGRESS', clientId:'cl3', createdAt:new Date('2024-06-10T00:00:00'), updatedAt:new Date('2024-06-10T00:00:00') },
  { id:'task-d4', title:'Выставить счёт Алексею К.',          priority:'URGENT', status:'TODO',        clientId:'cl1', createdAt:new Date('2024-06-10T00:00:00'), updatedAt:new Date('2024-06-10T00:00:00') },
  { id:'task-d5', title:'Закрыть акт за март',                priority:'HIGH',   status:'DONE',        clientId:'cl2', createdAt:new Date('2024-06-08T00:00:00'), updatedAt:new Date('2024-06-09T00:00:00') },
  { id:'task-d6', title:'Сверка расчётов — Дмитрий Р.',      priority:'MEDIUM', status:'TODO',        clientId:'cl3', createdAt:new Date('2024-06-11T00:00:00'), updatedAt:new Date('2024-06-11T00:00:00') },
];
