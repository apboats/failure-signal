import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  insert,
  listConfigs,
  listHistory,
  remove,
  update,
  type NewAlertConfig,
} from '@/api/alerts'
import { queryKeys } from '@/queries/keys'

/** Alert configs, newest first. */
export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: listConfigs,
  })
}

/** Create an alert. Rejects with the QueryError; refetches the list before resolving. */
export function useCreateAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: NewAlertConfig) => {
      const { error } = await insert(values)
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  })
}

/** Pause/resume an alert. */
export function useToggleAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: {
      id: string
      is_active: boolean
    }) => {
      const { error } = await update(id, { is_active })
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  })
}

/** Delete an alert config (its history rows cascade). */
export function useDeleteAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await remove(id)
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
        queryClient.invalidateQueries({ queryKey: ['alert-history'] }),
      ]),
  })
}

/** Triggered alerts, newest first. */
export function useAlertHistory(limit = 50) {
  return useQuery({
    queryKey: queryKeys.alertHistory(limit),
    queryFn: () => listHistory(limit),
  })
}
