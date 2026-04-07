import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RiskScore } from '../../shared/types'

export function useLatestScores() {
  const [scores, setScores] = useState<Record<string, RiskScore>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('risk_scores')
      .select('*')
      .order('computed_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch scores:', error)
        else {
          const latest: Record<string, RiskScore> = {}
          for (const score of data ?? []) {
            if (!latest[score.institution_id]) {
              latest[score.institution_id] = score
            }
          }
          setScores(latest)
        }
        setLoading(false)
      })
  }, [])

  return { scores, loading }
}

export function useScoreHistory(institutionId: string) {
  const [scores, setScores] = useState<RiskScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('risk_scores')
      .select('*')
      .eq('institution_id', institutionId)
      .order('computed_at', { ascending: true })
      .limit(90)
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch score history:', error)
        else setScores(data ?? [])
        setLoading(false)
      })
  }, [institutionId])

  return { scores, loading }
}
