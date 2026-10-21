import React, { useState } from 'react';
import {
  Globe,
  Rss,
  Search,
  Loader2,
  ExternalLink,
  PlusCircle,
  Calendar,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { parseContentSource, ParsedItem } from '../api/db';
import { CreatePostModal } from './CreatePostModal';
import { toast } from 'sonner';

export const ContentGrabberView: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Modal state for "Забрать себе"
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialPostContent, setInitialPostContent] = useState('');

  const handleParse = async (targetUrl?: string) => {
    const inputUrl = (targetUrl ?? url).trim();
    if (!inputUrl) {
      toast.warning('Введите ссылку на сайт или RSS-ленту');
      return;
    }

    // Ensure scheme
    let fullUrl = inputUrl;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const result = await parseContentSource(fullUrl);
      setItems(result);
      if (result.length === 0) {
        toast.info('Материалов не найдено');
      } else {
        toast.success(`Успешно извлечено элементов: ${result.length}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Ошибка при парсинге: ${msg}`);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTakeItem = (item: ParsedItem) => {
    let postContent = item.title;
    if (item.content && item.content !== item.title) {
      postContent += `\n\n${item.content}`;
    }
    if (item.source_url) {
      postContent += `\n\nИсточник: ${item.source_url}`;
    }
    if (item.image_url) {
      postContent += `\n${item.image_url}`;
    }

    setInitialPostContent(postContent);
    setIsModalOpen(true);
    toast.success('Данные перенесены в редактор публикации');
  };

  const handleQuickExample = (exampleUrl: string) => {
    setUrl(exampleUrl);
    handleParse(exampleUrl);
  };

  return (
    <div className="space-y-8">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Rss className="w-3.5 h-3.5" />
              Content Grabber
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Globe className="w-3.5 h-3.5" />
              RSS & OpenGraph
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Граббер контента
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Парсинг статей, новостей и RSS-лент на лету для быстрой подготовки публикаций
          </p>
        </div>
      </div>

      {/* URL Input Form */}
      <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleParse();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <Globe className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Вставьте URL статьи или RSS-ленты (например: https://habr.com/ru/rss/articles/)"
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl shadow-xs transition-colors disabled:opacity-50 shrink-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сбор данных...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Спарсить
              </>
            )}
          </button>
        </form>

        {/* Quick Example Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Примеры:</span>
          <button
            type="button"
            onClick={() => handleQuickExample('https://habr.com/ru/rss/articles/')}
            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Хабр (RSS)
          </button>
          <button
            type="button"
            onClick={() => handleQuickExample('https://lenta.ru/rss/news')}
            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Lenta.ru (RSS)
          </button>
          <button
            type="button"
            onClick={() => handleQuickExample('https://github.com/trending')}
            className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            GitHub (HTML OpenGraph)
          </button>
        </div>
      </div>

      {/* Results Section */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Загрузка и анализ веб-источника...
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Извлечение метаданных OpenGraph, заголовков и медиа-контента
          </p>
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-500" />
              Найдено материалов: {items.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow duration-200"
              >
                <div className="space-y-3">
                  {/* Optional Image Preview */}
                  {item.image_url && (
                    <div className="relative w-full h-44 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800/60">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        onError={(e) => {
                          // Hide broken external image
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>
                  )}

                  {/* Title & Link */}
                  <div>
                    <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">
                      {item.title}
                    </h3>
                    {item.pub_date && (
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1">
                        <Calendar className="w-3 h-3" />
                        <span>{item.pub_date}</span>
                      </div>
                    )}
                  </div>

                  {/* Content Preview */}
                  {item.content && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-4 leading-relaxed">
                      {item.content}
                    </p>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <span>Перейти</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleTakeItem(item)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-2xs transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Забрать себе
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : hasSearched ? (
        <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs">
          <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Ничего не найдено
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            Проверьте правильность введенного адреса или попробуйте другой источник новостей
          </p>
        </div>
      ) : null}

      {/* Create Post Modal triggered by "Забрать себе" */}
      <CreatePostModal
        isOpen={isModalOpen}
        initialContent={initialPostContent}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
