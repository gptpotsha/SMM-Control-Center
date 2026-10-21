import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Loader2,
  Send,
  Share2,
  Users,
  Globe,
  AlertCircle,
  BookmarkCheck,
  Image as ImageIcon,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAccountsQuery } from '../hooks/useAccounts';
import { useCreatePostMutation } from '../hooks/usePosts';
import { MediaPreviewList } from './MediaPreviewList';
import { toast } from 'sonner';

interface CreatePostFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CreatePostForm: React.FC<CreatePostFormProps> = ({ onSuccess, onCancel }) => {
  const [content, setContent] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  const { data: accounts, isLoading: isAccountsLoading } = useAccountsQuery();
  const createMutation = useCreatePostMutation();

  const isPending = createMutation.isPending;

  // Native file selection dialog via @tauri-apps/plugin-dialog
  // Invariant: strictly filter to images, limit to max 10 files
  const handleAttachMedia = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Изображения',
            extensions: ['jpg', 'jpeg', 'png', 'webp'],
          },
        ],
      });

      if (!selected) return;

      const incoming: string[] = Array.isArray(selected)
        ? selected
        : [selected];

      if (incoming.length === 0) return;

      setMediaUrls((prev) => {
        // Filter out already attached files
        const uniqueNew = incoming.filter((p) => !prev.includes(p));
        const combined = [...prev, ...uniqueNew];

        // Invariant: Max 10 files per post
        if (combined.length > 10) {
          const cutCount = combined.length - 10;
          toast.warning(
            `Превышен лимит: прикреплено максимум 10 файлов (отсечено ${cutCount})`
          );
          return combined.slice(0, 10);
        }

        return combined;
      });
    } catch (err) {
      toast.error(`Ошибка при открытии диалога файлов: ${err}`);
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Helper to format date for datetime-local input
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((accId) => accId !== id) : [...prev, id]
    );
  };

  const selectAllAccounts = () => {
    if (!accounts) return;
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map((a) => a.id));
    }
  };

  // Convert input datetime-local string to Unix timestamp (seconds, UTC)
  const parseScheduledTimestamp = (dtString: string): number | null => {
    if (!dtString) return null;
    const parsed = new Date(dtString).getTime();
    if (isNaN(parsed)) return null;
    return Math.floor(parsed / 1000);
  };

  // Quick preset helper
  const setQuickSchedule = (minutesFromNow: number) => {
    const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setScheduledAt(
      `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(
        target.getHours()
      )}:${pad(target.getMinutes())}`
    );
  };

  // Handle Draft submission (Rule: Draft relaxes accounts and time validation)
  const handleSaveDraft = () => {
    const scheduledTimestamp = parseScheduledTimestamp(scheduledAt);

    createMutation.mutate(
      {
        content: content.trim(),
        destination_account_ids: selectedAccountIds,
        status: 'draft',
        scheduled_for: scheduledTimestamp,
        media_urls: mediaUrls,
      },
      {
        onSuccess: () => {
          toast.success('Черновик успешно сохранен!');
          resetForm();
          onSuccess?.();
        },
        onError: (err: any) => {
          const msg = typeof err === 'string' ? err : err?.message || String(err);
          toast.error(`Ошибка при сохранении черновика: ${msg}`);
        },
      }
    );
  };

  // Handle Scheduled submission (Rule: Strict validation of accounts and future time)
  const handleSchedulePost = () => {
    // Invariant 1: Content must not be empty (unless photos are attached)
    if (!content.trim() && mediaUrls.length === 0) {
      toast.error('Пожалуйста, введите текст публикации или прикрепите фото');
      return;
    }

    // Invariant 2: At least 1 account must be selected
    if (selectedAccountIds.length === 0) {
      toast.error('Выберите хотя бы один аккаунт для публикации');
      return;
    }

    // Invariant 3: Scheduled time must be set
    const scheduledTimestamp = parseScheduledTimestamp(scheduledAt);
    if (!scheduledTimestamp) {
      toast.error('Укажите дату и время отложенной публикации');
      return;
    }

    // Invariant 4: Scheduled time must be strictly in the future
    const nowTimestamp = Math.floor(Date.now() / 1000);
    if (scheduledTimestamp <= nowTimestamp) {
      toast.error('Время публикации должно быть позже текущего момента');
      return;
    }

    createMutation.mutate(
      {
        content: content.trim(),
        destination_account_ids: selectedAccountIds,
        status: 'scheduled',
        scheduled_for: scheduledTimestamp,
        media_urls: mediaUrls,
      },
      {
        onSuccess: () => {
          const dateStr = new Date(scheduledTimestamp * 1000).toLocaleString('ru-RU');
          toast.success(`Пост успешно запланирован на ${dateStr}!`);
          resetForm();
          onSuccess?.();
        },
        onError: (err: any) => {
          const msg = typeof err === 'string' ? err : err?.message || String(err);
          toast.error(`Ошибка планирования: ${msg}`);
        },
      }
    );
  };

  const resetForm = () => {
    setContent('');
    setSelectedAccountIds([]);
    setScheduledAt('');
    setMediaUrls([]);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'vk':
        return <Share2 className="w-3.5 h-3.5 text-blue-500" />;
      case 'tg':
      case 'telegram':
        return <Send className="w-3.5 h-3.5 text-sky-500" />;
      case 'ok':
        return <Users className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Account Selection (Checkboxes) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Целевые аккаунты ({selectedAccountIds.length})
          </label>
          {accounts && accounts.length > 0 && (
            <button
              type="button"
              onClick={selectAllAccounts}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {selectedAccountIds.length === accounts.length ? 'Снять все' : 'Выбрать все'}
            </button>
          )}
        </div>

        {isAccountsLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            Загрузка аккаунтов...
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Нет подключенных аккаунтов. Вы можете сохранить черновик, но для отложенной публикации добавьте аккаунт в разделе «Аккаунты».</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {accounts.map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id);
              return (
                <label
                  key={acc.id}
                  onClick={() => toggleAccount(acc.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/40 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // handled by label onClick
                    className="w-4 h-4 rounded-sm text-blue-600 border-zinc-300 dark:border-zinc-700 focus:ring-blue-500/20"
                  />
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getPlatformIcon(acc.platform)}
                    <span className="text-xs font-medium truncate">{acc.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Post Content & Media */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Текст публикации
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 font-mono">{content.length} симв.</span>
            <button
              type="button"
              onClick={handleAttachMedia}
              disabled={isPending || mediaUrls.length >= 10}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
              <span>Прикрепить фото</span>
              {mediaUrls.length > 0 && (
                <span className="font-mono text-[10px] text-zinc-400">
                  ({mediaUrls.length}/10)
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Media Preview list if files attached */}
        {mediaUrls.length > 0 && (
          <MediaPreviewList
            mediaUrls={mediaUrls}
            onRemove={handleRemoveMedia}
          />
        )}

        <textarea
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isPending}
          placeholder="Напишите текст вашего поста..."
          className="w-full p-3.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50 resize-y"
        />
      </div>

      {/* 3. Schedule Time (datetime-local + quick presets) */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            Время отложенной публикации
          </label>
          <span className="text-xs text-zinc-400">Локальное время</span>
        </div>

        <input
          type="datetime-local"
          value={scheduledAt}
          min={getMinDateTime()}
          onChange={(e) => setScheduledAt(e.target.value)}
          disabled={isPending}
          className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50"
        />

        {/* Quick presets */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-zinc-400">Быстро:</span>
          <button
            type="button"
            onClick={() => setQuickSchedule(1)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:text-blue-600 rounded-md transition-colors"
          >
            +1 мин
          </button>
          <button
            type="button"
            onClick={() => setQuickSchedule(10)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:text-blue-600 rounded-md transition-colors"
          >
            +10 мин
          </button>
          <button
            type="button"
            onClick={() => setQuickSchedule(60)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:text-blue-600 rounded-md transition-colors"
          >
            +1 час
          </button>
          <button
            type="button"
            onClick={() => setQuickSchedule(1440)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:text-blue-600 rounded-md transition-colors"
          >
            +1 день
          </button>
        </div>
      </div>

      {/* 4. Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              Отмена
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Draft button */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPending}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <BookmarkCheck className="w-4 h-4" />
            Сохранить черновик
          </button>

          {/* Schedule button */}
          <button
            type="button"
            onClick={handleSchedulePost}
            disabled={isPending}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl transition-colors shadow-xs disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            {isPending ? 'Сохранение...' : 'Запланировать'}
          </button>
        </div>
      </div>
    </div>
  );
};
