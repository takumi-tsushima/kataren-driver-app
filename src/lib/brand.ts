// 店舗名から「ブランドプレフィックス」を抽出するためのルール
// supabase/functions/notify-job-published/index.ts の BRAND_RULES と同等の意味
// （Discord通知 / 請求書PDF で店舗名表示を統一するため）
export const BRAND_RULES: { prefix: string; tag: string }[] = [
  { prefix: 'トヨタレンタカー', tag: 'トヨタ' },
]

// 単一店舗名に対してブランド抽出 + プレフィックス除去
// 例: 'トヨタレンタカー成田空港店' → { brand: 'トヨタ', shortName: '成田空港店' }
//      '渋谷本店'                   → { brand: null, shortName: '渋谷本店' }
export const extractBrandFromLocation = (
  location: string | null | undefined
): { brand: string | null; shortName: string } => {
  if (!location) return { brand: null, shortName: '' }
  for (const rule of BRAND_RULES) {
    if (location.startsWith(rule.prefix)) {
      return { brand: rule.tag, shortName: location.slice(rule.prefix.length) }
    }
  }
  return { brand: null, shortName: location }
}

// pickup と dropoff のペアからブランドを抽出
// - 両方が同じブランド or 片方だけブランド → そのブランドをラベル化、両方からプレフィックスを除去
// - 両方ともブランドなし → brand=null
// - 異なるブランド（将来的に発生しうる）→ pickup を優先
export const extractBrandFromPair = (
  pickup: string | null | undefined,
  dropoff: string | null | undefined
): { brand: string | null; pickupShort: string; dropoffShort: string } => {
  const p = extractBrandFromLocation(pickup)
  const d = extractBrandFromLocation(dropoff)
  return {
    brand: p.brand ?? d.brand,
    pickupShort: p.shortName,
    dropoffShort: d.shortName,
  }
}
