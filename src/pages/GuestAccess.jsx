import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { applyTheme, getInitialTheme } from '../components/theme'
import { BRAND_LOGO, BRAND_NAME } from '../branding'

const REASON_TEXT = {
  invalid:        { title: 'Невалиден код', body: 'Този QR код не съществува в системата.' },
  used:           { title: 'Кодът е използван', body: 'Този QR код вече е използван и не може да бъде активиран отново.' },
  expired:        { title: 'Изтекъл код', body: 'Срокът на валидност на този QR код е изтекъл.' },
  not_yet:        { title: 'Кодът още не е активен', body: 'Опитайте отново когато настъпи времето на валидност.' },
  emergency_lock: { title: 'Аварийно заключване', body: 'Вратата е заключена аварийно. Моля, свържете се с администратор.' },
  maintenance:    { title: 'Режим на поддръжка', body: 'Достъпът е блокиран в момента поради режим на поддръжка.' },
  no_device:      { title: 'Устройството не е свързано', body: 'Контролерът на вратата не е свързан в момента.' },
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' })
    + ', ' + new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

export default function GuestAccess() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)         // резултат от get_qr_access_info
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(null)     // резултат от redeem_qr_access
  const [error, setError] = useState('')

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      const { data, error: err } = await supabase.rpc('get_qr_access_info', { p_token: token })
      if (!active) return
      if (err) {
        setError('Грешка при свързване с базата.')
      } else {
        setInfo(data)
      }
      setLoading(false)
    }
    if (token) void load()
    return () => { active = false }
  }, [token])

  async function openDoor() {
    setOpening(true); setError('')
    const { data, error: err } = await supabase.rpc('redeem_qr_access', { p_token: token })
    if (err) {
      setError('Грешка: ' + err.message)
    } else if (!data?.success) {
      setError(REASON_TEXT[data?.reason]?.body || 'Кодът не може да бъде активиран.')
      // Презареди info, за да отрази новата ситуация (used, expired, etc.)
      const { data: fresh } = await supabase.rpc('get_qr_access_info', { p_token: token })
      setInfo(fresh)
    } else {
      setOpened(data)
    }
    setOpening(false)
  }

  // ── UI ─────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.brand}>
        <div style={S.brandIcon}><img src={BRAND_LOGO} alt={BRAND_NAME} style={S.brandLogo} /></div>
        <div style={S.brandText}>{BRAND_NAME}</div>
      </div>

      <div style={S.card}>
        {loading && (
          <div style={S.center}>
            <div style={S.spinner} />
            <div style={S.helperText}>Проверка на кода...</div>
          </div>
        )}

        {!loading && opened && (
          <>
            <div style={S.successCircle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={S.title}>Вратата се отваря</div>
            <div style={S.subtitle}>{opened.guest_name ? `Здравей, ${opened.guest_name}!` : 'Добре дошъл!'}</div>
            <div style={S.helperText}>Кодът беше използван успешно и не може да се активира отново.</div>
          </>
        )}

        {!loading && !opened && info?.valid && (
          <>
            <div style={S.iconWrap}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div style={S.title}>Добре дошъл{info.guest_name ? `, ${info.guest_name}` : ''}!</div>
            <div style={S.subtitle}>{info.door_name || 'Достъп до врата'}</div>
            <div style={S.metaBox}>
              <div style={S.metaLabel}>Валидно до</div>
              <div style={S.metaValue}>{formatDate(info.valid_until)}</div>
            </div>
            {error && <div style={S.error}>{error}</div>}
            <button onClick={openDoor} disabled={opening} style={{ ...S.primaryButton, opacity: opening ? 0.7 : 1 }}>
              {opening ? 'Отваряне...' : 'Отвори вратата'}
            </button>
            <div style={S.note}>Кодът е еднократен — след натискане няма да може да се активира отново.</div>
          </>
        )}

        {!loading && !opened && info && !info.valid && (
          <>
            <div style={S.errorCircle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style={S.title}>{REASON_TEXT[info.reason]?.title || 'Кодът не може да бъде активиран'}</div>
            <div style={S.subtitle}>{REASON_TEXT[info.reason]?.body || 'Моля, свържете се с администратор.'}</div>
            {info.reason === 'not_yet' && info.valid_from && (
              <div style={S.metaBox}>
                <div style={S.metaLabel}>Валиден от</div>
                <div style={S.metaValue}>{formatDate(info.valid_from)}</div>
              </div>
            )}
            {info.reason === 'expired' && info.valid_until && (
              <div style={S.metaBox}>
                <div style={S.metaLabel}>Изтекъл на</div>
                <div style={S.metaValue}>{formatDate(info.valid_until)}</div>
              </div>
            )}
          </>
        )}

        {!loading && error && !info && (
          <>
            <div style={S.errorCircle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div style={S.title}>Грешка</div>
            <div style={S.subtitle}>{error}</div>
          </>
        )}
      </div>

      <div style={S.footer}>{BRAND_NAME} · Гост достъп</div>
    </div>
  )
}

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: "'Inter', sans-serif",
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  brandIcon: {
    width: 36, height: 36, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogo: { width: '85%', height: '85%', objectFit: 'contain' },
  brandText: {
    fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: 'var(--text)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '32px 28px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)',
    boxSizing: 'border-box',
    textAlign: 'center',
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  spinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '3px solid var(--border)', borderTopColor: 'var(--text)',
    animation: 'spin 0.8s linear infinite',
  },
  iconWrap: {
    width: 64, height: 64, margin: '0 auto 16px',
    borderRadius: 16, background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text)',
  },
  successCircle: {
    width: 64, height: 64, margin: '0 auto 16px',
    borderRadius: '50%', background: '#16a34a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  errorCircle: {
    width: 64, height: 64, margin: '0 auto 16px',
    borderRadius: '50%', background: '#ef4444',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 18, fontWeight: 600, color: 'var(--text)',
    marginBottom: 6, lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 13, color: 'var(--text-muted)',
    marginBottom: 20, lineHeight: 1.5,
  },
  metaBox: {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px',
    marginBottom: 16, textAlign: 'left',
  },
  metaLabel: {
    fontSize: 10, fontWeight: 500, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  metaValue: { fontSize: 13, color: 'var(--text)', fontWeight: 500 },
  primaryButton: {
    width: '100%', padding: '12px',
    background: 'var(--btn-bg)', color: 'var(--btn-color)',
    border: 'none', borderRadius: 10,
    fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    transition: 'opacity 0.15s',
  },
  note: {
    fontSize: 11, color: 'var(--text-muted)',
    marginTop: 14, lineHeight: 1.5,
  },
  error: {
    fontSize: 12, color: '#ef4444',
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '8px 12px', marginBottom: 12,
  },
  helperText: { fontSize: 12, color: 'var(--text-muted)' },
  footer: {
    marginTop: 18, fontSize: 11, color: 'var(--text-muted)',
  },
}
