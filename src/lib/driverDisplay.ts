// 共通表示ルール:
// - name が空でなければ name
// - それ以外は email
// - どちらも無い場合は空文字
export type DriverIdentity = {
    name?: string | null
    email?: string | null
}

export const displayDriverName = (driver: DriverIdentity | null | undefined): string => {
    const trimmed = driver?.name?.trim()
    if (trimmed) return trimmed
    return driver?.email ?? ''
}

// 識別を強めたい一覧用：氏名（メール）。氏名未登録なら email のみ
export const displayDriverNameWithEmail = (
    driver: DriverIdentity | null | undefined
): string => {
    const trimmed = driver?.name?.trim()
    const email = driver?.email ?? ''
    if (trimmed && email) return `${trimmed}（${email}）`
    return trimmed || email
}
