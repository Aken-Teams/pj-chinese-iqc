import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Upload, Wand2, Play, Download, Check, X, AlertTriangle, Loader2,
  ChevronDown, History, FileClock, Sparkles, Cpu,
} from 'lucide-react'
import {
  detectFormat, dryRunFormat, previewSample, downloadTemplate,
  inferFromCell, inferFromFilename, saveTemplate, getSamples, getRevisions,
  type Candidate, type DetectResponse, type DryRunResponse, type GridPreview,
  type InferOption, type InferResult, type InferRole,
  type Revision, type SavedSample,
} from '@/services/formatWizard'
import type { VendorFormat } from '@/services/vendors'

type Draft = Partial<VendorFormat>

/**
 * Explicit class strings: Tailwind only keeps what it can see literally, so
 * these cannot be assembled from a colour name at runtime.
 */
const TONE = {
  green: { band: 'bg-emerald-500/15', chip: 'bg-emerald-500', text: 'text-emerald-600' },
  teal: { band: 'bg-teal-500/15', chip: 'bg-teal-500', text: 'text-teal-600' },
  blue: { band: 'bg-sky-500/15', chip: 'bg-sky-500', text: 'text-sky-600' },
  orange: { band: 'bg-orange-500/15', chip: 'bg-orange-500', text: 'text-orange-600' },
  slate: { band: 'bg-slate-500/15', chip: 'bg-slate-500', text: 'text-slate-600' },
  violet: { band: 'bg-violet-500/15', chip: 'bg-violet-500', text: 'text-violet-600' },
  amber: { band: 'bg-amber-500/15', chip: 'bg-amber-500', text: 'text-amber-600' },
  rose: { band: 'bg-rose-500/15', chip: 'bg-rose-500', text: 'text-rose-600' },
  indigo: { band: 'bg-indigo-500/15', chip: 'bg-indigo-500', text: 'text-indigo-600' },
  cyan: { band: 'bg-cyan-500/15', chip: 'bg-cyan-500', text: 'text-cyan-600' },
  fuchsia: { band: 'bg-fuchsia-500/15', chip: 'bg-fuchsia-500', text: 'text-fuchsia-600' },
  lime: { band: 'bg-lime-600/15', chip: 'bg-lime-600', text: 'text-lime-700' },
} as const

type Tone = keyof typeof TONE

/** Roles set by clicking a row number. */
const ROW_ROLES = [
  { key: 'header_row', labelKey: 'wizard.roleHeaderRow', tone: 'green' as Tone, required: true },
  { key: 'data_start_row', labelKey: 'wizard.roleDataStart', tone: 'violet' as Tone, required: true },
  { key: 'lower_limit_row', labelKey: 'wizard.roleLowerRow', tone: 'blue' as Tone },
  { key: 'upper_limit_row', labelKey: 'wizard.roleUpperRow', tone: 'orange' as Tone },
  { key: 'unit_row', labelKey: 'wizard.roleUnitRow', tone: 'slate' as Tone },
  { key: 'id_header_row', labelKey: 'wizard.roleIdHeaderRow', tone: 'teal' as Tone },
] as const

/** Roles set by clicking a column header. */
const COL_ROLES = [
  { key: 'electrical_start_col', labelKey: 'wizard.roleElecCol', tone: 'amber' as Tone, required: true },
  { key: 'bin_col', labelKey: 'wizard.roleBinCol', tone: 'indigo' as Tone, required: true },
  { key: 'x_coord_col', labelKey: 'wizard.roleXCol', tone: 'cyan' as Tone },
  { key: 'y_coord_col', labelKey: 'wizard.roleYCol', tone: 'cyan' as Tone },
] as const

/** Roles set by clicking a cell — these are the ones that used to demand a
 *  "source" choice and a regex. Now the click is the whole interaction. */
const CELL_ROLES = [
  { role: 'wafer' as InferRole, labelKey: 'wizard.cellIsWafer', tone: 'rose' as Tone },
  { role: 'product' as InferRole, labelKey: 'wizard.cellIsProduct', tone: 'fuchsia' as Tone },
  { role: 'lot' as InferRole, labelKey: 'wizard.cellIsLot', tone: 'lime' as Tone },
] as const

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

type Selection =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'row'; row: number }
  | { kind: 'col'; col: number }

interface Props {
  vendorId: number
  vendorCode: string
  formatId?: number | null
  site?: string
  onApply: (template: Draft) => void
  onSaved?: (formatId: number) => void
  onClose: () => void
}

export default function FormatWizard({
  vendorId, vendorCode, formatId, site, onApply, onSaved, onClose,
}: Props) {
  const { t } = useTranslation('settings')

  const [busy, setBusy] = useState<'detect' | 'dry' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectResponse | null>(null)
  const [grid, setGrid] = useState<GridPreview | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [dry, setDry] = useState<DryRunResponse | null>(null)
  const [useAi, setUseAi] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [selection, setSelection] = useState<Selection | null>(null)
  const [infer, setInfer] = useState<{ role: InferRole; result: InferResult } | null>(null)
  const [filenameOptions, setFilenameOptions] = useState<
    { role: 'product' | 'lot'; options: InferOption[] } | null>(null)

  const [samples, setSamples] = useState<SavedSample[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const evidence: Record<string, Candidate | null> = detected?.fields ?? {}

  // Saved samples let the preview be reopened without finding the file again —
  // which the 無錫 users cannot reliably do, their file names arriving mojibake.
  useEffect(() => {
    if (!formatId) return
    getSamples(formatId).then(setSamples).catch(() => setSamples([]))
    getRevisions(formatId).then(setRevisions).catch(() => setRevisions([]))
  }, [formatId])

  const applyDetection = useCallback((res: DetectResponse) => {
    setDetected(res)
    setGrid(res.preview)
    setDraft(res.template)
    setSelection(null)
    setInfer(null)
    setDry(null)
  }, [])

  const runDetect = useCallback(async (f: File) => {
    setBusy('detect'); setError(null)
    try {
      applyDetection(await detectFormat(f, { useAi }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [useAi, applyDetection])

  const reopenSample = async (sample: SavedSample) => {
    setBusy('detect'); setError(null)
    try {
      const preview = await previewSample(sample.fileToken, sample.sheetSelector ?? undefined)
      setGrid(preview)
      setDetected({
        fileToken: sample.fileToken, fileName: sample.fileName, stats: null,
        preview, fields: {}, warnings: [], missing: [], conflicts: [], template: {},
      })
      setDry(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
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

  const persist = async () => {
    if (!detected) return
    setBusy('save'); setError(null)
    try {
      const res = await saveTemplate({
        vendor_id: vendorId, template: draft, format_id: formatId ?? null,
        file_token: detected.fileToken, file_name: detected.fileName, site: site ?? '',
      })
      onSaved?.(res.id)
      onApply(draft)
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

  const setField = (patch: Draft) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDry(null)
  }

  const askInfer = async (role: InferRole) => {
    if (!detected || selection?.kind !== 'cell') return
    const result = await inferFromCell(
      detected.fileToken, selection.row, selection.col, role,
      { sheet: (draft.sheet_selector as string) ?? undefined,
        dataStartRow: (draft.data_start_row as number) ?? null })
    setInfer({ role, result })
  }

  const askFilename = async (role: 'product' | 'lot') => {
    if (!detected) return
    setFilenameOptions({ role, options: await inferFromFilename(detected.fileName, role) })
  }

  /** Which roles land on each row / column / cell, for the grid overlay. */
  const marks = useMemo(() => {
    const rows = new Map<number, Tone>()
    const cols = new Map<number, Tone>()
    const cells = new Map<string, Tone>()
    for (const r of ROW_ROLES) {
      const v = draft[r.key as keyof VendorFormat]
      if (typeof v === 'number') rows.set(v, r.tone)
    }
    for (const c of COL_ROLES) {
      const v = draft[c.key as keyof VendorFormat]
      if (typeof v === 'number') cols.set(v, c.tone)
    }
    if (draft.wafer_id_source === 'column' && typeof draft.wafer_id_col === 'number') {
      cols.set(draft.wafer_id_col, 'rose')
    }
    for (const [key, tone] of [
      ['wafer_id_cell', 'rose'], ['product_id_cell', 'fuchsia'], ['lot_id_cell', 'lime'],
    ] as const) {
      const rc = parseCellRef(draft[key as keyof VendorFormat])
      if (rc) cells.set(`${rc[0]},${rc[1]}`, tone)
    }
    return { rows, cols, cells }
  }, [draft])

  const missing = detected?.missing ?? []
  const isWeak = (key: string) => {
    if (missing.includes(key)) return true
    const c = evidence[key]
    return !!c && c.confidence < LOW_CONFIDENCE
  }

  /* ── step 1: pick a file ── */
  if (!detected) {
    return (
      <Shell title={t('wizard.title')} onClose={onClose}>
        <div className="p-8 flex flex-col items-center gap-5">
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
            <input type="file" className="hidden" accept=".xlsx,.xlsm,.xls,.csv,.txt"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void runDetect(f) }} />
          </label>
          <label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            {t('wizard.useAi')}
          </label>
          <p className="text-[11px] text-text-muted">.xlsx / .xlsm / .xls / .csv / .txt</p>

          {samples.length > 0 && (
            <div className="w-full max-w-lg border-t border-border-light pt-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-heading uppercase
                              tracking-[1.5px] text-text-muted">
                <FileClock size={13} /> {t('wizard.savedSamples')}
              </div>
              {samples.map((s) => (
                <button key={s.id} onClick={() => void reopenSample(s)}
                        className="flex items-center gap-2 text-left px-3 py-2 border
                                   border-border-light hover:border-accent transition-colors">
                  <span className="text-[12px] flex-1 truncate">{s.fileName}</span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {s.uploadedBy ? `${s.uploadedBy} · ` : ''}{s.uploadedAt}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </Shell>
    )
  }

  /* ── step 2: confirm by clicking ── */
  const selectedValue = selection?.kind === 'cell'
    ? grid?.rows[selection.row - 1]?.[selection.col - 1] ?? '' : ''

  return (
    <Shell title={`${t('wizard.title')} — ${detected.fileName}`} onClose={onClose} wide>
      <div className="flex flex-col lg:flex-row min-h-0 flex-1">
        {/* left: the sheet */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border-light">
          <div className="px-4 py-2 border-b border-border-light flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-text-muted">{t('wizard.clickHint')}</span>
            <div className="ml-auto flex items-center gap-2">
              {grid && grid.sheets.length > 1 && (
                <select value={(draft.sheet_selector as string) ?? grid.sheetUsed}
                        onChange={(e) => void switchSheet(e.target.value)}
                        className="text-[11px] border border-border-light px-2 py-1 bg-bg-page">
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

          <div className="overflow-auto flex-1 max-h-[46vh]">
            <table className="border-collapse font-mono text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-bg-page border border-border-light px-2 py-1 sticky left-0 z-20" />
                  {Array.from({ length: grid?.nCols ?? 0 }, (_, i) => i + 1).map((c) => {
                    const tone = marks.cols.get(c)
                    const active = selection?.kind === 'col' && selection.col === c
                    return (
                      <th key={c}
                          onClick={() => { setSelection({ kind: 'col', col: c }); setInfer(null) }}
                          className={`border border-border-light px-2 py-1 font-semibold cursor-pointer
                            hover:bg-accent/20 transition-colors
                            ${tone ? TONE[tone].band : 'bg-bg-page'}
                            ${active ? 'ring-2 ring-inset ring-accent' : ''}`}>
                        {colName(c)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(grid?.rows ?? []).map((row, ri) => {
                  const r = ri + 1
                  const rowTone = marks.rows.get(r)
                  const rowActive = selection?.kind === 'row' && selection.row === r
                  return (
                    <tr key={r} className={rowTone ? TONE[rowTone].band : undefined}>
                      <td onClick={() => { setSelection({ kind: 'row', row: r }); setInfer(null) }}
                          className={`border border-border-light px-2 py-1 text-right text-text-muted
                            font-semibold sticky left-0 bg-bg-page z-10 cursor-pointer
                            hover:bg-accent/20 ${rowActive ? 'ring-2 ring-inset ring-accent' : ''}`}>
                        {r}
                      </td>
                      {row.map((cell, ci) => {
                        const c = ci + 1
                        const cellTone = marks.cells.get(`${r},${c}`)
                        const colTone = marks.cols.get(c)
                        const active = selection?.kind === 'cell'
                          && selection.row === r && selection.col === c
                        return (
                          <td key={c}
                              onClick={() => { setSelection({ kind: 'cell', row: r, col: c }); setInfer(null) }}
                              className={`border border-border-light px-2 py-1 max-w-[150px]
                                overflow-hidden cursor-pointer hover:bg-accent/20
                                ${cellTone ? TONE[cellTone].band : ''}
                                ${!cellTone && !rowTone && colTone ? TONE[colTone].band : ''}
                                ${active ? 'ring-2 ring-inset ring-accent' : ''}`}>
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

          {/* dry run */}
          <div className="border-t border-border-light p-3 overflow-auto max-h-[30vh]">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button onClick={() => void runDryRun()} disabled={busy === 'dry'}
                      className="flex items-center gap-2 px-4 py-2 border border-accent text-accent
                                 font-heading text-[12px] uppercase tracking-[1px]
                                 hover:bg-accent hover:text-white transition-colors disabled:opacity-50">
                {busy === 'dry' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {t('wizard.dryRun')}
              </button>
              <span className="text-[11px] text-text-muted">{t('wizard.dryRunHint')}</span>
            </div>
            {dry && <DryRunPanel dry={dry} t={t} />}
          </div>
        </div>

        {/* right: what the click means */}
        <div className="w-full lg:w-[400px] shrink-0 overflow-auto max-h-[80vh] p-4 flex flex-col gap-4">
          {detected.stats && <StatsBar stats={detected.stats} t={t} />}

          {detected.warnings.map((w, i) => <Banner key={i} tone="warn">{w}</Banner>)}

          {/* the selection drives everything below */}
          {!selection && (
            <div className="border border-dashed border-border-light px-3 py-6 text-center">
              <p className="text-[12px] text-text-muted">{t('wizard.nothingSelected')}</p>
            </div>
          )}

          {selection?.kind === 'row' && (
            <Section title={t('wizard.rowIs', { row: selection.row })}>
              <div className="flex flex-wrap gap-1.5">
                {ROW_ROLES.map((role) => (
                  <RoleButton key={role.key} tone={role.tone}
                              active={draft[role.key as keyof VendorFormat] === selection.row}
                              label={t(role.labelKey)}
                              onClick={() => setField({ [role.key]: selection.row } as Draft)} />
                ))}
              </div>
            </Section>
          )}

          {selection?.kind === 'col' && (
            <Section title={t('wizard.colIs', { col: colName(selection.col) })}>
              <div className="flex flex-wrap gap-1.5">
                {COL_ROLES.map((role) => (
                  <RoleButton key={role.key} tone={role.tone}
                              active={draft[role.key as keyof VendorFormat] === selection.col}
                              label={t(role.labelKey)}
                              onClick={() => setField({ [role.key]: selection.col } as Draft)} />
                ))}
                <RoleButton tone="rose"
                            active={draft.wafer_id_source === 'column'
                              && draft.wafer_id_col === selection.col}
                            label={t('wizard.roleWaferCol')}
                            onClick={() => setField({
                              wafer_id_source: 'column', wafer_id_col: selection.col,
                              wafer_id_cell: null, wafer_id_label: null, wafer_id_pattern: null,
                            })} />
              </div>
            </Section>
          )}

          {selection?.kind === 'cell' && (
            <Section title={t('wizard.cellIs', {
              ref: `${colName(selection.col)}${selection.row}`,
              value: String(selectedValue ?? '').slice(0, 40) || '—',
            })}>
              <div className="flex flex-wrap gap-1.5">
                {CELL_ROLES.map((role) => (
                  <RoleButton key={role.role} tone={role.tone}
                              active={infer?.role === role.role}
                              label={t(role.labelKey)}
                              onClick={() => void askInfer(role.role)} />
                ))}
              </div>
              {infer && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {infer.result.options.length === 0 && (
                    <p className="text-[11px] text-text-muted">{t('wizard.noOptions')}</p>
                  )}
                  {infer.result.options.map((o) => (
                    <OptionRow key={o.key} option={o}
                               onPick={() => { setField(o.fields as Draft); setInfer(null) }} />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* file-name fallback: only worth offering when the sheet gave nothing */}
          {(!draft.product_id_cell && !draft.product_id_col && !draft.product_id_label) && (
            <Section title={t('wizard.filenameFallback')}>
              <p className="text-[11px] text-text-muted mb-1.5">{t('wizard.filenameHint')}</p>
              <div className="flex gap-1.5">
                <RoleButton tone="fuchsia" label={t('wizard.fromFilenameProduct')}
                            onClick={() => void askFilename('product')} />
                <RoleButton tone="lime" label={t('wizard.fromFilenameLot')}
                            onClick={() => void askFilename('lot')} />
              </div>
              {filenameOptions && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {filenameOptions.options.length === 0
                    ? <p className="text-[11px] text-text-muted">{t('wizard.noOptions')}</p>
                    : filenameOptions.options.map((o) => (
                      <OptionRow key={o.key} option={o}
                                 onPick={() => { setField(o.fields as Draft); setFilenameOptions(null) }} />
                    ))}
                </div>
              )}
            </Section>
          )}

          <CurrentMapping draft={draft} evidence={evidence} isWeak={isWeak} t={t} />

          <Collapse title={t('wizard.advanced')} open={showAdvanced}
                    onToggle={() => setShowAdvanced((v) => !v)}>
            <AdvancedFields draft={draft} onChange={setField} t={t} />
          </Collapse>

          {formatId ? (
            <Collapse title={t('wizard.history')} open={showHistory}
                      onToggle={() => setShowHistory((v) => !v)} icon={<History size={12} />}>
              <RevisionList revisions={revisions} t={t} />
            </Collapse>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border-light px-5 py-3 flex items-center gap-3">
        {error && <span className="text-[12px] text-error">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => downloadTemplate(String(draft.format_name || vendorCode), draft)}
                  className="flex items-center gap-2 px-4 py-2 border border-border-light
                             text-[12px] text-text-secondary hover:border-accent hover:text-accent">
            <Download size={14} /> {t('wizard.download')}
          </button>
          <button onClick={() => onApply(draft)}
                  className="px-4 py-2 border border-border-light text-[12px]
                             text-text-secondary hover:border-accent hover:text-accent">
            {t('wizard.applyOnly')}
          </button>
          <button onClick={() => void persist()} disabled={busy === 'save'}
                  className="flex items-center gap-2 px-5 py-2 bg-accent text-white
                             font-heading text-[12px] uppercase tracking-[1px]
                             hover:opacity-90 disabled:opacity-50">
            {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {t('wizard.saveTemplate')}
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
                       max-h-[92vh] w-full ${wide ? 'max-w-[1440px]' : 'max-w-2xl'}`}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-light">
          <Wand2 size={16} className="text-accent" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px] truncate">
            {title}
          </span>
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

function Collapse({ title, open, onToggle, icon, children }: {
  title: string; open: boolean; onToggle: () => void
  icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="border border-border-light">
      <button onClick={onToggle}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-heading
                         uppercase tracking-[1.5px] text-text-muted hover:text-accent">
        {icon}
        {title}
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function RoleButton({ tone, label, active, onClick }: {
  tone: Tone; label: string; active?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border transition-colors ${
              active ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-light text-text-secondary hover:border-accent'}`}>
      <span className={`w-2 h-2 shrink-0 ${TONE[tone].chip}`} />
      {label}
    </button>
  )
}

/** One reading of the clicked cell. The preview value is the headline, because
 *  that is what people recognise — not the source type behind it. */
function OptionRow({ option, onPick }: { option: InferOption; onPick: () => void }) {
  return (
    <button onClick={onPick}
            className={`text-left border px-2.5 py-2 hover:border-accent transition-colors ${
              option.recommended ? 'border-accent/60 bg-accent/5' : 'border-border-light'}`}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold text-text-primary truncate">
          {option.preview || '—'}
        </span>
        {option.recommended && (
          <span className="text-[9px] px-1 bg-accent text-white shrink-0">建議</span>
        )}
      </div>
      <div className="text-[11px] text-text-tertiary mt-0.5">{option.label}</div>
      {option.note && <div className="text-[10px] text-text-muted mt-0.5">{option.note}</div>}
    </button>
  )
}

function StatsBar({ stats, t }: {
  stats: NonNullable<DetectResponse['stats']>
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  return (
    <div className="border border-border-light bg-bg-page px-3 py-2 flex items-center gap-3 flex-wrap">
      <Sparkles size={13} className="text-accent shrink-0" />
      <span className="text-[11px] text-text-secondary">
        {t('wizard.statsRules', { n: stats.ruleFields })}
      </span>
      <span className="text-[11px] text-text-secondary flex items-center gap-1">
        <Cpu size={11} />
        {t('wizard.statsAi', { n: stats.aiFields, calls: stats.aiCalls })}
      </span>
      <span className="text-[11px] text-text-muted ml-auto">
        {(stats.elapsedMs / 1000).toFixed(1)}s
        {stats.detectModel ? ` · ${stats.detectModel}` : ''}
      </span>
      {stats.aiCalls === 0 && (
        <p className="w-full text-[10px] text-text-muted">{t('wizard.statsNoAiNeeded')}</p>
      )}
    </div>
  )
}

/** Read-only summary: what the template currently says, and why. */
function CurrentMapping({ draft, evidence, isWeak, t }: {
  draft: Draft
  evidence: Record<string, Candidate | null>
  isWeak: (key: string) => boolean
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const rows: { label: string; value: string; key: string; tone: Tone; required?: boolean }[] = []
  for (const r of ROW_ROLES) {
    rows.push({ label: t(r.labelKey), key: r.key, tone: r.tone,
                required: 'required' in r ? r.required : false,
                value: draft[r.key as keyof VendorFormat] == null
                  ? '' : `第 ${draft[r.key as keyof VendorFormat]} 列` })
  }
  for (const c of COL_ROLES) {
    const v = draft[c.key as keyof VendorFormat]
    rows.push({ label: t(c.labelKey), key: c.key, tone: c.tone,
                required: 'required' in c ? c.required : false,
                value: v == null ? '' : `${colName(Number(v))} 欄` })
  }
  const source = draft.wafer_id_source
  const waferValue = !source ? ''
    : source === 'column' ? `${colName(Number(draft.wafer_id_col ?? 0))} 欄`
      : source === 'cell' ? String(draft.wafer_id_cell ?? '')
        : source === 'label' ? `「${draft.wafer_id_label ?? ''}」`
          : t(`wizard.src_${source}`)
  rows.push({ label: t('wizard.roleWafer'), key: 'wafer_id_source', tone: 'rose',
              required: true, value: waferValue })

  return (
    <Section title={t('wizard.currentMapping')}>
      <div className="flex flex-col gap-0.5">
        {rows.map((r) => {
          const weak = isWeak(r.key)
          const unset = !r.value
          const bad = weak || (r.required && unset)
          const cand = evidence[r.key]
          return (
            <div key={r.key}
                 className={`flex items-start gap-2 px-2 py-1.5 border ${
                   bad ? 'border-error/50 bg-error/5' : 'border-transparent'}`}>
              <span className={`w-2 h-2 mt-1.5 shrink-0 ${TONE[r.tone].chip}`} />
              <span className="text-[11px] text-text-secondary flex-1 truncate">{r.label}</span>
              <div className="text-right shrink-0 max-w-[190px]">
                <span className={`text-[11px] font-mono ${bad ? 'text-error' : 'text-text-primary'}`}>
                  {r.value || t('wizard.unset')}
                </span>
                {cand && (
                  <div className="text-[9px] text-text-muted leading-tight flex items-center gap-1 justify-end">
                    {cand.source === 'ai' && <Cpu size={9} />}
                    <span className="truncate">{cand.evidence}</span>
                    <b>{Math.round(cand.confidence * 100)}%</b>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/** The escape hatch: raw fields, including the regexes nobody should have to
 *  type. Kept out of the way because clicking is the intended path. */
function AdvancedFields({ draft, onChange, t }: {
  draft: Draft; onChange: (patch: Draft) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const text: [keyof VendorFormat, string][] = [
    ['wafer_id_cell', t('wizard.cellAddress')],
    ['wafer_id_label', t('wizard.labelText')],
    ['wafer_id_pattern', t('wizard.pattern')],
    ['product_id_cell', t('wizard.roleProductCell')],
    ['product_id_label', t('wizard.productLabel')],
    ['product_id_pattern', t('wizard.productPattern')],
    ['product_id_filename_pattern', t('wizard.productFilenamePattern')],
    ['lot_id_cell', t('wizard.roleLotCell')],
    ['lot_id_label', t('wizard.lotLabel')],
    ['lot_id_pattern', t('wizard.lotPattern')],
    ['lot_id_filename_pattern', t('wizard.lotFilenamePattern')],
  ]
  return (
    <div className="flex flex-col gap-2 pt-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-text-tertiary">{t('wizard.waferSource')}</span>
        <select value={(draft.wafer_id_source as string) ?? ''}
                onChange={(e) => onChange({
                  wafer_id_source: (e.target.value || undefined) as VendorFormat['wafer_id_source'],
                })}
                className="border border-border-light px-2 py-1 text-[12px] bg-bg-page">
          <option value="">{t('wizard.unset')}</option>
          {['column', 'cell', 'label', 'filename', 'single'].map((s) => (
            <option key={s} value={s}>{t(`wizard.src_${s}`)}</option>
          ))}
        </select>
      </label>
      {text.map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[10px] text-text-tertiary">{label}</span>
          <input value={(draft[key] as string) ?? ''}
                 onChange={(e) => onChange({ [key]: e.target.value || null } as Draft)}
                 className="border border-border-light px-2 py-1 text-[11px] font-mono
                            bg-bg-page focus:border-accent outline-none" />
        </label>
      ))}
    </div>
  )
}

function RevisionList({ revisions, t }: {
  revisions: Revision[]
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (revisions.length === 0) {
    return <p className="text-[11px] text-text-muted pt-1">{t('wizard.noHistory')}</p>
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      {revisions.map((r) => (
        <div key={r.id} className="border border-border-light px-2.5 py-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`px-1 text-[9px] text-white ${
              r.action === 'create' ? 'bg-emerald-600' : 'bg-sky-600'}`}>
              {t(`wizard.action_${r.action}`)}
            </span>
            <span className="text-text-secondary">{r.changedBy ?? '—'}</span>
            <span className="text-text-muted ml-auto">{r.changedAt}</span>
          </div>
          {r.note && <p className="text-[10px] text-text-muted mt-1">{r.note}</p>}
          {r.changes.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {r.changes.slice(0, 12).map((c) => (
                <div key={c.field} className="text-[10px] font-mono flex items-center gap-1.5">
                  <span className="text-text-tertiary min-w-[120px] truncate">{c.field}</span>
                  <span className="text-error line-through">{String(c.from ?? '—')}</span>
                  <span className="text-text-muted">→</span>
                  <span className="text-emerald-600">{String(c.to ?? '—')}</span>
                </div>
              ))}
              {r.changes.length > 12 && (
                <span className="text-[10px] text-text-muted">
                  {t('wizard.moreChanges', { n: r.changes.length - 12 })}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
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

function DryRunPanel({ dry, t }: {
  dry: DryRunResponse
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (!dry.ok) return <Banner tone="error">{dry.error}</Banner>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
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
