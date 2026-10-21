import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPost,
  deletePost,
  getPosts,
  retryPost,
  Post,
  CreatePostInput,
  DeleteResult,
} from '../api/db';

export const POSTS_QUERY_KEY = ['posts'] as const;

/**
 * Hook to retrieve all posts from the local SQLite database.
 * Edge case: refetchInterval of 10s ensures the UI dynamically updates
 * when the Tokio background worker moves posts from 'scheduled' -> 'publishing' -> 'published'/'failed'.
 */
export function usePostsQuery() {
  return useQuery<Post[], Error>({
    queryKey: POSTS_QUERY_KEY,
    queryFn: async () => {
      return await getPosts();
    },
    refetchInterval: 10000,
  });
}

/**
 * Hook to create a new post (draft or scheduled) and invalidate the posts cache.
 */
export function useCreatePostMutation() {
  const queryClient = useQueryClient();

  return useMutation<Post, Error, CreatePostInput>({
    mutationFn: async (input: CreatePostInput) => {
      return await createPost(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: POSTS_QUERY_KEY });
    },
  });
}

/**
 * Hook to delete a post and invalidate the posts cache.
 */
export function useDeletePostMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteResult, Error, string>({
    mutationFn: async (id: string) => {
      return await deletePost(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: POSTS_QUERY_KEY });
    },
  });
}

/**
 * Hook to retry publishing a failed or partially published post.
 */
export function useRetryPostMutation() {
  const queryClient = useQueryClient();

  return useMutation<Post, Error, string>({
    mutationFn: async (id: string) => {
      return await retryPost(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: POSTS_QUERY_KEY });
    },
  });
}
