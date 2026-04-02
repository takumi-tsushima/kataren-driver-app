import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    driverRef.current = driver
  }, [driver])

  const [shiftDate, setShiftDate] = useState('')
  const [availabilityStatus, setAvailabilityStatus] = useState<'ok' | 'ng'>('ok')
  const [availableFromTime, setAvailableFromTime] = useState('')
  const [maxJobsPerDay, setMaxJobsPerDay] = useState<0 | 1 | 2>(1)
  const [note, setNote] = useState('')
  const [shifts, setShifts] = useState<ShiftAvailability[]>([])

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date))
  }, [shifts])

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
        '認証リンクが無効、または期限切れです。'

      window.history.replaceState({}, document.title, window.location.pathname)
      return message
    }

    return null
  }

  const fetchData = async (background = false) => {
    try {
      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!driverRef.current) {
          setDriver(null)
          setUserEmail(null)
          setShifts([])
        }
        return
      }

      setUserEmail(user.email ?? null)

      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!driverData) {
        if (!driverRef.current) {
          setDriver(null)
        }
        return
      }

      setDriver(driverData)

      const { data: shiftData } = await supabase
        .from('shift_availability')
        .select('*')
        .eq('driver_id', driverData.id)

      setShifts(shiftData ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const hashError = normalizeAuthHash()

    if (hashError) {
      setMessage(hashError)
      setLoading(false)
      return
    }

    fetchData()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchData(true)
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && driverRef.current) {
        fetchData(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const handleLogin = async () => {
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setMessage('メール送信しました')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setDriver(null)
    setUserEmail(null)
    setShifts([])
  }

  const handleSubmit = async () => {
    if (!driver) return

    await supabase.from('shift_availability').upsert({
      driver_id: driver.id,
      shift_date: shiftDate,
      availability_status: availabilityStatus,
      available_from_time: availableFromTime || null,
      max_jobs_per_day: maxJobsPerDay,
      note,
    })

    fetchData(true)
  }

  if (loading) {
    return <div style={page}>読み込み中...</div>
  }

  if (!driver) {
    return (
      <div style={page}>
        <h1>ログイン</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={handleLogin}>ログインリンク送信</button>
        <p>{message}</p>
      </div>
    )
  }

  return (
    <div style={page}>
      <h1>Kataren Driver App</h1>
      <p>{userEmail}</p>
      {refreshing && <p>更新中...</p>}

      <button onClick={handleLogout}>ログアウト</button>

      <h2>シフト提出</h2>
      <input type="date" onChange={(e) => setShiftDate(e.target.value)} />
      <input type="time" onChange={(e) => setAvailableFromTime(e.target.value)} />
      <button onClick={handleSubmit}>保存</button>

      <h2>一覧</h2>
      {sortedShifts.map((s) => (
        <div key={s.id}>
          {s.shift_date} / {s.available_from_time}
        </div>
      ))}
    </div>
  )
}

const page: React.CSSProperties = {
  padding: 24,
  color: '#fff',
  background: '#0b1230',
  minHeight: '100vh',
}

export default App