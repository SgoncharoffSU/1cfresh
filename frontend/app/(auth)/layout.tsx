import { ThemeToggle } from '@/components/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050b16] flex items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      {children}
    </div>
  );
}
