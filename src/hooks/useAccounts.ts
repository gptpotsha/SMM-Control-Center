import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAccount,
  deleteAccount,
  getAccounts,
  Account,
  CreateAccountInput,
  DeleteResult,
} from '../api/db';

export const ACCOUNTS_QUERY_KEY = ['accounts'] as const;

/**
 * Hook to fetch all accounts from the local SQLite database.
 */
export function useAccountsQuery() {
  return useQuery<Account[], Error>({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      return await getAccounts();
    },
  });
}

/**
 * Hook to create a new account, automatically invalidating the accounts query cache.
 */
export function useCreateAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation<Account, Error, CreateAccountInput>({
    mutationFn: async (input: CreateAccountInput) => {
      return await createAccount(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
    },
  });
}

/**
 * Hook to delete an account by ID, automatically invalidating the accounts query cache.
 */
export function useDeleteAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation<DeleteResult, Error, string>({
    mutationFn: async (id: string) => {
      return await deleteAccount(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
    },
  });
}
