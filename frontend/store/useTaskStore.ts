import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, TaskStatus, TaskPriority } from '@/types';

type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

interface TaskState {
  tasks:       Task[];
  setTasks:    (tasks: Task[]) => void;
  addTask:     (task: TaskDraft) => void;
  updateTask:  (id: string, patch: Partial<Task>) => void;
  deleteTask:  (id: string) => void;
}

let _seq = 1;

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],

      setTasks: (tasks) => set({ tasks }),

      addTask: (task) =>
        set((s) => ({
          tasks: [
            {
              ...task,
              id:        `task-${Date.now()}-${_seq++}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...s.tasks,
          ],
        })),

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date() } : t,
          ),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
    }),
    { name: 'task-store', version: 1 },
  ),
);
