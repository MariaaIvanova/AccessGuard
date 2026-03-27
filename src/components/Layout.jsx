import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useEffect, useState, createContext, useContext } from 'react'

export const ThemeContext = createContext({ dark: false, toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    // Inject Google Font
    if (!document.getElementById('gfont')) {
      const link = document.createElement('link')
      link.id = 'gfont'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
      document.head.appendChild(link)
    }
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    applyTheme(dark)
  }, [dark])

  useEffect(() => { applyTheme(dark) }, [])

  function applyTheme(isDark) {
    const r = document.documentElement
    const s = (k, v) => r.style.setProperty(k, v)
    if (isDark) {
      s('--bg','#111'); s('--surface','#1a1a1a'); s('--card-bg','#1a1a1a')
      s('--border','#2a2a2a'); s('--text','#f0f0f0'); s('--text-muted','#777770')
      s('--text-light','#444'); s('--input-bg','#222'); s('--table-head','#1f1f1f')
      s('--btn-bg','#f0f0f0'); s('--btn-color','#111')
    } else {
      s('--bg','#f5f5f3'); s('--surface','#fff'); s('--card-bg','#fff')
      s('--border','#e8e8e5'); s('--text','#1a1a1a'); s('--text-muted','#888880')
      s('--text-light','#b0b0a8'); s('--input-bg','#f5f5f3'); s('--table-head','#fafaf9')
      s('--btn-bg','#1a1a1a'); s('--btn-color','#fff')
    }
    document.body.style.background = isDark ? '#111' : '#f5f5f3'
    document.body.style.color = isDark ? '#f0f0f0' : '#1a1a1a'
    document.body.style.fontFamily = "'Inter', sans-serif"
  }

  const isActive = (path) => location.pathname === path

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body, input, select, textarea, button { font-family: 'Inter', sans-serif; }
        body { background: var(--bg); color: var(--text); }
        input::placeholder, textarea::placeholder { color: var(--text-light); }
        select option { background: var(--card-bg); color: var(--text); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>

        <header style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
          <div style={{ height: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 20 }}>

            {/* Logo + admin badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/dashboard')}>
              <div style={{ width: 28, height: 28, background: 'var(--btn-bg)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--btn-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.3, lineHeight: 1.2 }}>AccessGuard</div>
                {profile?.role === 'admin' && (
                  <div style={{ fontSize: 10, fontWeight: 500, color: '#f59e0b' }}>⭐ Администратор</div>
                )}
              </div>
            </div>

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              {[
                { path: '/dashboard', label: 'Табло' },
                { path: '/history', label: 'История' },
                { path: '/schedule', label: 'График' },
                ...(profile?.role === 'admin' ? [{ path: '/admin', label: 'Администрация' }] : []),
              ].map(({ path, label }) => (
                <div key={path} onClick={() => navigate(path)} style={{ padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: isActive(path) ? 'var(--text)' : 'var(--text-muted)', background: isActive(path) ? 'var(--input-bg)' : 'transparent' }}>
                  {label}
                </div>
              ))}
            </nav>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <button onClick={() => setDark(d => !d)} title={dark ? 'Светъл режим' : 'Тъмен режим'}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                {dark
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                }
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }} onClick={() => navigate('/profile')}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>
                  }
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{profile?.first_name} {profile?.last_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{profile?.role === 'admin' ? 'admin · пълен достъп' : 'потребител'}</div>
                </div>
              </div>

              <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div style={{ marginTop: 56, flex: 1 }}>{children}</div>
      </div>
    </ThemeContext.Provider>
  )
}