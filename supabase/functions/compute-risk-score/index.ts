import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// Exponential decay factor — signals older than 30 days contribute minimally
const DECAY_LAMBDA = 0.1

const SEVERITY_VALUES: Record<string, number> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 100,
}

Deno.serve(async (req) => {
  try {
    const { institution_id } = await req.json().catch(() => ({ institution_id: null }))

    // Get institutions to score
    let query = supabase.from("institutions").select("id").eq("is_active", true)
    if (institution_id) query = query.eq("id", institution_id)

    const { data: institutions, error: instError } = await query
    if (instError) throw instError

    // Get global scoring weights
    const { data: weights } = await supabase
      .from("scoring_weights")
      .select("category, weight")
      .is("institution_id", null)

    const weightMap: Record<string, number> = {}
    for (const w of weights ?? []) {
      weightMap[w.category] = Number(w.weight)
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const results = []

    for (const inst of institutions ?? []) {
      // Get recent signals for this institution
      const { data: signals } = await supabase
        .from("risk_signals")
        .select("*")
        .eq("institution_id", inst.id)
        .gte("signal_date", thirtyDaysAgo.toISOString())

      const categoryScores: Record<string, number> = {}
      const now = Date.now()

      for (const signal of signals ?? []) {
        const daysAgo = (now - new Date(signal.signal_date).getTime()) / (1000 * 60 * 60 * 24)
        const decayFactor = Math.exp(-DECAY_LAMBDA * daysAgo)
        const severityValue = SEVERITY_VALUES[signal.severity] ?? 10
        const contribution = severityValue * decayFactor

        categoryScores[signal.category] = (categoryScores[signal.category] ?? 0) + contribution
      }

      // Normalize category scores to 0-100 range and apply weights
      let compositeScore = 0
      const components: Record<string, number> = {}

      for (const [category, rawScore] of Object.entries(categoryScores)) {
        // Cap individual category at 100
        const normalizedScore = Math.min(rawScore, 100)
        const weight = weightMap[category] ?? 0.05
        const weightedScore = normalizedScore * weight
        components[category] = Number(normalizedScore.toFixed(2))
        compositeScore += weightedScore
      }

      // Scale to 0-100
      const finalScore = Math.min(compositeScore, 100)

      // Insert the score
      const { error: insertError } = await supabase.from("risk_scores").upsert({
        institution_id: inst.id,
        score: Number(finalScore.toFixed(2)),
        score_components: components,
        signal_count: signals?.length ?? 0,
        computed_at: new Date().toISOString(),
      }, {
        onConflict: "institution_id,computed_at",
      })

      if (insertError) console.error("Failed to insert score:", insertError)

      results.push({ institution_id: inst.id, score: finalScore, components })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
