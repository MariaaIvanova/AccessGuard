import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useEffect, useState } from 'react'
import { BRAND_LOGO, BRAND_NAME, BRAND_SHORT_NAME } from '../branding'
import './Layout.css'
import { ThemeContext } from './ThemeContext'
import { THEME_ORDER, getInitialTheme, applyTheme, nextThemeLabel as labelOfNext } from './theme'
import { useOnboarding } from '../context/OnboardingContext'

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [theme, setTheme] = useState(getInitialTheme)
  const [menuOpen, setMenuOpen] = useState(false)
  const { resetAndStart: openTour } = useOnboarding()

  useEffect(() => {
    if (!document.getElementById('gfont')) {
      const link = document.createElement('link')
      link.id = 'gfont'; link.rel = 'stylesheet'
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
  }, [navigate])

  // Auto-trigger се прави в OnboardingProvider (App ниво), не тук —
  // за да не се ремаунтва при навигация между страниците

  useEffect(() => {
    localStorage.setItem('theme', theme)
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMenuOpen(false)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [location.pathname])

  const isActive = (path) => location.pathname === path
  const isPinkTheme = theme === 'pink'
  const dark = theme === 'dark'
  const nextThemeLabel = labelOfNext(theme)
  const cycleTheme = () => setTheme((c) => THEME_ORDER[(THEME_ORDER.indexOf(c) + 1) % THEME_ORDER.length])

  const navLinks = [
    { path: '/dashboard', label: 'Табло' },
    { path: '/history', label: 'История' },
    ...(profile?.role === 'admin' ? [{ path: '/schedule', label: 'График' }] : []),
    ...(profile?.role === 'admin' ? [{ path: '/admin', label: 'Администрация' }] : []),
  ]

  return (
    <ThemeContext.Provider value={{ dark, theme, toggle: cycleTheme }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Inter', sans-serif", position: 'relative', zIndex: 1 }}>

        <header style={{
          height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          ...(isPinkTheme ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 18px 40px rgba(163, 92, 120, 0.11)' } : {}),
        }}>
          <div style={{ height: '100%', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/dashboard')}>
              <div style={{ position: 'relative', width: 32, height: 32, background: isPinkTheme ? 'rgba(255,255,255,0.78)' : 'var(--surface)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', boxShadow: isPinkTheme ? '0 10px 20px rgba(163, 92, 120, 0.14)' : 'none', overflow: 'hidden', flexShrink: 0 }}>
                <img src={BRAND_LOGO} alt={BRAND_NAME} style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
              </div>
              <div className="nav-brand-text">
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.3, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {BRAND_SHORT_NAME}
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: 0.5 }}>{BRAND_NAME.replace(`${BRAND_SHORT_NAME} `, '')}</div>
              </div>
            </div>

            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              {navLinks.map(({ path, label }) => (
                <div
                  key={path}
                  onClick={() => navigate(path)}
                  data-tour={path === '/history' ? 'nav-history' : path === '/admin' ? 'nav-admin' : path === '/schedule' ? 'nav-schedule' : undefined}
                  style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: isActive(path) ? 'var(--text)' : 'var(--text-muted)', background: isActive(path) ? 'var(--input-bg)' : 'transparent', whiteSpace: 'nowrap' }}
                >
                  {label}
                </div>
              ))}
            </nav>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>

              <button onClick={openTour} title="Покажи ръководството" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>

              <button onClick={cycleTheme} title={nextThemeLabel} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                {theme === 'light' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                ) : theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                )}
              </button>

              <div className="nav-name-text" data-tour="nav-profile" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }} onClick={() => navigate('/profile')}>
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

              <button className="nav-name-text" onClick={async () => { await supabase.auth.signOut(); navigate('/login') }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>

              <button
                onClick={() => setMenuOpen(o => !o)}
                className="nav-hamburger"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-muted)', display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                {menuOpen
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                }
              </button>
            </div>
          </div>
        </header>

        {menuOpen && (
          <div style={{
            position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
            background: 'var(--card-bg)', borderBottom: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '8px 0',
          }}>
            {navLinks.map(({ path, label }) => (
              <div key={path} onClick={() => navigate(path)} style={{
                padding: '12px 20px', fontSize: 14, fontWeight: 500,
                color: isActive(path) ? 'var(--text)' : 'var(--text-muted)',
                background: isActive(path) ? 'var(--input-bg)' : 'transparent',
                cursor: 'pointer', borderLeft: isActive(path) ? '3px solid var(--text)' : '3px solid transparent',
              }}>
                {label}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <div onClick={() => navigate('/profile')} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>
                }
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{profile?.first_name} {profile?.last_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile?.role === 'admin' ? 'Администратор' : 'Потребител'}</div>
              </div>
            </div>
            <div onClick={async () => { await supabase.auth.signOut(); navigate('/login') }} style={{ padding: '12px 20px', fontSize: 14, fontWeight: 500, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Изход
            </div>
          </div>
        )}

        <div style={{ marginTop: 56, flex: 1 }}>{children}</div>
      </div>
      {/* OnboardingTour сега се рендерира в App.jsx за да оцелява при навигация */}
    </ThemeContext.Provider>
  )
}
