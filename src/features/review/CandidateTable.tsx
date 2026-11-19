import { Check, RotateCcw, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Skeleton,
  type Column,
} from '@/components/ui'
import type { MentionCounts } from '@/api/institutions'
import type { ReviewDecision, ReviewStatus } from '@/lib/database.types'
import { formatCount, formatRelative } from '@/lib/format'
import type { Institution } from '@shared/types'
import { likelihoodLabel } from './likelihood'

export interface CandidateTableProps {
  status: ReviewStatus
  rows: readonly Institution[]
  mentions: Map<string, MentionCounts> | undefined
  mentionsLoading: boolean
  /** Id of the row whose decision is being saved; its buttons are disabled. */
  savingId: string | null
  onDecide: (id: string, decision: ReviewDecision) => void
}

const EMPTY: Record<ReviewStatus, { title: string; body: string }> = {
  pending: {
    title: 'Nothing waiting for review.',
    body: 'Companies the news pipeline finds that are not tracked yet appear here, with an estimate of how likely each is to be a US bank.',
  },
  ignored: {
    title: 'No ignored companies.',
    body: 'Companies you ignore stay here so you can change your mind.',
  },
  approved: {
    title: 'No discovered banks tracked yet.',
    body: 'Banks you track from the pending list appear here. Hand-seeded banks are not listed.',
  },
}

function Evidence({ row }: { row: Institution }) {
  const evidence = row.review_evidence
  if (!evidence) return <span className="text-muted">Not checked yet</span>
  const facts = [
    evidence.sic_description ?? (evidence.sic ? `SIC ${evidence.sic}` : null),
    evidence.exchanges && evidence.exchanges.length > 0
      ? evidence.exchanges.join(', ')
      : null,
    evidence.state_or_country,
  ].filter((fact): fact is string => Boolean(fact))
  return (
    <details className="group text-xs">
      <summary className="focus-ring cursor-pointer list-none rounded text-text">
        {facts.length > 0 ? facts.join(' · ') : 'Not in the SEC company list'}
        <span className="ml-1 text-muted group-open:hidden">(why)</span>
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
        {(evidence.reasons ?? []).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </details>
  )
}

function actionsFor(status: ReviewStatus): Array<{
  decision: ReviewDecision
  label: string
  variant: 'primary' | 'secondary' | 'ghost'
  icon: React.ReactNode
}> {
  if (status === 'pending')
    return [
      {
        decision: 'track',
        label: 'Track',
        variant: 'primary',
        icon: <Check />,
      },
      { decision: 'ignore', label: 'Ignore', variant: 'ghost', icon: <X /> },
    ]
  if (status === 'ignored')
    return [
      {
        decision: 'track',
        label: 'Track',
        variant: 'secondary',
        icon: <Check />,
      },
      {
        decision: 'pending',
        label: 'Back to pending',
        variant: 'ghost',
        icon: <RotateCcw />,
      },
    ]
  return [
    {
      decision: 'ignore',
      label: 'Stop tracking',
      variant: 'ghost',
      icon: <X />,
    },
  ]
}

/** One review queue (pending, ignored or tracked) as a sortable table. */
export function CandidateTable({
  status,
  rows,
  mentions,
  mentionsLoading,
  savingId,
  onDecide,
}: CandidateTableProps) {
  const actions = actionsFor(status)
  const columns: Column<Institution>[] = [
    {
      key: 'company',
      header: 'Company',
      mobileRole: 'primary',
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <span className="inline-flex flex-col">
          <Link
            to={`/institution/${row.id}`}
            className="focus-ring rounded font-medium text-text hover:text-accent"
          >
            {row.name}
          </Link>
          <span className="text-xs text-muted">
            {[row.ticker, row.sector.replace('_', ' ')]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'likelihood',
      header: 'US bank likelihood',
      label: 'Likelihood',
      numeric: true,
      sortValue: (row) => row.us_bank_probability,
      render: (row) => {
        const l = likelihoodLabel(row.us_bank_probability)
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="tabular-nums">{l.percent}</span>
            <Badge tone={l.tone} size="sm">
              {l.label}
            </Badge>
          </span>
        )
      },
    },
    {
      key: 'evidence',
      header: 'SEC record',
      hideBelow: 'md',
      render: (row) => <Evidence row={row} />,
    },
    {
      key: 'mentions',
      header: 'Mentions',
      hideBelow: 'lg',
      numeric: true,
      sortValue: (row) => mentions?.get(row.id)?.news ?? null,
      render: (row) => {
        const m = mentions?.get(row.id)
        if (!m)
          return mentionsLoading ? (
            <Skeleton inline className="h-4 w-20" />
          ) : (
            '—'
          )
        return `${formatCount(m.news)} ${m.news === 1 ? 'article' : 'articles'} · ${formatCount(m.signals)} ${m.signals === 1 ? 'signal' : 'signals'}`
      },
    },
    {
      key: 'found',
      header: 'Found',
      hideBelow: 'md',
      numeric: true,
      sortValue: (row) => row.discovered_at,
      render: (row) =>
        row.discovered_at ? formatRelative(row.discovered_at) : '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      align: 'right',
      className: 'md:w-px whitespace-nowrap',
      render: (row) => (
        <span className="inline-flex gap-2">
          {actions.map((action) => (
            <Button
              key={action.decision}
              size="sm"
              variant={action.variant}
              icon={action.icon}
              loading={savingId === row.id}
              disabled={savingId !== null}
              onClick={() => onDecide(row.id, action.decision)}
              aria-label={`${action.label} ${row.name}`}
            >
              {action.label}
            </Button>
          ))}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      defaultSort={{ key: 'likelihood', dir: 'desc' }}
      emptyState={<EmptyState {...EMPTY[status]} />}
    />
  )
}
