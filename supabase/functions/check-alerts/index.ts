import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

Deno.serve(async () => {
  try {
    // Get all active alert configs
    const { data: configs, error: configError } = await supabase
      .from("alert_configs")
      .select("*, institutions(name)")
      .eq("is_active", true)

    if (configError) throw configError

    const triggered = []

    for (const config of configs ?? []) {
      // Get latest score for this institution
      const { data: score } = await supabase
        .from("risk_scores")
        .select("score, score_components")
        .eq("institution_id", config.institution_id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .single()

      if (!score) continue

      const currentScore = Number(score.score)

      if (currentScore >= Number(config.threshold_score)) {
        // Check if we already fired this alert recently (within 24h)
        const dayAgo = new Date()
        dayAgo.setDate(dayAgo.getDate() - 1)

        const { data: recent } = await supabase
          .from("alert_history")
          .select("id")
          .eq("alert_config_id", config.id)
          .gte("created_at", dayAgo.toISOString())
          .limit(1)

        if (recent && recent.length > 0) continue

        // Determine which categories triggered
        const components = score.score_components as Record<string, number>
        const topSignals = Object.entries(components)
          .filter(([, v]) => v > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([cat]) => cat)

        const institution = config.institutions as { name: string }
        const reason = `${institution.name} risk score reached ${currentScore.toFixed(1)}% (threshold: ${config.threshold_score}%). Top signals: ${topSignals.join(", ")}`

        await supabase.from("alert_history").insert({
          alert_config_id: config.id,
          institution_id: config.institution_id,
          triggered_score: currentScore,
          trigger_reason: reason,
        })

        triggered.push({ config_id: config.id, institution: institution.name, score: currentScore, reason })
      }
    }

    return new Response(JSON.stringify({ success: true, triggered }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
