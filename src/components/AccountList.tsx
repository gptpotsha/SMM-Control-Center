import React from 'react';
import { Users, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { Account } from '../api/db';
import { AccountCard } from './AccountCard';

interface AccountListProps {
  accounts: Account[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onAddNew: () => void;
}

export const AccountList: React.FC<AccountListProps> = ({
  accounts,
  isLoading,
  isError,
  error,
  onAddNew,
}) => {
  // Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
        <p className="text-sm">Загрузка аккаунтов...</p>
      </div>
    );
  }

  // Error State
  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">Ошибка загрузки аккаунтов</p>
          <p className="opacity-90">{error?.message || 'Не удалось получить список аккаунтов'}</p>
        </div>
      </div>
    );
  }

  // Empty State (Edge Case)
  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl">
        <div className="w-14 h-14 mb-4 flex items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
          <Users className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          Нет подключенных аккаунтов
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mb-6">
          Подключите сообщества ВКонтакте, каналы Telegram или группы в Одноклассниках, чтобы настроить отложенный постинг.
        </p>
        <button
          onClick={onAddNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Подключить первый аккаунт
        </button>
      </div>
    );
  }

  // Grid of Accounts
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  );
};
