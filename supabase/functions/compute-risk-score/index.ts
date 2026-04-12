import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

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

    // Get institutions to score (include sector for peer contagion)
    let query = supabase.from("institutions").select("id, name, sector").eq("is_active", true)
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

    // First pass: compute individual scores
    const results: Array<{
      institution_id: string
      name: string
      sector: string
      score: number
      components: Record<string, number>
      signalCount: number
    }> = []

    // Get previous scores for delta comparison
    const prevScores: Record<string, number> = {}
    for (const inst of institutions ?? []) {
      const { data: prev } = await supabase
        .from("risk_scores")
        .select("score")
        .eq("institution_id", inst.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .single()
      if (prev) prevScores[inst.id] = Number(prev.score)
    }

    for (const inst of institutions ?? []) {
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

      let compositeScore = 0
      const components: Record<string, number> = {}

      for (const [category, rawScore] of Object.entries(categoryScores)) {
        const normalizedScore = Math.min(rawScore, 100)
        const weight = weightMap[category] ?? 0.05
        const weightedScore = normalizedScore * weight
        components[category] = Number(normalizedScore.toFixed(2))
        compositeScore += weightedScore
      }

      const finalScore = Math.min(compositeScore, 100)

      results.push({
        institution_id: inst.id,
        name: inst.name,
        sector: inst.sector,
        score: finalScore,
        components,
        signalCount: signals?.length ?? 0,
      })
    }

    // Second pass: peer contagion
    for (const result of results) {
      const prevScore = prevScores[result.institution_id] ?? 0
      const scoreDelta = result.score - prevScore

      // If this institution spiked by 15+ points, generate contagion signals for peers
      if (scoreDelta > 15) {
        const peers = results.filter(
          (r) => r.institution_id !== result.institution_id && r.sector === result.sector,
        )

        for (const peer of peers) {
          // Guard: only one peer_contagion signal per institution per 24h
          const dayAgo = new Date()
          dayAgo.setDate(dayAgo.getDate() - 1)

          const { data: existingContagion } = await supabase
            .from("risk_signals")
            .select("id")
            .eq("institution_id", peer.institution_id)
            .eq("category", "peer_contagion")
            .gte("signal_date", dayAgo.toISOString())
            .limit(1)

          if (existingContagion && existingContagion.length > 0) continue

          const severity = scoreDelta > 30 ? "high" : "medium"

          await supabase.from("risk_signals").insert({
            institution_id: peer.institution_id,
            category: "peer_contagion",
            severity,
            title: `Peer risk spike: ${result.name} score jumped +${scoreDelta.toFixed(0)} points`,
            description: `${result.name} (same sector: ${result.sector}) risk score increased from ${prevScore.toFixed(1)}% to ${result.score.toFixed(1)}%. This pattern may indicate sector-wide stress. SVB's collapse triggered contagion to First Republic, Signature Bank, and other regionals.`,
            signal_value: scoreDelta,
            signal_date: new Date().toISOString(),
            source: "Peer analysis",
          })
        }
      }
    }

    // Save all scores
    for (const result of results) {
      const { error: insertError } = await supabase.from("risk_scores").upsert(
        {
          institution_id: result.institution_id,
          score: Number(result.score.toFixed(2)),
          score_components: result.components,
          signal_count: result.signalCount,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "institution_id,computed_at" },
      )

      if (insertError) console.error("Failed to insert score:", insertError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: results.map((r) => ({
          institution_id: r.institution_id,
          score: r.score,
          components: r.components,
        })),
      }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
