import React, { useState, useMemo } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Post, PostStatus } from '../api/db';
import { PostCard } from './PostCard';

export type PostFilterTab =
  | 'all'
  | 'scheduled'
  | 'draft'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed';

interface PostListProps {
  posts: Post[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onCreateNew?: () => void;
}

export const PostList: React.FC<PostListProps> = ({
  posts,
  isLoading,
  isError,
  error,
  onCreateNew,
}) => {
  const [activeTab, setActiveTab] = useState<PostFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate counts for each tab
  const tabCounts = useMemo(() => {
    const counts: Record<PostFilterTab, number> = {
      all: 0,
      scheduled: 0,
      draft: 0,
      publishing: 0,
      published: 0,
      partially_published: 0,
      failed: 0,
    };

    if (!posts) return counts;

    counts.all = posts.length;
    posts.forEach((p) => {
      const status = p.status as PostStatus;
      if (counts[status] !== undefined) {
        counts[status] += 1;
      }
    });

    return counts;
  }, [posts]);

  // Filter posts by active tab and search query
  const filteredPosts = useMemo(() => {
    if (!posts) return [];

    return posts
      .filter((post) => {
        if (activeTab === 'all') return true;
        return post.status === activeTab;
      })
      .filter((post) => {
        if (!searchQuery.trim()) return true;
        return post.content.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [posts, activeTab, searchQuery]);

  // Tab configurations
  const tabs: { id: PostFilterTab; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Все', icon: <Layers className="w-4 h-4" /> },
    { id: 'scheduled', label: 'Запланированные', icon: <Clock className="w-4 h-4 text-blue-500" /> },
    { id: 'draft', label: 'Черновики', icon: <FileText className="w-4 h-4 text-zinc-500" /> },
    { id: 'publishing', label: 'В процессе', icon: <Loader2 className="w-4 h-4 text-blue-500" /> },
    { id: 'published', label: 'Опубликованные', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
    { id: 'partially_published', label: 'Частично', icon: <AlertCircle className="w-4 h-4 text-amber-500" /> },
    { id: 'failed', label: 'Ошибки', icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
  ];

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Загрузка публикаций...
        </p>
      </div>
    );
  }

  // 2. Error state
  if (isError) {
    return (
      <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">
          Не удалось загрузить публикации
        </h3>
        <p className="text-xs text-rose-600 dark:text-rose-300">
          {error?.message || 'Неизвестная ошибка при получении данных из базы SQLite'}
        </p>
      </div>
    );
  }

  // 3. Global Empty State (no posts at all)
  if (!posts || posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl text-center">
        <div className="p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          Нет сохраненных публикаций
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-6">
          Создайте свой первый пост — сохраните его в черновиках или запланируйте автопостинг по расписанию через фоновый воркер.
        </p>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Создать публикацию
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const count = tabCounts[tab.id];
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по тексту..."
            className="w-full pl-9 pr-3.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Grid of posts or Filtered empty state */}
      {filteredPosts.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Публикаций не найдено
          </p>
          <p className="text-xs text-zinc-400">
            {searchQuery
              ? 'Попробуйте изменить поисковый запрос'
              : 'В этой категории пока нет ни одной публикации'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
};
