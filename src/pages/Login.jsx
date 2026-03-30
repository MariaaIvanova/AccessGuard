import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { BRAND_BANNER, BRAND_LOGO, BRAND_NAME, BRAND_SUBTITLE } from '../branding'

export default function Login() {
  const [tab, setTab] = useState('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSuccess, setLoginSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPin, setRegPin] = useState('')
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [recoveryPass, setRecoveryPass] = useState('')
  const [recoveryConfirm, setRecoveryConfirm] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySuccess, setRecoverySuccess] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    async function detectRecoveryMode() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) return

      if ((window.location.href.includes('type=recovery') || window.location.href.includes('mode=recovery')) && session) {
        setTab('recovery')
      }
    }

    void detectRecoveryMode()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (window.location.href.includes('type=recovery') || window.location.href.includes('mode=recovery')))) {
        setTab('recovery')
        setLoginError('')
        setLoginSuccess('')
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async () => {
    if (!loginEmail || !loginPass) { setLoginError('Моля попълнете всички полета'); return }
    setLoading(true); setLoginError(''); setLoginSuccess('')
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPass })
    if (error) setLoginError('Грешен имейл или парола')
    else navigate('/dashboard')
    setLoading(false)
  }

  const handleRegister = async () => {
    if (!firstName || !lastName || !regEmail || !regPass || !regPin) { setRegError('Моля попълнете всички полета'); return }
    if (regPin.length !== 4 || isNaN(regPin)) { setRegError('ПИН кодът трябва да е 4 цифри'); return }
    setLoading(true); setRegError('')
    const { data, error } = await supabase.auth.signUp({ email: regEmail, password: regPass })
    if (error) { setRegError(error.message); setLoading(false); return }
    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id, first_name: firstName, last_name: lastName,
        email: regEmail, pin_hash: regPin, role: 'user', status: 'pending',
      })
    }
    setRegSuccess(true); setLoading(false)
  }

  const handleForgotPassword = async () => {
    const email = loginEmail.trim().toLowerCase()

    if (!email) {
      setLoginError('Въведете имейл, за да изпратим линк за нова парола.')
      setLoginSuccess('')
      return
    }

    setForgotLoading(true)
    setLoginError('')
    setLoginSuccess('')

    const redirectTo = `${window.location.origin}${window.location.pathname}#/login?mode=recovery`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      setLoginError('Не успяхме да изпратим линк за нова парола.')
    } else {
      setLoginSuccess('Изпратихме ви линк за нова парола. Проверете входящата си поща.')
    }

    setForgotLoading(false)
  }

  const handleRecoveryPassword = async () => {
    setRecoveryError('')
    setRecoverySuccess('')

    if (!recoveryPass || !recoveryConfirm) {
      setRecoveryError('Попълнете и двете полета.')
      return
    }

    if (recoveryPass.length < 6) {
      setRecoveryError('Новата парола трябва да е поне 6 символа.')
      return
    }

    if (recoveryPass !== recoveryConfirm) {
      setRecoveryError('Паролите не съвпадат.')
      return
    }

    setRecoveryLoading(true)

    const { error } = await supabase.auth.updateUser({ password: recoveryPass })

    if (error) {
      setRecoveryError('Паролата не можа да бъде обновена.')
      setRecoveryLoading(false)
      return
    }

    setRecoverySuccess('Паролата е обновена успешно. Пренасочваме ви към таблото.')
    setRecoveryLoading(false)
    window.setTimeout(() => navigate('/dashboard'), 900)
  }

  const isRecovery = tab === 'recovery'

  return (
    <div style={s.page}>
      <div style={s.brand}>
        <div style={s.brandIcon}><img src={BRAND_LOGO} alt={BRAND_NAME} style={s.brandIconImage} /></div>
        <div>
          <div style={s.brandName}>{BRAND_NAME}</div>
          <div style={s.brandSub}>{BRAND_SUBTITLE}</div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.bannerWrap}>
          <img src={BRAND_BANNER} alt={BRAND_NAME} style={s.banner} />
        </div>
        <div style={s.greeting}>{isRecovery ? 'Нова парола' : 'Добре дошли'}</div>
        <div style={s.greetingSub}>
          {isRecovery
            ? 'Задайте нова парола за профила си и продължете към системата.'
            : `Влезте или създайте нов акаунт в ${BRAND_NAME}`}
        </div>

        {!isRecovery && (
          <div style={s.tabs}>
            {['login', 'register'].map((t, i) => (
              <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
                {i === 0 ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>
        )}

        {tab === 'login' && (
          <div style={s.form}>
            <Field label="Имейл"><Input type="email" placeholder="example@mail.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} icon={<IconMail />} /></Field>
            <Field label="Парола"><Input type="password" placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} icon={<IconLock />} /></Field>
            {loginSuccess && <div style={s.success}>{loginSuccess}</div>}
            {loginError && <div style={s.error}>{loginError}</div>}
            <Btn onClick={handleLogin} disabled={loading}>{loading ? 'Влизане...' : 'Вход'}</Btn>
            <div style={s.helperRow}>
              <button onClick={handleForgotPassword} disabled={forgotLoading} style={s.linkBtn}>
                {forgotLoading ? 'Изпращане...' : 'Забравена парола?'}
              </button>
            </div>
          </div>
        )}

        {tab === 'register' && (
          <div style={s.form}>
            {regSuccess ? (
              <div style={s.success}>Акаунтът е създаден успешно. Изчаквайте одобрение от администратор.</div>
            ) : (
              <>
                <div style={s.grid2}>
                  <Field label="Име"><Input type="text" placeholder="Мария" value={firstName} onChange={e => setFirstName(e.target.value)} icon={<IconUser />} /></Field>
                  <Field label="Фамилия"><Input type="text" placeholder="Иванова" value={lastName} onChange={e => setLastName(e.target.value)} icon={<IconUser />} /></Field>
                </div>
                <Field label="Имейл"><Input type="email" placeholder="example@mail.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} icon={<IconMail />} /></Field>
                <Field label="Парола"><Input type="password" placeholder="••••••••" value={regPass} onChange={e => setRegPass(e.target.value)} icon={<IconLock />} /></Field>
                <Field label="ПИН код"><Input type="password" placeholder="4-цифрен ПИН" maxLength={4} value={regPin} onChange={e => setRegPin(e.target.value)} icon={<IconPin />} /></Field>
                {regError && <div style={s.error}>{regError}</div>}
                <Btn onClick={handleRegister} disabled={loading}>{loading ? 'Създаване...' : 'Създай акаунт'}</Btn>
                <div style={s.note}>Акаунтът ще бъде активиран след одобрение от администратор</div>
              </>
            )}
          </div>
        )}

        {tab === 'recovery' && (
          <div style={s.form}>
            {recoverySuccess && <div style={s.success}>{recoverySuccess}</div>}
            {recoveryError && <div style={s.error}>{recoveryError}</div>}
            <Field label="Нова парола"><Input type="password" placeholder="Поне 6 символа" value={recoveryPass} onChange={e => setRecoveryPass(e.target.value)} icon={<IconLock />} /></Field>
            <Field label="Повтори паролата"><Input type="password" placeholder="Повторете новата парола" value={recoveryConfirm} onChange={e => setRecoveryConfirm(e.target.value)} icon={<IconLock />} /></Field>
            <Btn onClick={handleRecoveryPassword} disabled={recoveryLoading}>{recoveryLoading ? 'Запазване...' : 'Запази новата парола'}</Btn>
            <button onClick={() => setTab('login')} style={s.linkBtn}>Назад към вход</button>
          </div>
        )}
      </div>

      <div style={s.footer}>
        <span style={s.footerText}>{BRAND_NAME} v1.0</span>
        <a href="#" style={s.footerLink}>Помощ</a>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  )
}

function Input({ icon, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#c69ba9', pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 1 }}>
        {icon}
      </div>
      <input
        {...props}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: focused ? '#fffdfd' : '#fff6f9',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: focused ? '#eab3c6' : '#f0d7e1',
          borderRadius: 8,
          padding: '10px 12px 10px 38px',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          color: '#3a2b32',
          outline: 'none',
          boxSizing: 'border-box',
          WebkitAppearance: 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      />
    </div>
  )
}

function Btn({ children, disabled, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...s.btn, opacity: hov || disabled ? 0.8 : 1 }}>
      {children}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
  )
}

const IconMail = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
const IconLock = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const IconUser = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconPin = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>

const s = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 0% 0%, rgba(255, 208, 225, 0.72), transparent 26%), radial-gradient(circle at 100% 10%, rgba(247, 191, 209, 0.58), transparent 22%), linear-gradient(180deg, #fffafd 0%, #fff5f8 100%)', fontFamily: "'Inter', sans-serif", padding: '24px 16px', boxSizing: 'border-box' },
  brand: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, width: '100%', maxWidth: 420 },
  brandIcon: { width: 40, height: 40, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(223, 150, 176, 0.34)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(163, 92, 120, 0.1)', overflow: 'hidden' },
  brandIconImage: { width: '88%', height: '88%', objectFit: 'contain' },
  brandName: { fontSize: 17, fontWeight: 600, color: '#372830', letterSpacing: -0.4 },
  brandSub: { fontSize: 11, color: '#b26484', marginTop: 1, letterSpacing: 2.4 },
  card: { width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.86)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(223, 150, 176, 0.34)', borderRadius: 20, padding: '24px 24px 24px', boxShadow: '0 18px 40px rgba(163, 92, 120, 0.11)', boxSizing: 'border-box', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' },
  bannerWrap: { width: '100%', background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(223, 150, 176, 0.26)', marginBottom: 20, boxShadow: '0 10px 24px rgba(163, 92, 120, 0.08)' },
  banner: { display: 'block', width: '100%', height: 128, objectFit: 'cover', objectPosition: 'center 42%' },
  greeting: { fontSize: 20, fontWeight: 600, color: '#372830', letterSpacing: -0.4, marginBottom: 3 },
  greetingSub: { fontSize: 13, color: '#8e7881', marginBottom: 22, lineHeight: 1.5 },
  tabs: { display: 'flex', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'rgba(223, 150, 176, 0.26)', marginBottom: 20 },
  tab: { padding: '7px 14px', background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: '#8e7881', cursor: 'pointer', marginBottom: -1, outline: 'none' },
  tabActive: { color: '#8f395d', borderBottomColor: '#c9638b' },
  form: { display: 'flex', flexDirection: 'column', gap: 13 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  label: { fontSize: 11, fontWeight: 500, color: '#8e7881', textTransform: 'uppercase', letterSpacing: 0.4 },
  error: { fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', borderWidth: 1, borderStyle: 'solid', borderColor: '#fecaca', borderRadius: 8 },
  success: { fontSize: 13, color: '#16a34a', padding: '12px 14px', background: '#f0fdf4', borderWidth: 1, borderStyle: 'solid', borderColor: '#bbf7d0', borderRadius: 8, lineHeight: 1.5 },
  btn: { width: '100%', padding: '10px', background: 'linear-gradient(135deg, #dd7fa2, #c9638b)', border: 'none', borderRadius: 10, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2, boxShadow: '0 12px 22px rgba(201, 99, 139, 0.22)' },
  note: { fontSize: 11, color: '#8e7881', textAlign: 'center', lineHeight: 1.5 },
  helperRow: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  linkBtn: { padding: 0, background: 'none', border: 'none', color: '#8f395d', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' },
  footer: { display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 420, marginTop: 14, padding: '0 2px' },
  footerText: { fontSize: 11, color: '#c3a7b1' },
  footerLink: { fontSize: 11, color: '#8e7881', textDecoration: 'none' },
}
