import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { Platform } from '../api/db';
import { useCreateAccountMutation } from '../hooks/useAccounts';
import { toast } from 'sonner';

interface AddAccountFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const AddAccountForm: React.FC<AddAccountFormProps> = ({ onSuccess, onCancel }) => {
  const [platform, setPlatform] = useState<Platform>('vk');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const createMutation = useCreateAccountMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Пожалуйста, укажите отображаемое имя');
      return;
    }

    if (!token.trim()) {
      toast.error('Пожалуйста, введите токен доступа');
      return;
    }

    createMutation.mutate(
      {
        platform,
        name: name.trim(),
        token: token.trim(),
      },
      {
        onSuccess: (createdAccount) => {
          toast.success(`Аккаунт "${createdAccount.name}" успешно подключен!`);
          // Invariant: UI Security: Clear raw token and inputs immediately on success
          setToken('');
          setName('');
          setPlatform('vk');
          onSuccess?.();
        },
        onError: (err: any) => {
          // Edge case: Display IPC/Rust error cleanly without crashing React
          const msg = typeof err === 'string' ? err : err?.message || String(err);
          toast.error(`Ошибка при сохранении: ${msg}`);
        },
      }
    );
  };

  const isPending = createMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Platform Select */}
      <div>
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
          Платформа
        </label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          disabled={isPending}
          className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50"
        >
          <option value="vk">ВКонтакте (VK)</option>
          <option value="tg">Telegram (Канал/Бот)</option>
          <option value="ok">Одноклассники (OK)</option>
          <option value="instagram">Instagram</option>
        </select>
      </div>

      {/* Account Name */}
      <div>
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
          {platform === 'tg' ? 'Канал / Чат (Username или ID)' : 'Название аккаунта'}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          placeholder={
            platform === 'tg'
              ? 'Например: @my_channel или -1001234567890'
              : 'Например: Новости IT / Личный блог'
          }
          className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50"
        />
        {platform === 'tg' && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Для публичных каналов укажите юзернейм (например, <code>@my_channel</code> или <code>my_channel</code>). Бот должен быть добавлен в администраторы канала.
          </p>
        )}
      </div>

      {/* Access Token (Password Input) */}
      <div>
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
          OAuth-токен доступа
        </label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={isPending}
            placeholder="Вставьте токен доступа"
            className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            disabled={isPending}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Токен шифруется ключом AES-256 в OS Keyring и не сохраняется в открытом виде.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !name.trim() || !token.trim()}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isPending ? 'Шифрование и сохранение...' : 'Добавить аккаунт'}
        </button>
      </div>
    </form>
  );
};
