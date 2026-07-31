// Short site (廠區) labels for AD domain codes — mirrors AD_DOMAINS on the
// backend (server/app/services/ad_auth.py). Used to badge which site a lot
// belongs to (mainly for admins, who see every site).
export const SITE_LABELS: Record<string, string> = {
  PANJIT: '台灣',
  PYNMAX: '環茂',
  WXPJ: '無錫',
  PJWS: '深圳',
  GDPJ: '蘇州',
  PJXZ: '徐州',
  PJSD: '山東',
}

/** Friendly short label for a domain code; '未分廠' for null/legacy lots. */
export function siteLabel(domain?: string | null): string {
  if (!domain) return '未分廠'
  return SITE_LABELS[domain] ?? domain
}
