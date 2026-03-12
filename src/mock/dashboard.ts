export const mockDashboard = {
  kpis: [
    { labelKey: 'kpi.lotsReviewed', value: '1,284', delta: '+12%', deltaType: 'positive' as const },
    { labelKey: 'kpi.avgYield', value: '99.2%', delta: '+0.3%', deltaType: 'positive' as const },
    { labelKey: 'kpi.activeVendors', value: '6', delta: '+1 new', deltaType: 'neutral' as const },
    { labelKey: 'kpi.specAlerts', value: '3', delta: '2 critical', deltaType: 'negative' as const },
    { labelKey: 'kpi.aiAnomalies', value: '5', delta: 'needs review', deltaType: 'neutral' as const },
  ],
  yieldTrend: {
    months: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
    vendors: [
      { name: 'JJW / 捷捷微', color: '#C05A3C', data: [99.1, 99.3, 99.0, 99.4, 99.2, 99.3] },
      { name: 'XRW / 祥瑞微', color: '#5C4A3A', data: [98.5, 98.7, 98.9, 98.6, 98.8, 98.7] },
      { name: 'HJM / 華晶微', color: '#4A7C59', data: [97.8, 97.5, 97.9, 98.0, 97.7, 97.8] },
    ],
  },
  vendorPerf: [
    { name: 'JJW / 捷捷微', yield: 99.3 },
    { name: 'XRW / 祥瑞微', yield: 98.7 },
    { name: 'HJM / 華晶微', yield: 97.8 },
  ],
  aiInsights: [
    {
      severity: 'warning' as const,
      title: 'Drift Detected — VTH',
      description: 'VTH parameter showing upward drift over last 5 batches from JJW. Avg shift +0.03V.',
    },
    {
      severity: 'danger' as const,
      title: 'Edge Yield Loss — W12',
      description: 'Wafer W12 from lot PD03414 shows 3.2% edge die failure rate, 2x above baseline.',
    },
    {
      severity: 'success' as const,
      title: 'Process Improvement',
      description: 'XRW RDS(on) variability reduced 15% compared to previous quarter. Cpk improved to 1.58.',
    },
  ],
  recentActivity: [
    { time: '10 min ago', action: 'Lot PD03414 reviewed — 25 wafers PASS', user: 'Zhang Wei' },
    { time: '2 hours ago', action: 'Spec comparison completed — JI30050A', user: 'Li Ming' },
    { time: '5 hours ago', action: 'New lot uploaded — AME216 (XRW)', user: 'Wang Jun' },
  ],
  cpkData: [
    { param: 'VTH', value: 1.85 },
    { param: 'RDS(on)', value: 1.42 },
    { param: 'BVDS', value: 2.31 },
    { param: 'IDSS', value: 0.89 },
  ],
}
