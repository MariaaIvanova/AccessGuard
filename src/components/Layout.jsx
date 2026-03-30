import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useEffect, useState, createContext, useContext } from 'react'
import { BRAND_LOGO, BRAND_NAME, BRAND_SHORT_NAME } from '../branding'

const THEME_ORDER = ['light', 'dark', 'pink']

export const ThemeContext = createContext({ dark: false, theme: 'light', toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function getInitialTheme() {
  const savedTheme = localStorage.getItem('theme')
  return THEME_ORDER.includes(savedTheme) ? savedTheme : 'light'
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [theme, setTheme] = useState(getInitialTheme)

  function applyTheme(themeName) {
    const r = document.documentElement
    const s = (k, v) => r.style.setProperty(k, v)

    if (themeName === 'dark') {
      s('--bg', '#111')
      s('--surface', '#1a1a1a')
      s('--card-bg', '#1a1a1a')
      s('--border', '#2a2a2a')
      s('--text', '#f0f0f0')
      s('--text-muted', '#777770')
      s('--text-light', '#444')
      s('--input-bg', '#222')
      s('--table-head', '#1f1f1f')
      s('--btn-bg', '#f0f0f0')
      s('--btn-color', '#111')
    } else if (themeName === 'pink') {
      s(
        '--bg',
        'radial-gradient(circle at 0% 0%, rgba(255, 208, 225, 0.82), transparent 26%), radial-gradient(circle at 100% 10%, rgba(247, 191, 209, 0.72), transparent 22%), radial-gradient(circle at 80% 100%, rgba(255, 224, 234, 0.86), transparent 26%), linear-gradient(180deg, #fffafd 0%, #fff7fa 52%, #fff1f5 100%)'
      )
      s('--surface', 'rgba(255, 255, 255, 0.52)')
      s('--card-bg', 'rgba(255, 255, 255, 0.82)')
      s('--border', 'rgba(223, 150, 176, 0.34)')
      s('--text', '#2b2025')
      s('--text-muted', '#8e7881')
      s('--text-light', '#c3a7b1')
      s('--input-bg', 'rgba(255, 255, 255, 0.72)')
      s('--table-head', 'rgba(255, 244, 248, 0.94)')
      s('--btn-bg', 'linear-gradient(135deg, #dd7fa2, #c9638b)')
      s('--btn-color', '#fffafc')
    } else {
      s('--bg', '#f5f5f3')
      s('--surface', '#fff')
      s('--card-bg', '#fff')
      s('--border', '#e8e8e5')
      s('--text', '#1a1a1a')
      s('--text-muted', '#888880')
      s('--text-light', '#b0b0a8')
      s('--input-bg', '#f5f5f3')
      s('--table-head', '#fafaf9')
      s('--btn-bg', '#1a1a1a')
      s('--btn-color', '#fff')
    }

    document.documentElement.dataset.theme = themeName
    document.body.dataset.theme = themeName
    document.body.style.background =
      themeName === 'dark'
        ? '#111'
        : themeName === 'pink'
        ? 'radial-gradient(circle at 0% 0%, rgba(255, 208, 225, 0.82), transparent 26%), radial-gradient(circle at 100% 10%, rgba(247, 191, 209, 0.72), transparent 22%), radial-gradient(circle at 80% 100%, rgba(255, 224, 234, 0.86), transparent 26%), linear-gradient(180deg, #fffafd 0%, #fff7fa 52%, #fff1f5 100%)'
        : '#f5f5f3'
    document.body.style.backgroundAttachment = themeName === 'pink' ? 'fixed' : 'scroll'
    document.body.style.backgroundRepeat = themeName === 'pink' ? 'no-repeat' : 'repeat'
    document.body.style.color =
      themeName === 'dark' ? '#f0f0f0' : themeName === 'pink' ? '#2b2025' : '#1a1a1a'
    document.body.style.fontFamily = "'Inter', sans-serif"
  }

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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [navigate])

  useEffect(() => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
  }, [theme])

  const isActive = (path) => location.pathname === path
  const isPinkTheme = theme === 'pink'
  const dark = theme === 'dark'
  const nextThemeLabel =
    theme === 'light' ? 'Тъмен режим' : theme === 'dark' ? 'Розов режим' : 'Светъл режим'
  const cycleTheme = () =>
    setTheme((current) => THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length])

  return (
    <ThemeContext.Provider value={{ dark, theme, toggle: cycleTheme }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body, input, select, textarea, button { font-family: 'Inter', sans-serif; }
        body { background: var(--bg); color: var(--text); position: relative; }
        body[data-theme="pink"] { overflow-x: hidden; }
        body[data-theme="pink"]::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle at 10% 20%, rgba(255,255,255,.85) 0 1px, transparent 1.2px),
            radial-gradient(circle at 70% 40%, rgba(255,255,255,.55) 0 1px, transparent 1.3px),
            radial-gradient(circle at 40% 80%, rgba(255,211,226,.8) 0 1px, transparent 1.3px);
          background-size: 180px 180px, 220px 220px, 260px 260px;
          opacity: .55;
          animation: drift 18s linear infinite;
        }
        input::placeholder, textarea::placeholder { color: var(--text-light); }
        select option { background: var(--card-bg); color: var(--text); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        @keyframes drift {
          from { transform: translateY(0px); }
          to { transform: translateY(-36px); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: "'Inter', sans-serif",
          position: 'relative',
          zIndex: 1,
        }}
      >
        <header
          style={{
            height: 56,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            ...(isPinkTheme
              ? {
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: '0 18px 40px rgba(163, 92, 120, 0.11)',
                }
              : {}),
          }}
        >
          <div style={{ height: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Logo + admin badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/dashboard')}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: isPinkTheme ? 'rgba(255,255,255,0.78)' : 'var(--surface)',
                  borderRadius: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  boxShadow: isPinkTheme ? '0 10px 20px rgba(163, 92, 120, 0.14)' : 'none',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img src={BRAND_LOGO} alt={BRAND_NAME} style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.3, lineHeight: 1.2 }}>{BRAND_SHORT_NAME}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{BRAND_NAME.replace(`${BRAND_SHORT_NAME} `, '')}</div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              {[
                { path: '/dashboard', label: 'Табло' },
                { path: '/history', label: 'История' },
                ...(profile?.role === 'admin' ? [{ path: '/schedule', label: 'График' }] : []),
                ...(profile?.role === 'admin' ? [{ path: '/admin', label: 'Администрация' }] : []),
              ].map(({ path, label }) => (
                <div key={path} onClick={() => navigate(path)} style={{ padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: isActive(path) ? 'var(--text)' : 'var(--text-muted)', background: isActive(path) ? 'var(--input-bg)' : 'transparent' }}>
                  {label}
                </div>
              ))}
            </nav>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <button
                onClick={cycleTheme}
                title={nextThemeLabel}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {theme === 'light' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                ) : theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                )}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }} onClick={() => navigate('/profile')}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{profile?.first_name} {profile?.last_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{profile?.role === 'admin' ? 'admin · пълен достъп' : 'потребител'}</div>
                </div>
              </div>

              <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
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
