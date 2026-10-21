import React from 'react';
import { Power, Loader2 } from 'lucide-react';
import { useAutostart } from '../hooks/useAutostart';

interface AutostartToggleProps {
  compact?: boolean;
}

export const AutostartToggle: React.FC<AutostartToggleProps> = ({ compact = false }) => {
  const { autostartEnabled, isLoading, toggleAutostart } = useAutostart();

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleAutostart}
        disabled={isLoading}
        title={autostartEnabled ? 'Автозапуск включен (нажмите для отключения)' : 'Автозапуск отключен (нажмите для включения)'}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          autostartEnabled
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
            : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60 hover:text-zinc-900 dark:hover:text-zinc-200'
        } disabled:opacity-50`}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
        ) : (
          <Power className={`w-3.5 h-3.5 ${autostartEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
        )}
        <span className="hidden md:inline">
          {autostartEnabled ? 'Автостарт: Вкл' : 'Автостарт: Выкл'}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl shadow-2xs">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${autostartEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
          <Power className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Запуск вместе с Windows
            {autostartEnabled && (
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Тихий фон
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            При старте системы приложение свернется в трей для фоновой отправки постов
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={autostartEnabled}
        onClick={toggleAutostart}
        disabled={isLoading}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
          autostartEnabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            autostartEnabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
