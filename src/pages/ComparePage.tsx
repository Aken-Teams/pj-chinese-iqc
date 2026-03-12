import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/layout/PageHeader'

const mockCompareData = [
  { param: 'VTH', cpLower: '-0.9', cpUpper: '-0.5', ftLower: '-0.95', ftUpper: '-0.45', margin: '+0%', result: 'Match' as const },
  { param: 'RDS(on)', cpLower: '0', cpUpper: '40', ftLower: '0', ftUpper: '38', margin: '-5%', result: 'Tighter' as const },
  { param: 'BVDS', cpLower: '-20', cpUpper: '-', ftLower: '-22', ftUpper: '-', margin: '+10%', result: 'Match' as const },
  { param: 'IDSS', cpLower: '0', cpUpper: '1', ftLower: '0', ftUpper: '0.5', margin: '-50%', result: 'Out of Range' as const },
  { param: 'IGSS', cpLower: '-1', cpUpper: '1', ftLower: '-1', ftUpper: '1', margin: '+0%', result: 'Match' as const },
  { param: 'VF', cpLower: '0', cpUpper: '1.2', ftLower: '0', ftUpper: '1.1', margin: '-8%', result: 'Tighter' as const },
]

export default function ComparePage() {
  const { t } = useTranslation('compare')

  return (
    <div className="p-12">
      <PageHeader
        title={t('title')}
        actions={
          <button className="bg-bg-card border border-border-light px-4 py-2 text-sm text-text-secondary font-semibold hover:bg-border-light transition-colors">
            {t('exportComparison', { defaultValue: 'Export Comparison' })}
          </button>
        }
      />

      {/* Selector Row */}
      <div className="flex gap-4 items-end mt-7">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('cpSpec', { defaultValue: 'CP Spec' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>JI30050A - Rev.3</option>
            <option>JI30050A - Rev.2</option>
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('packagingTestSpec', { defaultValue: 'Packaging Test Spec' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>JI30050A-FT - Rev.3</option>
            <option>JI30050A-FT - Rev.2</option>
          </select>
        </div>
        <div className="w-[200px] flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase">
            {t('reviewRule', { defaultValue: 'Review Rule' })}
          </label>
          <select className="bg-bg-card border border-border-light px-3 py-2 text-sm text-text-primary w-full">
            <option>Standard (&plusmn;10%)</option>
            <option>Strict (&plusmn;5%)</option>
          </select>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-bg-card p-6 mt-5">
        {/* Title Row */}
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold">
            {t('comparisonResults', { defaultValue: 'Comparison Results' })}
          </h3>
          <div className="flex items-center gap-2">
            <span className="bg-badge-pass text-success text-[12px] font-semibold px-2.5 py-1">
              18 Match
            </span>
            <span className="bg-badge-warn text-warning text-[12px] font-semibold px-2.5 py-1">
              3 Tighter
            </span>
            <span className="bg-badge-fail text-error text-[12px] font-semibold px-2.5 py-1">
              2 Out of Range
            </span>
          </div>
        </div>

        {/* Table */}
        <table className="w-full mt-4">
          <thead>
            <tr className="border-b border-border-light">
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('parameter', { defaultValue: 'Parameter' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('cpLower', { defaultValue: 'CP Lower' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('cpUpper', { defaultValue: 'CP Upper' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('ftLower', { defaultValue: 'FT Lower' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('ftUpper', { defaultValue: 'FT Upper' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5 pr-4">
                {t('margin', { defaultValue: 'Margin' })}
              </th>
              <th className="text-left text-[11px] font-bold text-text-tertiary tracking-[1px] uppercase py-2.5">
                {t('result', { defaultValue: 'Result' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {mockCompareData.map((row, i) => {
              const isMatch = row.result === 'Match'
              const isTighter = row.result === 'Tighter'
              const isOutOfRange = row.result === 'Out of Range'

              const ftValueClass = isOutOfRange
                ? 'text-error font-bold'
                : isTighter
                  ? 'text-warning font-semibold'
                  : ''

              return (
                <tr
                  key={row.param}
                  className={`${i > 0 ? 'border-t border-border-light' : ''}`}
                >
                  <td className="py-3 pr-4 text-[13px] font-semibold text-text-primary">
                    {row.param}
                  </td>
                  <td className="py-3 pr-4 text-[13px] text-text-secondary">
                    {row.cpLower}
                  </td>
                  <td className="py-3 pr-4 text-[13px] text-text-secondary">
                    {row.cpUpper}
                  </td>
                  <td className={`py-3 pr-4 text-[13px] ${ftValueClass || 'text-text-secondary'}`}>
                    {row.ftLower}
                  </td>
                  <td className={`py-3 pr-4 text-[13px] ${ftValueClass || 'text-text-secondary'}`}>
                    {row.ftUpper}
                  </td>
                  <td className="py-3 pr-4 text-[13px] text-text-secondary">
                    {row.margin}
                  </td>
                  <td className="py-3">
                    <span
                      className={`text-[12px] font-semibold px-2.5 py-1 ${
                        isMatch
                          ? 'bg-badge-pass text-success'
                          : isTighter
                            ? 'bg-badge-warn text-warning'
                            : 'bg-badge-fail text-error'
                      }`}
                    >
                      {row.result}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
