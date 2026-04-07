import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { NewsArticle } from '../../shared/types'

export function useNewsArticles(institutionId: string, limit = 30) {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('news_articles')
      .select('*')
      .eq('institution_id', institutionId)
      .order('published_at', { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch articles:', error)
        else setArticles(data ?? [])
        setLoading(false)
      })
  }, [institutionId, limit])

  return { articles, loading }
}
