import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type User = {
  email?: string
}

function App() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        setUser({ email: session.user.email })
      }
      setLoading(false)
    }

    fetchSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ email: session.user.email })
      } else {
        setUser(null)
      }
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

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1020',
          color: '#fff',
        }}
      >
        読み込み中...
      </div>
    )
  }

  if (user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0b1020',
          color: '#fff',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <h1 style={{ marginTop: 0 }}>Kataren Driver App</h1>
          <p>ログイン中: {user.email}</p>

          <div style={{ marginTop: '24px' }}>
            <h2>仮ホーム</h2>
            <ul>
              <li>シフト提出</li>
              <li>募集一覧</li>
              <li>請求書一覧</li>
            </ul>
          </div>

          <button
            onClick={handleLogout}
            style={{
              marginTop: '24px',
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              background: '#6d5efc',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ログアウト
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1020',
        color: '#fff',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '24px',
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: '8px' }}>Kataren Driver App</h1>
        <p style={{ marginTop: 0, marginBottom: '20px', color: '#b8c0d0' }}>
          ドライバー向けテストログイン
        </p>

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            marginBottom: '12px',
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={handleLogin}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '12px',
            border: 'none',
            background: '#6d5efc',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ログインリンクを送る
        </button>

        {message && (
          <p style={{ marginTop: '16px', color: '#b8c0d0', lineHeight: 1.6 }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default App
