import React, { useEffect } from 'react';
import { ArrowDownCircle, X, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { Update } from '@tauri-apps/plugin-updater';
import { DownloadProgress } from '../hooks/useUpdater';

interface UpdateDialogProps {
  isOpen: boolean;
  update: Update | null;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  onInstall: () => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  isOpen,
  update,
  isDownloading,
  downloadProgress,
  onInstall,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDownloading, onClose]);

  if (!isOpen || !update) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Доступно обновление
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  v{update.version}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Текущая версия: v{update.currentVersion}
              </p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {update.body ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Что нового в этой версии:
              </span>
              <div className="max-h-48 overflow-y-auto text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 whitespace-pre-wrap leading-relaxed">
                {update.body}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Вышла новая версия приложения SMM Control Center с улучшениями стабильности и новыми функциями.
            </p>
          )}

          {/* Download Progress Bar */}
          {isDownloading && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  Скачивание файлов обновления...
                </span>
                <span className="font-medium">
                  {downloadProgress ? `${downloadProgress.percent}%` : 'Подготовка...'}
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200 ease-out rounded-full"
                  style={{ width: `${downloadProgress ? downloadProgress.percent : 5}%` }}
                />
              </div>
              {downloadProgress && downloadProgress.total > 0 && (
                <div className="text-[11px] text-right text-zinc-400">
                  {formatBytes(downloadProgress.downloaded)} из {formatBytes(downloadProgress.total)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800">
          {!isDownloading ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
              >
                Напомнить позже
              </button>
              <button
                type="button"
                onClick={onInstall}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Скачать и обновить
              </button>
            </>
          ) : (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 py-1 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              Приложение автоматически перезапустится после установки
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
