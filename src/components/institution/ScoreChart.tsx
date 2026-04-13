import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { format } from 'date-fns'
import type { RiskScore } from '../../../shared/types'

export function ScoreChart({ scores }: { scores: RiskScore[] }) {
  const data = scores
    .slice()
    .sort((a, b) => new Date(a.computed_at).getTime() - new Date(b.computed_at).getTime())
    .map((s) => ({
      date: format(new Date(s.computed_at), 'MMM d'),
      score: Number(s.score),
    }))

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        No score history yet.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={10} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} width={30} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#f1f5f9' }}
          itemStyle={{ color: '#f1f5f9' }}
        />
        <ReferenceLine y={50} stroke="#f97316" strokeDasharray="5 5" label={{ value: 'High Risk', fill: '#f97316', fontSize: 11 }} />
        <ReferenceLine y={80} stroke="#dc2626" strokeDasharray="5 5" label={{ value: 'Critical', fill: '#dc2626', fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
