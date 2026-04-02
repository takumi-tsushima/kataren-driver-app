import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type Driver = {
  id: string
  email: string
  name: string | null
}

type ShiftAvailability = {
  id: string
  shift_date: string
  availability_status: 'ok' | 'ng'
  available_from_time: string | null
  max_jobs_per_day: 0 | 1 | 2
  note: string | null
}

function App() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [debugStep, setDebugStep] = useState('開始前')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [shiftDate, setShiftDate] = useState('')
  const [availabilityStatus, setAvailabilityStatus] = useState<'ok' | 'ng'>('ok')
  const [availableFromTime, setAvailableFromTime] = useState('')
  const [maxJobsPerDay, setMaxJobsPerDay] = useState<0 | 1 | 2>(1)
  const [note, setNote] = useState('')

  const [shifts, setShifts] = useState<ShiftAvailability[]>([])

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date))
  }, [shifts])

  const fetchDriverAndShifts = async () => {
  try {
    setLoading(true)
    setMessage('')
    setDebugStep('user取得開始')

    const userResponse = await withTimeout(
      supabase.auth.getUser(),
      5000
    )

    const {
      data: { user },
      error: userError,
    } = userResponse

    if (userError) {
      setDebugStep('user取得エラー')
      setMessage(`user取得エラー: ${userError.message}`)
      setDriver(null)
      setUserEmail(null)
      setShifts([])
      return
    }

    if (!user) {
      setDebugStep('未ログイン')
      setDriver(null)
      setUserEmail(null)
      setShifts([])
      return
    }

    setDebugStep('ログインユーザー取得成功')
    setUserEmail(user.email ?? null)

    setDebugStep('drivers検索開始')
    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select('id, email, name')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (driverError) {
      setDebugStep('drivers検索エラー')
      setMessage(`driver取得エラー: ${driverError.message}`)
      setDriver(null)
      return
    }

    if (!driverData) {
      setDebugStep('driversレコードなし')
      setMessage('driversテーブルに自分のレコードが見つかりません')
      setDriver(null)
      setShifts([])
      return
    }

    setDebugStep('drivers取得成功')
    setDriver(driverData)

    setDebugStep('shift取得開始')
    const { data: shiftData, error: shiftError } = await supabase
      .from('shift_availability')
      .select('id, shift_date, availability_status, available_from_time, max_jobs_per_day, note')
      .eq('driver_id', driverData.id)

    if (shiftError) {
      setDebugStep('shift取得エラー')
      setMessage(`shift取得エラー: ${shiftError.message}`)
      setShifts([])
      return
    }

    setDebugStep('shift取得成功')
    setShifts((shiftData ?? []) as ShiftAvailability[])
  } catch (error) {
    console.error(error)
    setDebugStep('catchに到達')
    setMessage(
      error instanceof Error
        ? error.message
        : '予期しないエラーが発生しました'
    )
    setDriver(null)
    setUserEmail(null)
    setShifts([])
  } finally {
    setDebugStep((prev) => `${prev} → loading解除`)
    setLoading(false)
  }
}

const normalizeAuthHash = () => {
  const hash = window.location.hash

  if (!hash) return null

  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const error = params.get('error')
  const errorCode = params.get('error_code')
  const errorDescription = params.get('error_description')

  if (error || errorCode) {
    const message =
      errorDescription?.replace(/\+/g, ' ') ||
      '認証リンクが無効、または期限切れです。もう一度ログインリンクを送ってください。'

    window.history.replaceState({}, document.title, window.location.pathname)
    return message
  }

  return null
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('認証確認がタイムアウトしました'))
    }, ms)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

useEffect(() => {
  const hashErrorMessage = normalizeAuthHash()

  if (hashErrorMessage) {
    setMessage(hashErrorMessage)
    setLoading(false)
    return
  }

  fetchDriverAndShifts()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, _session) => {
    await fetchDriverAndShifts()
  })

  return () => {
    subscription.unsubscribe()
  }
}, [])

  const handleLogin = async () => {
    if (!email) {
      setMessage('メールアドレスを入力してください')
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setMessage(`エラー: ${error.message}`)
      return
    }

    setMessage('ログインリンクを送信しました。メールを確認してください。')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setMessage('ログアウトしました')
  }

  const isLocked = (dateStr: string) => {
    const target = new Date(dateStr)
    const now = new Date()

    target.setHours(0, 0, 0, 0)
    now.setHours(0, 0, 0, 0)

    const diffMs = target.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    return diffDays < 7
  }

  const handleSubmitShift = async () => {
    if (!driver) {
      setMessage('driver情報が見つかりません')
      return
    }

    if (!shiftDate) {
      setMessage('日付を入力してください')
      return
    }

    if (isLocked(shiftDate)) {
      setMessage('7日未満の日付は登録・更新できません')
      return
    }

    setSubmitting(true)
    setMessage('')

    const payload = {
      driver_id: driver.id,
      shift_date: shiftDate,
      availability_status: availabilityStatus,
      available_from_time: availableFromTime || null,
      max_jobs_per_day: maxJobsPerDay,
      note: note || null,
    }

    const { error } = await supabase
      .from('shift_availability')
      .upsert(payload, { onConflict: 'driver_id,shift_date' })

    setSubmitting(false)

    if (error) {
      setMessage(`保存エラー: ${error.message}`)
      return
    }

    setMessage('シフトを保存しました')
    setAvailableFromTime('')
    setNote('')
    await fetchDriverAndShifts()
  }

  if (loading) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <p>読み込み中...</p>
        <p style={{ color: '#c6cee0' }}>debug: {debugStep}</p>
        {message && <p style={{ color: '#ffb4b4' }}>{message}</p>}
      </div>
    </div>
  )
}

  if (!driver) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Kataren Driver App</h1>
          <p style={subTextStyle}>ドライバー向けログイン</p>

          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <button onClick={handleLogin} style={buttonStyle}>
            ログインリンクを送る
          </button>

          {message && <p style={messageStyle}>{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: 24 }}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Kataren Driver App</h1>
          <p style={subTextStyle}>ログイン中: {userEmail}</p>
          <p style={subTextStyle}>ドライバー名: {driver.name ?? '未設定'}</p>

          <button onClick={handleLogout} style={{ ...buttonStyle, maxWidth: 180 }}>
            ログアウト
          </button>
        </div>

        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h2 style={sectionTitleStyle}>シフト提出</h2>

          <label style={labelStyle}>日付</label>
          <input
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            style={inputStyle}
          />

          {shiftDate && isLocked(shiftDate) && (
            <p style={{ ...messageStyle, color: '#ffb4b4' }}>
              この日付は7日未満のため編集できません
            </p>
          )}

          <label style={labelStyle}>稼働可否</label>
          <select
            value={availabilityStatus}
            onChange={(e) => setAvailabilityStatus(e.target.value as 'ok' | 'ng')}
            style={inputStyle}
          >
            <option value="ok">OK</option>
            <option value="ng">NG</option>
          </select>

          <label style={labelStyle}>対応可能開始時刻（任意）</label>
          <input
            type="time"
            value={availableFromTime}
            onChange={(e) => setAvailableFromTime(e.target.value)}
            style={inputStyle}
          />

          <label style={labelStyle}>最大対応本数</label>
          <select
            value={maxJobsPerDay}
            onChange={(e) => setMaxJobsPerDay(Number(e.target.value) as 0 | 1 | 2)}
            style={inputStyle}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>

          <label style={labelStyle}>備考（任意）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' as const }}
          />

          <button onClick={handleSubmitShift} style={buttonStyle} disabled={submitting}>
            {submitting ? '保存中...' : 'シフトを保存'}
          </button>

          {message && <p style={messageStyle}>{message}</p>}
        </div>

        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h2 style={sectionTitleStyle}>提出済みシフト一覧</h2>

          {sortedShifts.length === 0 ? (
            <p style={subTextStyle}>まだ提出されたシフトはありません</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>日付</th>
                    <th style={thStyle}>稼働可否</th>
                    <th style={thStyle}>開始時刻</th>
                    <th style={thStyle}>最大本数</th>
                    <th style={thStyle}>備考</th>
                    <th style={thStyle}>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedShifts.map((shift) => (
                    <tr key={shift.id}>
                      <td style={tdStyle}>{shift.shift_date}</td>
                      <td style={tdStyle}>{shift.availability_status.toUpperCase()}</td>
                      <td style={tdStyle}>{shift.available_from_time ?? '-'}</td>
                      <td style={tdStyle}>{shift.max_jobs_per_day}</td>
                      <td style={tdStyle}>{shift.note ?? '-'}</td>
                      <td style={tdStyle}>
                        {isLocked(shift.shift_date) ? '締切済み' : '編集可'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#071133',
  color: '#fff',
  padding: 24,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  padding: 24,
  boxSizing: 'border-box',
}

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 40,
  lineHeight: 1.1,
}

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 24,
}

const subTextStyle: React.CSSProperties = {
  color: '#c6cee0',
  marginTop: 0,
  marginBottom: 12,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  marginTop: 16,
  color: '#d9e1f2',
  fontWeight: 600,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  boxSizing: 'border-box',
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 20,
  padding: '12px 14px',
  borderRadius: 12,
  border: 'none',
  background: '#6d5efc',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const messageStyle: React.CSSProperties = {
  marginTop: 16,
  color: '#c6cee0',
  lineHeight: 1.6,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid rgba(255,255,255,0.12)',
  padding: '12px 8px',
  color: '#c6cee0',
}

const tdStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  padding: '12px 8px',
}

export default App