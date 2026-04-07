import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Institution } from '../../shared/types'

export function useInstitutions() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('institutions')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch institutions:', error)
        else setInstitutions(data ?? [])
        setLoading(false)
      })
  }, [])

  return { institutions, loading }
}
