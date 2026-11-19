# UI kit

Pages compose these primitives and never restyle them. Import from `@/components/ui`,
charts from `@/components/charts`, formatting from `@/lib/format`. Tokens live in
`src/index.css`: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `text-text`,
`text-muted`, `text-accent`, `text-risk-1..5`, `text-pos` / `text-neg`, `text-sev-*`,
`bg-<tone>/15`. No raw hex, no `slate-*`, no 10px text in a page (12px `text-xs` is the floor). Interactive
elements get `focus-ring`.

## Page skeleton

```tsx
<div className="space-y-6">
  <PageHeader title="Watchlist" description="61 US banks scored hourly." right={<FreshnessPill />} />
  {q.isError ? <PageState kind="error" error={q.error} onRetry={() => void q.refetch()} />
   : q.isPending ? <PageState kind="loading" skeleton="table" />
   : rows.length === 0 ? <PageState kind="empty" title="No banks match" message="Clear the sector filter." />
   : <Card title="Banks" count={rows.length} padded={false}><DataTable ... /></Card>}
</div>
```

Branch order is always error → loading → empty → content. Grids: `grid gap-4 lg:grid-cols-2`;
KPI strip: `grid grid-cols-2 gap-4 lg:grid-cols-4`.

## Primitives (one example each)

| Primitive                                                                                                                                                                                                                                      | Example                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader { title, description?, right?, back?: boolean \| () => void }` sets `<title>`                                                                                                                                                      | `<PageHeader title="Trading" description="Signals and positions." right={<Button variant="primary">New position</Button>} />`                                                                                                                |
| `Card { title?, count?, action?, padded? = true, level? }` the only bordered box                                                                                                                                                               | `<Card title="Open positions" count={3} padded={false}>…</Card>`                                                                                                                                                                             |
| `SectionHeader { title, count?, action?, level? }` standalone h2 row                                                                                                                                                                           | `<SectionHeader title="Movers" action={<ButtonLink to="/validation">Validate</ButtonLink>} />`                                                                                                                                               |
| `ListRows` + `ListRow { leading?, title, meta?, trailing?, accent?: Tone, to?, onClick?, selected? }`                                                                                                                                          | `<ListRows><ListRow accent="sev-high" leading={<Badge tone="sev-high">High</Badge>} title={s.title} meta={formatRelative(s.created_at)} to={\`/institution/${s.institution_id}\`} /></ListRows>`                                             |
| `Badge { tone?, size?, icon? }` tones: neutral, accent, pos, neg, risk-1..5, sev-*                                                                                                                                                             | `<Badge tone={severityTone(s.severity)}>{severityLabel(s.severity)}</Badge>`                                                                                                                                                                 |
| `StatTile { label, value, sub?, tone?, onClick?, active? }`                                                                                                                                                                                    | `<StatTile label="Elevated" value={formatCount(n)} sub="score ≥ 8" onClick={toggle} active={filter === 'elevated'} />`                                                                                                                       |
| `DataTable<T> { columns, rows, rowKey, defaultSort?/sort+onSort, rowTo?/onRowClick?, rowSelected?, emptyState, toolbar?, loading?, maxHeight? }`                                                                                               | see below                                                                                                                                                                                                                                    |
| `PageState { kind: 'loading' \| 'error' \| 'empty' \| 'notFound', skeleton?: 'tiles' \| 'table' \| 'card', error?, onRetry?, title?, message?, action?, backTo? }`                                                                             | `<PageState kind="notFound" title="No such bank" message="The id is not in institutions." />`                                                                                                                                                |
| `EmptyState { icon?, title, body?, action? }` inside a Card/DataTable                                                                                                                                                                          | `<EmptyState title="No open positions." body="Open one from a trading signal." />`                                                                                                                                                           |
| `SegmentedControl { options, value, onChange, 'aria-label', size? }`                                                                                                                                                                           | `<SegmentedControl aria-label="Range" options={[{value:'30d',label:'30d'},{value:'90d',label:'90d'},{value:'all',label:'All'}]} value={range} onChange={setRange} />`                                                                        |
| `Tabs { tabs, value, onChange }` + `useTabParam(ids)` + `TabPanel { id }`                                                                                                                                                                      | `const [tab, setTab] = useTabParam(['signals','positions'] as const)` then `<Tabs tabs={[{id:'signals',label:'Signals'},{id:'positions',label:'Positions',count:3}]} value={tab} onChange={setTab} />` and `<TabPanel id={tab}>…</TabPanel>` |
| `Field { label, htmlFor, hint?, error? }` + `Input` / `Select` / `Textarea` / `Range { value, min, max, step?, onValueChange, format? }` / `Checkbox { id, label }` — controls are `w-full`; size one in a toolbar with `max-w-48`, not `w-48` | `<Field label="Threshold" htmlFor="threshold"><Range id="threshold" value={t} min={1} max={SEVERE} onValueChange={setT} format={formatScore} /></Field>`                                                                                     |
| `Button { variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger', size?, icon?, loading? }` and `ButtonLink { to, … }`; icon-only needs `aria-label`                                                                                        | `<Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="Delete alert" onClick={remove} />`                                                                                                                                          |
| `Delta { value, digits?, suffix?, positiveIsBad?, showIcon? }` valence colour only                                                                                                                                                             | `<Delta value={scoreDelta(now, yesterday)} digits={1} positiveIsBad />`                                                                                                                                                                      |
| `DirectionBadge { direction: 'short' \| 'long' }`                                                                                                                                                                                              | `<DirectionBadge direction={p.direction} />`                                                                                                                                                                                                 |
| `ScoreValue { score, size?: 'sm' \| 'md' \| 'lg', withLevel? }` the only way to render a score                                                                                                                                                 | `<ScoreValue score={latest?.score ?? null} size="lg" withLevel />`                                                                                                                                                                           |
| `Skeleton { className?, inline? }`                                                                                                                                                                                                             | `<Skeleton inline className="h-4 w-10" />` while a cell's query loads                                                                                                                                                                        |

### DataTable

```tsx
const columns: Column<Row>[] = [
  { key: 'ticker', header: 'Ticker', mobileRole: 'primary', sortValue: (r) => r.ticker, render: (r) => r.ticker },
  { key: 'name', header: 'Name', hideBelow: 'md', render: (r) => r.name },
  { key: 'score', header: 'Score', numeric: true, sortValue: (r) => r.score, render: (r) => <ScoreValue score={r.score} /> },
  { key: 'd24', header: 'Δ24h', numeric: true, sortValue: (r) => r.d24, render: (r) => <Delta value={r.d24} digits={1} positiveIsBad /> },
]
<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} defaultSort={{ key: 'score', dir: 'desc' }}
  rowTo={(r) => `/institution/${r.id}`} toolbar={<Select …/>} emptyState={<EmptyState title="No banks match" />} />
```

Sortable headers are `<th aria-sort>` wrapping a `<button>`; missing values sort last in
both directions. `rowTo` puts a Link on the primary cell (do not render your own link
there); `onRowClick` puts a button there. Below `md` the header hides, a Sort select
appears in the toolbar, `hideBelow` columns disappear and the rest stack as label/value
pairs under the primary cell. Use `padded={false}` on the enclosing Card.

## Charts (`@/components/charts`)

- `ScoreChart { points: {date, score}[], range?, height?, showBands? }` line over the risk bands, dashed lines at WATCH / SHORT_ENTRY, Y floored at SEVERE.
- `Sparkline { points: number[], width? = 96, height? = 24, tone? }` plain SVG, aria-hidden.
- `DualAxisChart { data, left: {key,name,format?}, right, leftFloor?, leftReferenceY?, leftReferenceLabel? }` for lead-lag (score vs index-normalised price).
- `BarWithError { data: {label, value, error?, median?, n?, muted?}[], format?, positiveIsBad? }` for the event-study horizons.
- `chartTheme.ts`: `gridProps`, `axisProps`, `tooltipProps`, `legendProps`, `seriesColors`, `riskColor`, `scoreDomain` for any one-off chart. Dates are ISO strings; never `new Date('YYYY-MM-DD')`.

## Checklist (design brief §13)

error before empty · skeletons, not "Loading..." · empty states say what would fill them ·
counts are real (`count: 'exact'`) · windows are stated ("1,214 snapshots · Jun 15 – Nov 17") ·
"—" for null · one decimal for scores, never "%" · deltas carry their sign · dates
`MMM d, yyyy` · times UTC with suffix · red/green only for valence (P&L, return, model
right/wrong) · no raw hex · no 10px text · no bordered box inside a Card · every page
starts with `PageHeader` and uses `space-y-6` · every icon-only button has `aria-label` ·
every control has an id and a `<label htmlFor>`.
