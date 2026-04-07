import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RiskSignal } from '../../shared/types'

export function useSignals(institutionId: string, limit = 50) {
  const [signals, setSignals] = useState<RiskSignal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('risk_signals')
      .select('*')
      .eq('institution_id', institutionId)
      .order('signal_date', { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch signals:', error)
        else setSignals(data ?? [])
        setLoading(false)
      })
  }, [institutionId, limit])

  return { signals, loading }
}

export function useRecentSignals() {
  const [signalsByInstitution, setSignalsByInstitution] = useState<Record<string, RiskSignal[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    supabase
      .from('risk_signals')
      .select('*')
      .gte('signal_date', weekAgo.toISOString())
      .order('signal_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch recent signals:', error)
        else {
          const grouped: Record<string, RiskSignal[]> = {}
          for (const signal of data ?? []) {
            if (!grouped[signal.institution_id]) grouped[signal.institution_id] = []
            grouped[signal.institution_id].push(signal)
          }
          setSignalsByInstitution(grouped)
        }
        setLoading(false)
      })
  }, [])

  return { signalsByInstitution, loading }
}
