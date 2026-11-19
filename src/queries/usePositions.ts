import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  close,
  insert,
  list,
  type ClosePosition,
  type NewPosition,
} from '@/api/positions'
import { queryKeys } from '@/queries/keys'

/** Open positions first, then newest first. */
export function usePositions() {
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: list,
  })
}

/**
 * Open a position. Rejects with the QueryError (shown via `mutation.error`) and
 * refetches the positions list before resolving so the caller can close its form
 * once the new row is on screen.
 */
export function useOpenPosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: NewPosition) => {
      const { error } = await insert(values)
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.positions }),
  })
}

/** Close a position (exit price/date). Same error and refetch contract as useOpenPosition. */
export function useClosePosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ClosePosition) => {
      const { error } = await close(values)
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.positions }),
  })
}
