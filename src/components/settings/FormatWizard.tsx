import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Upload, Wand2, Play, Download, Check, X, AlertTriangle, Loader2, Info,
} from 'lucide-react'
import {
  detectFormat, dryRunFormat, previewSample, downloadTemplate,
  type Candidate, type DetectResponse, type DryRunResponse, type GridPreview,
} from '@/services/formatWizard'
import type { VendorFormat } from '@/services/vendors'

type Draft = Partial<VendorFormat>
type RoleKind = 'row' | 'col' | 'cell'

interface Role {
  key: keyof VendorFormat & string
  kind: RoleKind
  labelKey: string
  tone: keyof typeof TONE
  required?: boolean
}

/**
 * Explicit class strings: Tailwind only keeps classes it can see literally, so
 * these cannot be assembled from a colour name at runtime.
 */
const TONE = {
  green: { band: 'bg-emerald-500/15', chip: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-500' },
  teal: { band: 'bg-teal-500/15', chip: 'bg-teal-500', text: 'text-teal-600', ring: 'ring-teal-500' },
  blue: { band: 'bg-sky-500/15', chip: 'bg-sky-500', text: 'text-sky-600', ring: 'ring-sky-500' },
  orange: { band: 'bg-orange-500/15', chip: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-500' },
  slate: { band: 'bg-slate-500/15', chip: 'bg-slate-500', text: 'text-slate-600', ring: 'ring-slate-500' },
  violet: { band: 'bg-violet-500/15', chip: 'bg-violet-500', text: 'text-violet-600', ring: 'ring-violet-500' },
  amber: { band: 'bg-amber-500/15', chip: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-500' },
  rose: { band: 'bg-rose-500/15', chip: 'bg-rose-500', text: 'text-rose-600', ring: 'ring-rose-500' },
  indigo: { band: 'bg-indigo-500/15', chip: 'bg-indigo-500', text: 'text-indigo-600', ring: 'ring-indigo-500' },
  cyan: { band: 'bg-cyan-500/15', chip: 'bg-cyan-500', text: 'text-cyan-600', ring: 'ring-cyan-500' },
  fuchsia: { band: 'bg-fuchsia-500/15', chip: 'bg-fuchsia-500', text: 'text-fuchsia-600', ring: 'ring-fuchsia-500' },
  lime: { band: 'bg-lime-600/15', chip: 'bg-lime-600', text: 'text-lime-700', ring: 'ring-lime-600' },
} as const

const ROLES: Role[] = [
  { key: 'header_row', kind: 'row', labelKey: 'wizard.roleHeaderRow', tone: 'green', required: true },
  { key: 'id_header_row', kind: 'row', labelKey: 'wizard.roleIdHeaderRow', tone: 'teal' },
  { key: 'lower_limit_row', kind: 'row', labelKey: 'wizard.roleLowerRow', tone: 'blue' },
  { key: 'upper_limit_row', kind: 'row', labelKey: 'wizard.roleUpperRow', tone: 'orange' },
  { key: 'unit_row', kind: 'row', labelKey: 'wizard.roleUnitRow', tone: 'slate' },
  { key: 'data_start_row', kind: 'row', labelKey: 'wizard.roleDataStart', tone: 'violet', required: true },
  { key: 'electrical_start_col', kind: 'col', labelKey: 'wizard.roleElecCol', tone: 'amber', required: true },
  { key: 'wafer_id_col', kind: 'col', labelKey: 'wizard.roleWaferCol', tone: 'rose' },
  { key: 'bin_col', kind: 'col', labelKey: 'wizard.roleBinCol', tone: 'indigo', required: true },
  { key: 'x_coord_col', kind: 'col', labelKey: 'wizard.roleXCol', tone: 'cyan' },
  { key: 'y_coord_col', kind: 'col', labelKey: 'wizard.roleYCol', tone: 'cyan' },
  { key: 'product_id_cell', kind: 'cell', labelKey: 'wizard.roleProductCell', tone: 'fuchsia' },
  { key: 'lot_id_cell', kind: 'cell', labelKey: 'wizard.roleLotCell', tone: 'lime' },
]

const WAFER_SOURCES = ['column', 'cell', 'label', 'filename', 'single'] as const

/** Anything below this is shown as needing a human decision. */
const LOW_CONFIDENCE = 0.7

function colName(n: number): string {
  let s = ''
  let v = n
  while (v > 0) {
    const r = (v - 1) % 26
    s = String.fromCharCode(65 + r) + s
    v = Math.floor((v - 1) / 26)
  }
  return s
}

function parseCellRef(ref: unknown): [number, number] | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const s = ref.trim()
  if (s.includes(',')) {
    const [r, c] = s.split(',').map((x) => Number(x.trim()))
    return Number.isFinite(r) && Number.isFinite(c) ? [r, c] : null
  }
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(s)
  if (!m) return null
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return [Number(m[2]), col]
}

interface Props {
  vendorCode: string
  onApply: (template: Draft) => void
  onClose: () => void
}

export default function FormatWizard({ vendorCode, onApply, onClose }: Props) {
  const { t } = useTranslation('settings')
  const fileRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<'detect' | 'dry' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectResponse | null>(null)
  const [grid, setGrid] = useState<GridPreview | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [armed, setArmed] = useState<Role | null>(null)
  const [dry, setDry] = useState<DryRunResponse | null>(null)
  const [useAi, setUseAi] = useState(true)

  const evidence: Record<string, Candidate | null> = detected?.fields ?? {}

  const runDetect = useCallback(async (f: File) => {
    setBusy('detect'); setError(null); setDry(null)
    try {
      const res = await detectFormat(f, { useAi })
      setDetected(res)
      setGrid(res.preview)
      setDraft(res.template)
      setArmed(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [useAi])

  const pickFile = (f: File | null) => {
    if (f) void runDetect(f)
  }

  const runDryRun = async () => {
    if (!detected) return
    setBusy('dry'); setError(null)
    try {
      setDry(await dryRunFormat(detected.fileToken, draft, vendorCode))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const switchSheet = async (sheet: string) => {
    if (!detected) return
    setDraft((d) => ({ ...d, sheet_selector: sheet }))
    setGrid(await previewSample(detected.fileToken, sheet))
  }

  const assign = (row: number, col: number) => {
    if (!armed) return
    const value = armed.kind === 'row' ? row : armed.kind === 'col' ? col : `${row},${col}`
    setDraft((d) => ({ ...d, [armed.key]: value }))
    setArmed(null)
    setDry(null)
  }

  /** Which roles land on each row / column / cell, for the grid overlay. */
  const marks = useMemo(() => {
    const rows = new Map<number, Role[]>()
    const cols = new Map<number, Role[]>()
    const cells = new Map<string, Role[]>()
    for (const role of ROLES) {
      const v = draft[role.key] as unknown
      if (v === null || v === undefined || v === '') continue
      if (role.kind === 'row' && typeof v === 'number') {
        rows.set(v, [...(rows.get(v) ?? []), role])
      } else if (role.kind === 'col' && typeof v === 'number') {
        cols.set(v, [...(cols.get(v) ?? []), role])
      } else if (role.kind === 'cell') {
        const rc = parseCellRef(v)
        if (rc) {
          const k = `${rc[0]},${rc[1]}`
          cells.set(k, [...(cells.get(k) ?? []), role])
        }
      }
    }
    return { rows, cols, cells }
  }, [draft])

  const waferSource = (draft.wafer_id_source as string) ?? 'column'
  const missing = detected?.missing ?? []

  const isWeak = (key: string) => {
    if (missing.includes(key)) return true
    const c = evidence[key]
    return !!c && c.confidence < LOW_CONFIDENCE
  }

  /* ── upload step ── */
  if (!detected) {
    return (
      <Shell title={t('wizard.title')} onClose={onClose}>
        <div className="p-10 flex flex-col items-center gap-6">
          <p className="text-sm text-text-secondary text-center max-w-lg">
            {t('wizard.introText')}
          </p>
          <label className="flex items-center gap-2.5 px-6 py-3 bg-accent text-white
                            font-heading text-[13px] uppercase tracking-[1px] cursor-pointer
                            hover:opacity-90 transition-opacity">
            {busy === 'detect'
              ? <Loader2 size={16} className="animate-spin" />
              : <Upload size={16} />}
            {busy === 'detect' ? t('wizard.detecting') : t('wizard.chooseFile')}
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".xlsx,.xlsm,.xls,.csv,.txt"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer">
            <input type="checkbox" checked={useAi}
                   onChange={(e) => setUseAi(e.target.checked)} />
            {t('wizard.useAi')}
          </label>
          <p className="text-[11px] text-text-muted">.xlsx / .xlsm / .xls / .csv / .txt</p>
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </Shell>
    )
  }

  /* ── review step ── */
  return (
    <Shell title={`${t('wizard.title')} — ${detected.fileName}`} onClose={onClose} wide>
      <div className="flex flex-col lg:flex-row gap-0 min-h-0 flex-1">
        {/* left: spreadsheet */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border-light">
          <div className="px-4 py-2.5 border-b border-border-light flex items-center gap-3 flex-wrap">
            {armed ? (
              <span className={`text-[12px] font-semibold ${TONE[armed.tone].text}`}>
                {t('wizard.armedHint', { role: t(armed.labelKey), kind: t(`wizard.kind_${armed.kind}`) })}
              </span>
            ) : (
              <span className="text-[12px] text-text-muted">{t('wizard.pickRoleHint')}</span>
            )}
            {armed && (
              <button onClick={() => setArmed(null)}
                      className="text-[11px] text-text-tertiary hover:text-error">
                {t('wizard.cancelArm')}
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {grid && grid.sheets.length > 1 && (
                <select
                  value={(draft.sheet_selector as string) ?? grid.sheetUsed}
                  onChange={(e) => void switchSheet(e.target.value)}
                  className="text-[11px] border border-border-light px-2 py-1 bg-bg-page"
                >
                  {grid.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <span className="text-[11px] text-text-muted">
                {grid?.nRows} × {grid?.nCols}
                {grid?.delimiter ? ` · ${grid.delimiter}` : ''}
                {grid?.encoding ? ` · ${grid.encoding}` : ''}
              </span>
            </div>
          </div>

          <div className="overflow-auto flex-1 max-h-[52vh]">
            <table className="border-collapse font-mono text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-bg-page border border-border-light px-2 py-1 sticky left-0 z-20" />
                  {Array.from({ length: grid?.nCols ?? 0 }, (_, i) => i + 1).map((c) => {
                    const hit = marks.cols.get(c)
                    return (
                      <th
                        key={c}
                        onClick={() => armed?.kind === 'col' && assign(1, c)}
                        title={hit?.map((r) => t(r.labelKey)).join(' / ')}
                        className={`border border-border-light px-2 py-1 font-semibold text-text-muted
                          ${hit ? TONE[hit[0].tone].band : 'bg-bg-page'}
                          ${armed?.kind === 'col' ? 'cursor-pointer hover:bg-accent/20' : ''}`}
                      >
                        {colName(c)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(grid?.rows ?? []).map((row, ri) => {
                  const r = ri + 1
                  const rowHit = marks.rows.get(r)
                  return (
                    <tr key={r} className={rowHit ? TONE[rowHit[0].tone].band : undefined}>
                      <td
                        onClick={() => armed?.kind === 'row' && assign(r, 1)}
                        title={rowHit?.map((x) => t(x.labelKey)).join(' / ')}
                        className={`border border-border-light px-2 py-1 text-right text-text-muted
                          font-semibold sticky left-0 bg-bg-page z-10
                          ${armed?.kind === 'row' ? 'cursor-pointer hover:bg-accent/20' : ''}`}
                      >
                        {r}
                      </td>
                      {row.map((cell, ci) => {
                        const c = ci + 1
                        const cellHit = marks.cells.get(`${r},${c}`)
                        const colHit = marks.cols.get(c)
                        return (
                          <td
                            key={c}
                            onClick={() => armed && assign(r, c)}
                            className={`border border-border-light px-2 py-1 max-w-[150px] overflow-hidden
                              ${cellHit ? `${TONE[cellHit[0].tone].band} ring-2 ring-inset ${TONE[cellHit[0].tone].ring}` : ''}
                              ${!cellHit && !rowHit && colHit ? TONE[colHit[0].tone].band : ''}
                              ${armed ? 'cursor-pointer hover:bg-accent/20' : ''}`}
                          >
                            {cell ?? ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* dry-run results */}
          <div className="border-t border-border-light p-4 overflow-auto max-h-[26vh]">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => void runDryRun()} disabled={busy === 'dry'}
                className="flex items-center gap-2 px-4 py-2 border border-accent text-accent
                           font-heading text-[12px] uppercase tracking-[1px]
                           hover:bg-accent hover:text-white transition-colors disabled:opacity-50"
              >
                {busy === 'dry' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {t('wizard.dryRun')}
              </button>
              <span className="text-[11px] text-text-muted">{t('wizard.dryRunHint')}</span>
            </div>
            {dry && <DryRunPanel dry={dry} t={t} />}
          </div>
        </div>

        {/* right: roles */}
        <div className="w-full lg:w-[380px] shrink-0 overflow-auto max-h-[80vh] p-4 flex flex-col gap-4">
          {detected.warnings.map((w, i) => (
            <Banner key={i} tone="warn">{w}</Banner>
          ))}
          {detected.conflicts.map((c, i) => (
            <Banner key={`c${i}`} tone="warn">
              {t('wizard.conflict', { field: c.field, ours: String(c.proposed), theirs: String(c.shouldBe) })}
            </Banner>
          ))}

          <Section title={t('wizard.waferSource')}>
            <div className="flex flex-wrap gap-1.5">
              {WAFER_SOURCES.map((s) => (
                <button
                  key={s}
                  onClick={() => setDraft((d) => ({ ...d, wafer_id_source: s }))}
                  className={`px-2.5 py-1 text-[11px] border transition-colors ${
                    waferSource === s
                      ? 'bg-accent text-white border-accent'
                      : 'border-border-light text-text-tertiary hover:border-accent'
                  }`}
                >
                  {t(`wizard.src_${s}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-text-muted mt-2">{t(`wizard.srcHint_${waferSource}`)}</p>
            {waferSource === 'cell' && (
              <TextField label={t('wizard.cellAddress')} placeholder="B4 或 4,2"
                         value={(draft.wafer_id_cell as string) ?? ''}
                         onChange={(v) => setDraft((d) => ({ ...d, wafer_id_cell: v || null }))} />
            )}
            {waferSource === 'label' && (
              <TextField label={t('wizard.labelText')} placeholder="Wafer number"
                         value={(draft.wafer_id_label as string) ?? ''}
                         onChange={(v) => setDraft((d) => ({ ...d, wafer_id_label: v || null }))} />
            )}
            {(waferSource === 'filename' || waferSource === 'cell' || waferSource === 'label') && (
              <TextField label={t('wizard.pattern')} placeholder="-(\d+)$"
                         value={(draft.wafer_id_pattern as string) ?? ''}
                         onChange={(v) => setDraft((d) => ({ ...d, wafer_id_pattern: v || null }))} />
            )}
          </Section>

          <Section title={t('wizard.roles')}>
            <div className="flex flex-col gap-1">
              {ROLES.filter((r) => !(r.key === 'wafer_id_col' && waferSource !== 'column'))
                .map((role) => (
                  <RoleRow
                    key={role.key} role={role} t={t}
                    value={draft[role.key] as number | string | null | undefined}
                    candidate={evidence[role.key] ?? null}
                    weak={isWeak(role.key)}
                    armed={armed?.key === role.key}
                    onArm={() => setArmed(armed?.key === role.key ? null : role)}
                    onSet={(v) => { setDraft((d) => ({ ...d, [role.key]: v })); setDry(null) }}
                  />
                ))}
            </div>
          </Section>
        </div>
      </div>

      <div className="border-t border-border-light px-5 py-3 flex items-center gap-3">
        {error && <span className="text-[12px] text-error">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => downloadTemplate(String(draft.format_name || vendorCode), draft)}
            className="flex items-center gap-2 px-4 py-2 border border-border-light
                       text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            <Download size={14} /> {t('wizard.download')}
          </button>
          <button
            onClick={() => onApply(draft)}
            className="flex items-center gap-2 px-5 py-2 bg-accent text-white
                       font-heading text-[12px] uppercase tracking-[1px] hover:opacity-90"
          >
            <Check size={14} /> {t('wizard.apply')}
          </button>
        </div>
      </div>
    </Shell>
  )
}

/* ── pieces ── */

function Shell({ title, onClose, wide, children }: {
  title: string; onClose: () => void; wide?: boolean; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`bg-bg-card border border-border-light shadow-2xl flex flex-col
                       max-h-[92vh] w-full ${wide ? 'max-w-[1400px]' : 'max-w-2xl'}`}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-light">
          <Wand2 size={16} className="text-accent" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]">{title}</span>
          <button onClick={onClose} className="ml-auto text-text-muted hover:text-error">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-heading text-[11px] font-bold uppercase tracking-[1.5px] text-text-muted">
        {title}
      </div>
      {children}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls = tone === 'error'
    ? 'border-error/40 bg-error/10 text-error'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
  return (
    <div className={`border px-3 py-2 text-[11px] leading-relaxed flex gap-2 ${cls}`}>
      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 mt-2">
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <input
        value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border-light px-2 py-1.5 text-[12px] font-mono bg-bg-page
                   focus:border-accent outline-none"
      />
    </label>
  )
}

function RoleRow({ role, t, value, candidate, weak, armed, onArm, onSet }: {
  role: Role
  t: (k: string, o?: Record<string, unknown>) => string
  value: number | string | null | undefined
  candidate: Candidate | null
  weak: boolean
  armed: boolean
  onArm: () => void
  onSet: (v: number | string | null) => void
}) {
  const tone = TONE[role.tone]
  const shown = value === null || value === undefined ? '' : String(value)
  const unset = shown === ''
  return (
    <div className={`border px-2.5 py-2 flex flex-col gap-1.5 transition-colors ${
      armed ? `border-accent bg-accent/5`
        : weak || (role.required && unset) ? 'border-error/50 bg-error/5'
          : 'border-border-light'
    }`}>
      <div className="flex items-center gap-2">
        <button onClick={onArm} title={t('wizard.clickToAssign')}
                className={`w-2.5 h-2.5 shrink-0 ${tone.chip} ${armed ? 'ring-2 ring-offset-1 ring-accent' : ''}`} />
        <span className="text-[12px] text-text-secondary flex-1 truncate">{t(role.labelKey)}</span>
        <input
          value={shown}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (!raw) return onSet(null)
            onSet(role.kind === 'cell' ? raw : (Number(raw) || null))
          }}
          placeholder={role.kind === 'cell' ? 'B4' : '—'}
          className="w-[74px] border border-border-light px-1.5 py-1 text-[12px] font-mono
                     text-right bg-bg-page focus:border-accent outline-none"
        />
      </div>
      {(role.required && unset)
        ? <span className="text-[10px] text-error flex items-center gap-1">
            <AlertTriangle size={10} /> {t('wizard.requiredMissing')}
          </span>
        : candidate && (
          <span className={`text-[10px] flex items-start gap-1 ${weak ? 'text-error' : 'text-text-muted'}`}>
            <Info size={10} className="shrink-0 mt-0.5" />
            <span>
              {candidate.evidence}
              <b className="ml-1">{Math.round(candidate.confidence * 100)}%</b>
              {candidate.source === 'ai' && <span className="ml-1 opacity-70">· AI</span>}
            </span>
          </span>
        )}
    </div>
  )
}

function DryRunPanel({ dry, t }: {
  dry: DryRunResponse
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (!dry.ok) return <Banner tone="error">{dry.error}</Banner>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
        <Stat label={t('wizard.statWafers')} value={dry.waferCount} />
        <Stat label={t('wizard.statRows')} value={dry.dataRows} />
        <Stat label={t('wizard.statParams')} value={dry.paramNames.length} />
        <Stat label={t('wizard.statProduct')} value={dry.productId ?? '—'} />
        <Stat label={t('wizard.statLot')} value={dry.lotId ?? '—'} />
      </div>
      {dry.waferIds.length > 0 && (
        <div className="text-[11px] text-text-muted">
          {t('wizard.waferIds')}: <span className="font-mono">{dry.waferIds.slice(0, 12).join(', ')}</span>
        </div>
      )}
      {dry.issues.map((issue, i) => <Banner key={i} tone="warn">{issue}</Banner>)}
      {dry.sampleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-[11px] font-mono border-collapse">
            <thead>
              <tr className="text-text-muted">
                {Object.keys(dry.sampleRows[0]).map((k) => (
                  <th key={k} className="border border-border-light px-2 py-1 text-left">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dry.sampleRows.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="border border-border-light px-2 py-1">{String(v ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-text-muted">{label}</span>
      <b className="text-text-primary">{value}</b>
    </span>
  )
}
