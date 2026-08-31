import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Upload, Wand2, Play, Check, X, AlertTriangle, Loader2,
  ChevronDown, History, FileClock, Sparkles, Cpu, Download as DownloadIcon,
} from 'lucide-react'
import {
  detectFormat, dryRunFormat, previewSample, downloadSample,
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

/** Field key -> i18n label, for messages that name a field. */
const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  [...ROW_ROLES, ...COL_ROLES].map((r) => [r.key, r.labelKey]),
)

function colIndex(text: string): number | null {
  const s = text.trim().toUpperCase()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s) || null
  if (!/^[A-Z]{1,3}$/.test(s)) return null
  let n = 0
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

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
  /** Values of an already-saved template. Given these, the wizard opens straight
   *  into the confirm step on the stored sample instead of asking for a file —
   *  a saved template and a fresh detection are the same screen. */
  initialTemplate?: Draft | null
  site?: string
  onApply: (template: Draft) => void
  onSaved?: (formatId: number) => void
  onClose: () => void
}

export default function FormatWizard({
  vendorId, vendorCode, formatId, initialTemplate, site, onApply, onSaved, onClose,
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
  const [dragging, setDragging] = useState(false)
  // The field a grid click will land on. Set by clicking a field row, so
  // the panel and the sheet drive each other in both directions.
  const [focused, setFocused] = useState<string | null>(null)
  // Pointing at a field on the right lights up what it refers to on the left.
  const [hovered, setHovered] = useState<string | null>(null)
  const [panel, setPanel] = useState<'history' | 'samples' | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [selection, setSelection] = useState<Selection | null>(null)
  const [infer, setInfer] = useState<{ role: InferRole; result: InferResult } | null>(null)
  const [filenameOptions, setFilenameOptions] = useState<
    { role: 'product' | 'lot'; options: InferOption[] } | null>(null)

  const [samples, setSamples] = useState<SavedSample[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])

  const evidence: Record<string, Candidate | null> = detected?.fields ?? {}

  // Saved samples let the preview be reopened without finding the file again —
  // which the 無錫 users cannot reliably do, their file names arriving mojibake.
  useEffect(() => {
    if (!formatId) return
    getRevisions(formatId).then(setRevisions).catch(() => setRevisions([]))
    getSamples(formatId).then(async (list) => {
      setSamples(list)
      // Reopen the template on the file it was built from, showing the saved
      // values — not a fresh detection, which would discard hand edits.
      if (!initialTemplate || list.length === 0) return
      setBusy('detect')
      try {
        const newest = list[0]
        const preview = await previewSample(
          newest.fileToken, newest.sheetSelector ?? undefined)
        setGrid(preview)
        setDraft(initialTemplate)
        setDetected({
          fileToken: newest.fileToken, fileName: newest.fileName, stats: null,
          preview, fields: {}, warnings: [], missing: [], conflicts: [], template: {},
        })
      } catch {
        /* the sample may have been cleaned off disk; fall back to step 1 */
      } finally {
        setBusy(null)
      }
    }).catch(() => setSamples([]))
  }, [formatId, initialTemplate])

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

  /** Put the clicked row/column into whichever field is armed. */
  const assignFocused = (sel: Selection) => {
    if (!focused) return
    const wantsColumn = COL_ROLES.some((c) => c.key === focused)
    const value = sel.kind === 'row' ? sel.row
      : sel.kind === 'col' ? sel.col
        : wantsColumn ? sel.col : sel.row
    setField({ [focused]: value } as Draft)
    setFocused(null)
  }

  /** Which roles land on each row / column / cell, for the grid overlay. */
  /** Row / column the highlighted field points at, for the sheet overlay. */
  const spotlight = useMemo(() => {
    const key = focused ?? hovered
    if (!key) return null
    const value = draft[key as keyof VendorFormat]
    if (typeof value !== 'number') return null
    const isCol = COL_ROLES.some((c) => c.key === key) || key === 'wafer_id_col'
    return { kind: isCol ? 'col' as const : 'row' as const, index: value, key }
  }, [focused, hovered, draft])

  // A highlighted row is usually below the fold — the header row of a real file
  // sits at row 15 or 19, well past what the preview shows at rest.
  useEffect(() => {
    if (!spotlight || !sheetRef.current) return
    const sel = spotlight.kind === 'row'
      ? `[data-row="${spotlight.index}"]`
      : `[data-col="${spotlight.index}"]`
    const el = sheetRef.current.querySelector(sel)
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [spotlight])

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
        <div className="p-7 flex flex-col gap-5">
          <div className="flex justify-center">
            <StepRail active={0} t={t} />
          </div>

          {/* Dropping a file is the fastest path, so the drop target is the
              main affordance and the file picker sits inside it. */}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void runDetect(f)
            }}
            className={`relative flex flex-col items-center justify-center gap-3 px-6 py-12
                        border-2 border-dashed transition-colors cursor-pointer ${
              busy === 'detect' ? 'border-accent bg-accent/5 cursor-wait'
                : dragging ? 'border-accent bg-accent/10'
                  : 'border-border-light hover:border-accent hover:bg-accent/5'}`}
          >
            {busy === 'detect' ? (
              <>
                <Loader2 size={30} className="text-accent animate-spin" />
                <span className="font-heading text-[15px] uppercase tracking-[1px] text-accent">
                  {t('wizard.detecting')}
                </span>
                <span className="text-[13px] text-text-muted">{t('wizard.detectingHint')}</span>
              </>
            ) : (
              <>
                <Upload size={30} className={dragging ? 'text-accent' : 'text-text-muted'} />
                <span className="font-heading text-[16px] uppercase tracking-[1px]
                                 text-text-primary">
                  {t('wizard.dropHere')}
                </span>
                <span className="text-[13px] text-text-muted">{t('wizard.orClick')}</span>
                <span className="flex flex-wrap justify-center gap-1.5 mt-1">
                  {['.xlsx', '.xlsm', '.xls', '.csv', '.txt'].map((ext) => (
                    <span key={ext} className="px-2 py-0.5 bg-bg-page text-text-muted
                                               text-[12px] font-mono rounded">{ext}</span>
                  ))}
                </span>
              </>
            )}
            <input type="file" className="hidden" accept=".xlsx,.xlsm,.xls,.csv,.txt"
                   disabled={busy === 'detect'}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void runDetect(f) }} />
          </label>

          <p className="text-[13.5px] text-text-secondary leading-relaxed">
            {formatId ? t('wizard.reDetectIntro') : t('wizard.introText')}
          </p>

          <label className="flex items-start gap-2.5 px-3 py-2.5 border border-border-light
                            cursor-pointer hover:border-accent transition-colors">
            <input type="checkbox" checked={useAi} className="mt-0.5"
                   onChange={(e) => setUseAi(e.target.checked)} />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] text-text-primary flex items-center gap-1.5">
                <Cpu size={14} className="text-accent" /> {t('wizard.useAi')}
              </span>
              <span className="text-[12.5px] text-text-muted leading-snug">
                {t('wizard.useAiHint')}
              </span>
            </span>
          </label>

          {samples.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[12px] font-heading uppercase
                              tracking-[1.5px] text-text-muted">
                <FileClock size={14} /> {t('wizard.savedSamples')}
              </div>
              <SampleList samples={samples} current="" t={t}
                          onOpen={(x) => void reopenSample(x)} />
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
    <Shell title={`${t('wizard.title')} — ${detected.fileName}`} onClose={onClose} wide
           actions={
             <>
               <HeaderButton icon={<Upload size={15} />} label={t('wizard.changeSample')}
                             onClick={() => { setDetected(null); setPanel(null) }} />
               <HeaderButton icon={<History size={15} />} label={t('wizard.history')}
                             active={panel === 'history'}
                             onClick={() => setPanel(panel === 'history' ? null : 'history')} />
             </>
           }>
      {panel === 'history' && (
        <HistoryModal
          revisions={revisions} current={detected.fileToken}
          hasFormat={!!formatId} t={t}
          onOpenSample={(token) => {
            const s = samples.find((x) => x.fileToken === token)
            if (s) { void reopenSample(s); setPanel(null) }
          }}
          onClose={() => setPanel(null)} />
      )}
      <div className="flex flex-col lg:flex-row min-h-0 flex-1">
        {/* left: the sheet */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border-light">
          <div className="px-4 pt-3 pb-1"><StepRail active={1} t={t} compact /></div>
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

          <div ref={sheetRef} className="overflow-auto flex-1 max-h-[46vh]">
            <table className="border-collapse font-mono text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-bg-page border border-border-light px-2 py-1 sticky left-0 z-20" />
                  {Array.from({ length: grid?.nCols ?? 0 }, (_, i) => i + 1).map((c) => {
                    const tone = marks.cols.get(c)
                    const active = selection?.kind === 'col' && selection.col === c
                    const lit = spotlight?.kind === 'col' && spotlight.index === c
                    return (
                      <th key={c} data-col={c}
                          onClick={() => { setSelection({ kind: 'col', col: c }); setInfer(null) }}
                          className={`border border-border-light px-2 py-1 font-semibold cursor-pointer
                            hover:bg-accent/20 transition-colors relative
                            ${tone ? TONE[tone].band : 'bg-bg-page'}
                            ${lit ? 'ring-2 ring-inset ring-accent bg-accent/25' : ''}
                            ${active ? 'ring-2 ring-inset ring-accent' : ''}`}>
                        {colName(c)}
                        {lit && (
                          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full
                                           px-1.5 py-0.5 bg-accent text-white text-[10px]
                                           whitespace-nowrap z-30 pointer-events-none">
                            {t(FIELD_LABEL[spotlight.key] ?? 'wizard.roleWaferCol')}
                          </span>
                        )}
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
                  const rowLit = spotlight?.kind === 'row' && spotlight.index === r
                  return (
                    <tr key={r} data-row={r} className={`${rowTone ? TONE[rowTone].band : ''} ${
                      rowLit ? 'outline outline-2 -outline-offset-2 outline-accent bg-accent/15' : ''}`}>
                      <td onClick={() => { setSelection({ kind: 'row', row: r }); setInfer(null) }}
                          className={`border border-border-light px-2 py-1 text-right text-text-muted
                            font-semibold sticky left-0 bg-bg-page z-10 cursor-pointer relative
                            hover:bg-accent/20 ${rowActive ? 'ring-2 ring-inset ring-accent' : ''}
                            ${rowLit ? 'bg-accent text-white' : ''}`}>
                        {r}
                        {rowLit && (
                          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1
                                           px-1.5 py-0.5 bg-accent text-white text-[10px]
                                           whitespace-nowrap z-30 pointer-events-none">
                            {t(FIELD_LABEL[spotlight.key] ?? '')}
                          </span>
                        )}
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

        {/* right: every field, editable */}
        <div className="w-full lg:w-[430px] shrink-0 overflow-auto max-h-[80vh] p-4 flex flex-col gap-4">
          {detected.stats && <StatsBar stats={detected.stats} t={t} />}

          {/* What a click on the sheet means, when there is one. Kept above the
              field list so the answer appears where the user is looking. */}
          {selection?.kind === 'cell' && (
            <Section title={t('wizard.cellIs', {
              ref: `${colName(selection.col)}${selection.row}`,
              value: String(selectedValue ?? '').slice(0, 40) || '—',
            })}>
              {focused ? (
                <button
                  onClick={() => { assignFocused(selection); setSelection(null) }}
                  className="w-full text-left px-3 py-2 border border-accent bg-accent/5
                             text-[13px] text-accent hover:bg-accent/10 transition-colors">
                  {t('wizard.assignTo', { field: t(FIELD_LABEL[focused]) })}
                </button>
              ) : (
                <>
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
                        <p className="text-[12px] text-text-muted">{t('wizard.noOptions')}</p>
                      )}
                      {infer.result.options.map((o) => (
                        <OptionRow key={o.key} option={o}
                                   onPick={() => { setField(o.fields as Draft); setInfer(null); setSelection(null) }} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Section>
          )}

          {(selection?.kind === 'row' || selection?.kind === 'col') && focused && (
            <Section title={selection.kind === 'row'
              ? t('wizard.rowIs', { row: selection.row })
              : t('wizard.colIs', { col: colName(selection.col) })}>
              <button
                onClick={() => { assignFocused(selection); setSelection(null) }}
                className="w-full text-left px-3 py-2 border border-accent bg-accent/5
                           text-[13px] text-accent hover:bg-accent/10 transition-colors">
                {t('wizard.assignTo', { field: t(FIELD_LABEL[focused]) })}
              </button>
            </Section>
          )}

          {(selection?.kind === 'row' || selection?.kind === 'col') && !focused && (
            <Section title={selection.kind === 'row'
              ? t('wizard.rowIs', { row: selection.row })
              : t('wizard.colIs', { col: colName(selection.col) })}>
              <div className="flex flex-wrap gap-1.5">
                {(selection.kind === 'row' ? ROW_ROLES : COL_ROLES).map((role) => (
                  <RoleButton key={role.key} tone={role.tone}
                              active={draft[role.key as keyof VendorFormat] ===
                                (selection.kind === 'row' ? selection.row : selection.col)}
                              label={t(role.labelKey)}
                              onClick={() => setField({
                                [role.key]: selection.kind === 'row' ? selection.row : selection.col,
                              } as Draft)} />
                ))}
                {selection.kind === 'col' && (
                  <RoleButton tone="rose"
                              active={draft.wafer_id_source === 'column'
                                && draft.wafer_id_col === selection.col}
                              label={t('wizard.roleWaferCol')}
                              onClick={() => setField({
                                wafer_id_source: 'column', wafer_id_col: selection.col,
                                wafer_id_cell: null, wafer_id_label: null, wafer_id_pattern: null,
                              })} />
                )}
              </div>
            </Section>
          )}

          <WaferSourceEditor draft={draft} grid={grid} fileName={detected.fileName}
                             onChange={setField} t={t} />

          <MetaEditor draft={draft} grid={grid} onChange={setField}
                      onAskFilename={askFilename} filenameOptions={filenameOptions}
                      onPickFilename={(o) => { setField(o.fields as Draft); setFilenameOptions(null) }}
                      t={t} />

          {/* The whole mapping, editable. Everything the parser needs is listed
              here whether it was detected or not, so a gap is visible as an
              empty required field rather than only as a failed dry run. */}
          <Section title={t('wizard.mappingTitle')}>
            <p className="text-[12px] text-text-muted -mt-1">{t('wizard.mappingHint')}</p>
            <div className="flex flex-col gap-1 mt-1">
              {ROW_ROLES.map((r) => (
                <FieldRow key={r.key} kind="row" tone={r.tone}
                          label={t(r.labelKey)} required={'required' in r ? r.required : false}
                          value={draft[r.key as keyof VendorFormat] as number | null}
                          candidate={evidence[r.key] ?? null} weak={isWeak(r.key)}
                          focused={focused === r.key}
                          onFocus={() => setFocused(focused === r.key ? null : r.key)}
                          onHover={(on) => setHovered(on ? r.key : null)}
                          onChange={(v) => setField({ [r.key]: v } as Draft)} t={t} />
              ))}
              {COL_ROLES.map((c) => (
                <FieldRow key={c.key} kind="col" tone={c.tone}
                          label={t(c.labelKey)} required={'required' in c ? c.required : false}
                          value={draft[c.key as keyof VendorFormat] as number | null}
                          candidate={evidence[c.key] ?? null} weak={isWeak(c.key)}
                          focused={focused === c.key}
                          onFocus={() => setFocused(focused === c.key ? null : c.key)}
                          onHover={(on) => setHovered(on ? c.key : null)}
                          onChange={(v) => setField({ [c.key]: v } as Draft)} t={t} />
              ))}
            </div>
          </Section>

          {detected.warnings.map((w, i) => <Banner key={i} tone="warn">{w}</Banner>)}

          <Collapse title={t('wizard.advanced')} open={showAdvanced}
                    onToggle={() => setShowAdvanced((v) => !v)}>
            <AdvancedFields draft={draft} onChange={setField} t={t} />
          </Collapse>

        </div>
      </div>

      <div className="border-t border-border-light px-5 py-3 flex items-center gap-3">
        {error && <span className="text-[12px] text-error">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
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

function Shell({ title, onClose, wide, actions, children }: {
  title: string; onClose: () => void; wide?: boolean
  actions?: React.ReactNode; children: React.ReactNode
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
          <span className="ml-auto flex items-center gap-1">
            {actions}
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-error">
              <X size={18} />
            </button>
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Three-step rail, so it is obvious that uploading is not the whole job. */
function StepRail({ active, t, compact }: {
  active: number
  t: (k: string, o?: Record<string, unknown>) => string
  compact?: boolean
}) {
  const steps = [t('wizard.step1'), t('wizard.step2'), t('wizard.step3')]
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 ${
            i === active ? 'text-accent' : i < active ? 'text-text-tertiary' : 'text-text-muted'}`}>
            <span className={`w-[21px] h-[21px] flex items-center justify-center text-[11px]
                              font-bold rounded-full shrink-0 ${
              i === active ? 'bg-accent text-white'
                : i < active ? 'bg-text-tertiary/20 text-text-tertiary'
                  : 'border border-current'}`}>
              {i + 1}
            </span>
            {(!compact || i === active) && (
              <span className="font-heading text-[13px] uppercase tracking-[1px]">{label}</span>
            )}
          </span>
          {i < steps.length - 1 && (
            <span className={`w-8 h-px ${i < active ? 'bg-text-tertiary/40' : 'bg-border-light'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

/** A section the template cannot work without. The status is stated rather
 *  than implied, because these three drive which product and lot the data is
 *  filed under — and they sat below the fold with no marking at all. */
function SectionRequired({ title, met, explain, children }: {
  title: string; met: boolean; explain: string; children: React.ReactNode
}) {
  return (
    <div className={`border px-3 py-2.5 flex flex-col gap-2 ${
      met ? 'border-border-light' : 'border-error/50 bg-error/5'}`}>
      <div className="flex items-center gap-2">
        <span className="font-heading text-[12px] font-bold uppercase tracking-[1.5px]
                         text-text-secondary">
          {title}
        </span>
        <span className="text-error text-[13px] leading-none">*</span>
        {met
          ? <Check size={13} className="text-emerald-600 ml-auto" />
          : <AlertTriangle size={13} className="text-error ml-auto" />}
      </div>
      <p className="text-[12px] text-text-muted leading-relaxed -mt-1">{explain}</p>
      {children}
    </div>
  )
}

function HeaderButton({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} title={label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors ${
              active ? 'bg-accent text-white'
                : 'text-text-muted hover:text-accent hover:bg-accent/10'}`}>
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
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
function TextField({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string
}) {
  return (
    <label className="flex flex-col gap-1 mt-2">
      <span className="text-[12px] text-text-tertiary">{label}</span>
      <input
        value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border-light px-2 py-1.5 text-[13px] font-mono bg-bg-page
                   focus:border-accent outline-none"
      />
      {hint && <span className="text-[11px] text-text-muted leading-snug">{hint}</span>}
    </label>
  )
}

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
      <span className="text-[12.5px] text-text-secondary">
        {t('wizard.statsRules', { n: stats.ruleFields })}
      </span>
      <span className="text-[12.5px] text-text-secondary flex items-center gap-1">
        <Cpu size={11} />
        {t('wizard.statsAi', { n: stats.aiFields, calls: stats.aiCalls })}
      </span>
      <span className="text-[12px] text-text-muted ml-auto">
        {(stats.elapsedMs / 1000).toFixed(1)}s
        {stats.detectModel ? ` · ${t('wizard.localModel')}` : ''}
      </span>
      {stats.aiCalls === 0 && (
        <p className="w-full text-[11.5px] text-text-muted">{t('wizard.statsNoAiNeeded')}</p>
      )}
    </div>
  )
}

/** One mapping field: editable directly, or armed for a click on the sheet. */
function FieldRow({ kind, tone, label, required, value, candidate, weak,
                    focused, onFocus, onHover, onChange, t }: {
  kind: 'row' | 'col'
  tone: Tone
  label: string
  required?: boolean
  value: number | null | undefined
  candidate: Candidate | null
  weak: boolean
  focused: boolean
  onFocus: () => void
  onHover: (on: boolean) => void
  onChange: (v: number | null) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const unset = value === null || value === undefined
  const bad = (required && unset) || weak
  const shown = unset ? '' : kind === 'col' ? colName(Number(value)) : String(value)
  return (
    <div onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
         className={`border px-2.5 py-2 transition-colors ${
      focused ? 'border-accent bg-accent/5'
        : bad ? 'border-error/50 bg-error/5' : 'border-border-light'}`}>
      <div className="flex items-center gap-2">
        <button onClick={onFocus} title={t('wizard.armField')}
                className={`w-2.5 h-2.5 shrink-0 ${TONE[tone].chip}`} />
        <button onClick={onFocus}
                className="text-[13px] text-text-secondary flex-1 truncate text-left
                           hover:text-accent cursor-pointer">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </button>
        <input
          value={shown}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (!raw) return onChange(null)
            onChange(kind === 'col' ? colIndex(raw) : (Number(raw) || null))
          }}
          placeholder={kind === 'col' ? 'F' : '—'}
          className={`w-[62px] border px-1.5 py-1 text-[13px] font-mono text-right
                      bg-bg-page outline-none focus:border-accent ${
            bad ? 'border-error/50' : 'border-border-light'}`}
        />
      </div>
      {focused && (
        <p className="text-[11px] text-accent mt-1">{t('wizard.armedHint2')}</p>
      )}
      {!focused && bad && unset && (
        <p className="text-[11px] text-error mt-1">{t('wizard.requiredMissing')}</p>
      )}
      {!focused && candidate && !unset && (
        <p className={`text-[11px] mt-1 flex items-start gap-1 ${
          weak ? 'text-error' : 'text-text-muted'}`}>
          {candidate.source === 'ai' && <Cpu size={10} className="mt-0.5 shrink-0" />}
          <span className="truncate">{candidate.evidence}</span>
          <b className="shrink-0">{Math.round(candidate.confidence * 100)}%</b>
        </p>
      )}
    </div>
  )
}

const WAFER_MODES = ['column', 'cell', 'label', 'filename', 'single'] as const

/** The one field the file often cannot supply. Each way of providing it gets
 *  its own input and shows the value it would read, so "not set" is actionable
 *  rather than just a warning. */
function WaferSourceEditor({ draft, grid, fileName, onChange, t }: {
  draft: Draft
  grid: GridPreview | null
  fileName: string
  onChange: (patch: Draft) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const mode = draft.wafer_id_source ?? null
  const clear: Draft = {
    wafer_id_col: null, wafer_id_cell: null,
    wafer_id_label: null, wafer_id_pattern: null,
  }

  const cellValue = (() => {
    const rc = parseCellRef(draft.wafer_id_cell)
    if (!rc || !grid) return null
    return grid.rows[rc[0] - 1]?.[rc[1] - 1] ?? null
  })()

  const applyPattern = (raw: string | null): string => {
    if (!raw) return ''
    const p = draft.wafer_id_pattern
    if (!p) return raw
    try {
      const m = new RegExp(p).exec(raw)
      return m ? (m[1] ?? m[0]) : raw
    } catch {
      return raw
    }
  }

  const preview = mode === 'cell' ? applyPattern(cellValue)
    : mode === 'filename' ? applyPattern(fileName.replace(/\.[^.]+$/, ''))
      : mode === 'single' ? fileName.replace(/\.[^.]+$/, '')
        : mode === 'column' && draft.wafer_id_col
          ? t('wizard.perRowValue', { col: colName(Number(draft.wafer_id_col)) })
          : ''

  return (
    <SectionRequired title={t('wizard.roleWafer')} met={!!mode}
                     explain={t('wizard.waferExplain')}>
      {!mode && (
        <p className="text-[12.5px] text-error -mt-1">{t('wizard.waferNotFound')}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {WAFER_MODES.map((m) => (
          <button key={m}
                  onClick={() => onChange({ ...clear, wafer_id_source: m })}
                  className={`px-2.5 py-1.5 text-[12px] border transition-colors ${
                    mode === m ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-light text-text-secondary hover:border-accent'}`}>
            {t(`wizard.src_${m}`)}
          </button>
        ))}
      </div>
      {mode && (
        <p className="text-[12px] text-text-secondary bg-bg-page border border-border-light
                      px-2.5 py-1.5 leading-relaxed">
          {t(`wizard.srcHint_${mode}`)}
        </p>
      )}

      {mode === 'column' && (
        <TextField label={t('wizard.waferColumn')} placeholder="A"
                   value={draft.wafer_id_col ? colName(Number(draft.wafer_id_col)) : ''}
                   onChange={(v) => onChange({ wafer_id_col: colIndex(v) })} />
      )}
      {mode === 'cell' && (
        <TextField label={t('wizard.cellAddress')} placeholder="B4"
                   hint={t('wizard.cellAddressHint')}
                   value={(draft.wafer_id_cell as string) ?? ''}
                   onChange={(v) => onChange({ wafer_id_cell: v || null })} />
      )}
      {mode === 'label' && (
        <TextField label={t('wizard.labelText')} placeholder="Wafer number"
                   hint={t('wizard.labelTextHint')}
                   value={(draft.wafer_id_label as string) ?? ''}
                   onChange={(v) => onChange({ wafer_id_label: v || null })} />
      )}
      {mode === 'filename' && (
        <TextField label={t('wizard.pattern')} placeholder="号(\\d+)$"
                   hint={t('wizard.filenamePatternHint', { name: fileName })}
                   value={(draft.wafer_id_pattern as string) ?? ''}
                   onChange={(v) => onChange({ wafer_id_pattern: v || null })} />
      )}
      {(mode === 'cell' || mode === 'label') && (
        <TextField label={t('wizard.patternOptional')} placeholder="-(\\d+)$"
                   hint={t('wizard.patternHint')}
                   value={(draft.wafer_id_pattern as string) ?? ''}
                   onChange={(v) => onChange({ wafer_id_pattern: v || null })} />
      )}

      {mode && (
        <div className="mt-1 px-2.5 py-1.5 bg-bg-page border border-border-light">
          <span className="text-[11.5px] text-text-muted">{t('wizard.willRead')}</span>
          <span className="ml-2 font-mono text-[13.5px] text-text-primary">
            {preview || t('wizard.nothingYet')}
          </span>
        </div>
      )}
    </SectionRequired>
  )
}

/** Product and lot: show what is currently configured, in words, and offer the
 *  file-name route when the sheet does not carry the value. */
function MetaEditor({ draft, grid, onChange, onAskFilename, filenameOptions,
                     onPickFilename, t }: {
  draft: Draft
  grid: GridPreview | null
  onChange: (patch: Draft) => void
  onAskFilename: (role: 'product' | 'lot') => void
  filenameOptions: { role: 'product' | 'lot'; options: InferOption[] } | null
  onPickFilename: (o: InferOption) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const describe = (prefix: 'product_id' | 'lot_id') => {
    const cell = draft[`${prefix}_cell` as keyof VendorFormat] as string | null
    const col = draft[`${prefix}_col` as keyof VendorFormat] as number | null
    const label = draft[`${prefix}_label` as keyof VendorFormat] as string | null
    const fromName = draft[`${prefix}_filename_pattern` as keyof VendorFormat] as string | null
    if (fromName) return t('wizard.fromFileName')
    if (cell) {
      const rc = parseCellRef(cell)
      const v = rc && grid ? grid.rows[rc[0] - 1]?.[rc[1] - 1] : null
      return `${cell}${v ? ` → ${v}` : ''}`
    }
    if (label) return `「${label}」`
    if (col) return t('wizard.perRowValue', { col: colName(Number(col)) })
    return ''
  }

  const bothSet = !!describe('product_id') && !!describe('lot_id')
  return (
    <SectionRequired title={t('wizard.metaTitle')} met={bothSet}
                     explain={t('wizard.metaExplain')}>
      {(['product', 'lot'] as const).map((role) => {
        const prefix = role === 'product' ? 'product_id' : 'lot_id'
        const desc = describe(prefix)
        return (
          <div key={role} className={`border px-2.5 py-2 flex flex-col gap-1 ${
            desc ? 'border-border-light' : 'border-amber-500/40 bg-amber-500/5'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 shrink-0 ${
                role === 'product' ? TONE.fuchsia.chip : TONE.lime.chip}`} />
              <span className="text-[13px] text-text-secondary flex-1">
                {t(role === 'product' ? 'wizard.cellIsProduct' : 'wizard.cellIsLot')}
              </span>
              <span className="font-mono text-[12px] text-text-primary truncate max-w-[150px]">
                {desc || t('wizard.unset')}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => onAskFilename(role)}
                      className="text-[11.5px] px-2 py-1 border border-border-light
                                 text-text-tertiary hover:border-accent hover:text-accent">
                {t('wizard.useFileName')}
              </button>
              {desc && (
                <button onClick={() => onChange({
                  [`${prefix}_cell`]: null, [`${prefix}_col`]: null,
                  [`${prefix}_label`]: null, [`${prefix}_filename_pattern`]: null,
                } as Draft)}
                        className="text-[11.5px] px-2 py-1 border border-border-light
                                   text-text-tertiary hover:border-error hover:text-error">
                  {t('wizard.clearField')}
                </button>
              )}
            </div>
            {filenameOptions?.role === role && (
              <div className="flex flex-col gap-1.5 mt-1">
                {filenameOptions.options.length === 0
                  ? <p className="text-[12px] text-text-muted">{t('wizard.noOptions')}</p>
                  : filenameOptions.options.map((o) => (
                    <OptionRow key={o.key} option={o} onPick={() => onPickFilename(o)} />
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </SectionRequired>
  )
}

function SampleList({ samples, current, onOpen, t }: {
  samples: SavedSample[]
  current: string
  onOpen: (s: SavedSample) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (samples.length === 0) {
    return <p className="text-[12px] text-text-muted pt-1">{t('wizard.noSamplesYet')}</p>
  }
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {samples.map((s) => (
        <button key={s.id} onClick={() => onOpen(s)} disabled={s.fileToken === current}
                className={`flex items-center gap-2 text-left px-2.5 py-2 border
                            transition-colors ${
                  s.fileToken === current
                    ? 'border-accent/50 bg-accent/5 cursor-default'
                    : 'border-border-light hover:border-accent'}`}>
          <FileClock size={13} className="shrink-0 text-text-muted" />
          <span className="text-[12.5px] flex-1 truncate">{s.fileName}</span>
          <span className="text-[11px] text-text-muted shrink-0">
            {s.fileToken === current ? t('wizard.currentSample') : s.uploadedAt}
          </span>
        </button>
      ))}
    </div>
  )
}

/** The escape hatch: raw fields, including the regexes nobody should have to
 *  type. Kept out of the way because clicking is the intended path. */
function AdvancedFields({ draft, onChange, t }: {
  draft: Draft; onChange: (patch: Draft) => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  // Each field carries a worked example, because "regex" is not something the
  // people configuring this should be expected to compose from nothing.
  const text: [keyof VendorFormat, string, string][] = [
    ['wafer_id_cell', t('wizard.cellAddress'), 'B4'],
    ['wafer_id_label', t('wizard.labelText'), 'Wafer number'],
    ['wafer_id_pattern', t('wizard.pattern'), String.raw`-(\d+)$`],
    ['product_id_cell', t('wizard.roleProductCell'), '5,2'],
    ['product_id_label', t('wizard.productLabel'), 'Device Name'],
    ['product_id_pattern', t('wizard.productPattern'), '^([^.]+)'],
    ['product_id_filename_pattern', t('wizard.productFilenamePattern'), '型号([A-Za-z0-9]+)'],
    ['lot_id_cell', t('wizard.roleLotCell'), '4,2'],
    ['lot_id_label', t('wizard.lotLabel'), 'Lot number'],
    ['lot_id_pattern', t('wizard.lotPattern'), String.raw`^(.+)-\d+$`],
    ['lot_id_filename_pattern', t('wizard.lotFilenamePattern'), String.raw`批号([A-Za-z0-9.\-]+)`],
  ]
  return (
    <div className="flex flex-col gap-2 pt-1">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-text-tertiary">{t('wizard.waferSource')}</span>
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
      {text.map(([key, label, example]) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[12px] text-text-tertiary">{label}</span>
          <input value={(draft[key] as string) ?? ''} placeholder={example}
                 onChange={(e) => onChange({ [key]: e.target.value || null } as Draft)}
                 className="border border-border-light px-2 py-1.5 text-[12.5px] font-mono
                            bg-bg-page focus:border-accent outline-none" />
          <span className="text-[11px] text-text-muted">
            {t('wizard.example')}: <code className="font-mono">{example}</code>
          </span>
        </label>
      ))}
    </div>
  )
}

/** Internal field key -> the label used everywhere else in the UI. The history
 *  is the one place these keys would otherwise leak to the reader. */
const HISTORY_FIELD_LABEL: Record<string, string> = {
  ...FIELD_LABEL,
  format_name: 'wizard.templateName',
  wafer_id_source: 'wizard.roleWafer',
  wafer_id_col: 'wizard.waferColumn',
  wafer_id_cell: 'wizard.cellAddress',
  wafer_id_label: 'wizard.labelText',
  wafer_id_pattern: 'wizard.pattern',
  product_id_cell: 'wizard.roleProductCell',
  product_id_col: 'wizard.productColumn',
  product_id_label: 'wizard.productLabel',
  product_id_pattern: 'wizard.productPattern',
  product_id_filename_pattern: 'wizard.productFilenamePattern',
  lot_id_cell: 'wizard.roleLotCell',
  lot_id_col: 'wizard.lotColumn',
  lot_id_label: 'wizard.lotLabel',
  lot_id_pattern: 'wizard.lotPattern',
  lot_id_filename_pattern: 'wizard.lotFilenamePattern',
  sheet_selector: 'wizard.sheetSelector',
  text_delimiter: 'wizard.textDelimiter',
  fixed_die_count: 'wizard.fixedDieCount',
  domain: 'wizard.site',
}

function HistoryModal({ revisions, current, hasFormat, t,
                       onOpenSample, onClose }: {
  revisions: Revision[]
  current: string
  hasFormat: boolean
  t: (k: string, o?: Record<string, unknown>) => string
  onOpenSample: (token: string) => void
  onClose: () => void
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const label = (field: string) =>
    HISTORY_FIELD_LABEL[field] ? t(HISTORY_FIELD_LABEL[field]) : field

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-bg-card border border-border-light shadow-2xl flex flex-col
                      max-h-[86vh] w-full max-w-[900px]"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-light">
          <History size={16} className="text-accent" />
          <span className="font-heading text-[14px] font-bold uppercase tracking-[1px]">
            {t('wizard.history')}
          </span>
          <button onClick={onClose} className="ml-auto p-1 text-text-muted hover:text-error">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-auto p-5 flex flex-col gap-4">
          {downloadError && (
            <Banner tone="error">
              {t('wizard.downloadFailed')}: {downloadError}
            </Banner>
          )}
          {!hasFormat && (
            <p className="text-[13px] text-text-muted">{t('wizard.historyAfterSave')}</p>
          )}
          {hasFormat && revisions.length === 0 && (
            <p className="text-[13px] text-text-muted">{t('wizard.noHistory')}</p>
          )}

          {revisions.map((r) => (
            <div key={r.id} className="border border-border-light">
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-bg-page
                              border-b border-border-light flex-wrap">
                <span className="font-heading text-[13px] font-bold text-accent">
                  v{r.version}
                </span>
                <span className={`px-1.5 py-0.5 text-[11px] text-white ${
                  r.action === 'create' ? 'bg-emerald-600' : 'bg-sky-600'}`}>
                  {t(`wizard.action_${r.action}`)}
                </span>
                <span className="text-[13px] text-text-primary">{r.changedBy ?? '—'}</span>
                {r.sampleToken && (
                  <span className="flex items-center border border-border-light max-w-[380px]">
                    <button onClick={() => onOpenSample(r.sampleToken as string)}
                            title={t('wizard.openThisSample')}
                            className="flex items-center gap-1.5 text-[12px] px-2 py-0.5
                                       text-text-tertiary hover:text-accent min-w-0">
                      <FileClock size={12} className="shrink-0" />
                      <span className="truncate">{r.sampleName}</span>
                      {r.sampleToken === current && (
                        <span className="text-[10px] text-accent shrink-0">
                          · {t('wizard.currentSample')}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        const res = await downloadSample(
                          r.sampleToken as string, r.sampleName ?? 'sample')
                        if (!res.ok) setDownloadError(res.error)
                      }}
                      title={t('wizard.downloadSample')}
                      className="px-1.5 py-1 border-l border-border-light text-text-muted
                                 hover:text-accent shrink-0">
                      <DownloadIcon size={12} />
                    </button>
                  </span>
                )}
                <span className="text-[12.5px] text-text-muted ml-auto">{r.changedAt}</span>
              </div>

              {r.note && (
                <p className="px-3 pt-2 text-[12.5px] text-text-secondary">{r.note}</p>
              )}

              {r.changes.length === 0 ? (
                <p className="px-3 py-2 text-[12.5px] text-text-muted">
                  {t('wizard.noFieldChange')}
                </p>
              ) : (
                <div className="overflow-x-auto p-3">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="text-text-muted text-[12px]">
                        <th className="border border-border-light px-2.5 py-1.5 text-left
                                       bg-bg-page font-semibold">
                          {t('wizard.diffField')}
                        </th>
                        <th className="border border-border-light px-2.5 py-1.5 text-left
                                       bg-bg-page font-semibold w-[35%]">
                          {t('wizard.diffFrom')}
                        </th>
                        <th className="border border-border-light px-2.5 py-1.5 text-left
                                       bg-bg-page font-semibold w-[35%]">
                          {t('wizard.diffTo')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.changes.map((c) => (
                        <tr key={c.field}>
                          <td className="border border-border-light px-2.5 py-1.5
                                         text-text-secondary">
                            {label(c.field)}
                          </td>
                          <td className="border border-border-light px-2.5 py-1.5 font-mono
                                         text-error break-all">
                            {c.from === null || c.from === undefined
                              ? <span className="text-text-muted">—</span>
                              : String(c.from)}
                          </td>
                          <td className="border border-border-light px-2.5 py-1.5 font-mono
                                         text-emerald-700 break-all">
                            {c.to === null || c.to === undefined
                              ? <span className="text-text-muted">—</span>
                              : String(c.to)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

        </div>
      </div>
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
