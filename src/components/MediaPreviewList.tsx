import React, { useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ImageOff, X, FileImage } from 'lucide-react';

interface MediaThumbnailProps {
  path: string;
  onRemove?: () => void;
  readOnly?: boolean;
}

const MediaThumbnail: React.FC<MediaThumbnailProps> = ({ path, onRemove, readOnly }) => {
  const [hasError, setHasError] = useState(false);

  // Extract filename from absolute path (handling both Windows \ and Unix / separators)
  const fileName = path.split(/[/\\]/).pop() || 'image';
  const assetUrl = convertFileSrc(path);

  return (
    <div className="relative group w-20 h-20 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-2xs shrink-0 select-none">
      {hasError ? (
        <div
          title={`Файл не найден на диске:\n${path}`}
          className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-rose-500/10 text-rose-500 dark:text-rose-400"
        >
          <ImageOff className="w-5 h-5 mb-0.5" />
          <span className="text-[9px] font-medium leading-tight truncate max-w-full px-1">
            Не найден
          </span>
        </div>
      ) : (
        <img
          src={assetUrl}
          alt={fileName}
          title={path}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      )}

      {/* Remove button */}
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Удалить фото"
          className="absolute top-1 right-1 p-1 bg-zinc-900/80 hover:bg-rose-600 text-white rounded-full shadow-md transition-colors opacity-80 group-hover:opacity-100 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Subtle filename hover badge */}
      <div className="absolute inset-x-0 bottom-0 py-0.5 px-1 bg-black/60 text-[8px] text-zinc-200 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {fileName}
      </div>
    </div>
  );
};

interface MediaPreviewListProps {
  mediaUrls: string[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export const MediaPreviewList: React.FC<MediaPreviewListProps> = ({
  mediaUrls,
  onRemove,
  readOnly = false,
}) => {
  if (!mediaUrls || mediaUrls.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {!readOnly && (
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1 font-medium">
            <FileImage className="w-3.5 h-3.5 text-blue-500" />
            Прикрепленные медиафайлы:
          </span>
          <span className="font-mono text-[11px] font-semibold">
            {mediaUrls.length}/10
          </span>
        </div>
      )}

      <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-0.5 scrollbar-thin">
        {mediaUrls.map((path, idx) => (
          <MediaThumbnail
            key={`${path}-${idx}`}
            path={path}
            readOnly={readOnly}
            onRemove={onRemove ? () => onRemove(idx) : undefined}
          />
        ))}
      </div>
    </div>
  );
};
