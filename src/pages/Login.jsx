import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Login() {
  const [tab, setTab] = useState('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPin, setRegPin] = useState('')
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!loginEmail || !loginPass) { setLoginError('Моля попълнете всички полета'); return }
    setLoading(true); setLoginError('')
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

  return (
    <div style={s.page}>
      <div style={s.brand}>
        <div style={s.brandIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div>
          <div style={s.brandName}>AccessGuard</div>
          <div style={s.brandSub}>Система за контрол на достъп</div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.greeting}>Добре дошли</div>
        <div style={s.greetingSub}>Влезте или създайте нов акаунт</div>

        <div style={s.tabs}>
          {['login', 'register'].map((t, i) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
              {i === 0 ? 'Вход' : 'Регистрация'}
            </button>
          ))}
        </div>

        {tab === 'login' && (
          <div style={s.form}>
            <Field label="Имейл"><Input type="email" placeholder="example@mail.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} icon={<IconMail />} /></Field>
            <Field label="Парола"><Input type="password" placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} icon={<IconLock />} /></Field>
            {loginError && <div style={s.error}>{loginError}</div>}
            <Btn onClick={handleLogin} disabled={loading}>{loading ? 'Влизане...' : 'Вход'}</Btn>
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
      </div>

      <div style={s.footer}>
        <span style={s.footerText}>AccessGuard v1.0</span>
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
      <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b0b0a8', pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 1 }}>
        {icon}
      </div>
      <input
        {...props}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: focused ? '#fff' : '#f5f5f3',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: focused ? '#d4d4d0' : '#e8e8e5',
          borderRadius: 8,
          padding: '10px 12px 10px 38px',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          color: '#1a1a1a',
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
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f3', fontFamily: "'Inter', sans-serif", padding: '24px 16px', boxSizing: 'border-box' },
  brand: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, width: '100%', maxWidth: 420 },
  brandIcon: { width: 32, height: 32, background: '#1a1a1a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15, fontWeight: 600, color: '#1a1a1a', letterSpacing: -0.3 },
  brandSub: { fontSize: 11, color: '#888880', marginTop: 1 },
  card: { width: '100%', maxWidth: 420, background: '#fff', borderWidth: 1, borderStyle: 'solid', borderColor: '#e8e8e5', borderRadius: 12, padding: '28px 24px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)', boxSizing: 'border-box' },
  greeting: { fontSize: 20, fontWeight: 600, color: '#1a1a1a', letterSpacing: -0.4, marginBottom: 3 },
  greetingSub: { fontSize: 13, color: '#888880', marginBottom: 22 },
  tabs: { display: 'flex', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#e8e8e5', marginBottom: 20 },
  tab: { padding: '7px 14px', background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: '#888880', cursor: 'pointer', marginBottom: -1, outline: 'none' },
  tabActive: { color: '#1a1a1a', borderBottomColor: '#1a1a1a' },
  form: { display: 'flex', flexDirection: 'column', gap: 13 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  label: { fontSize: 11, fontWeight: 500, color: '#888880', textTransform: 'uppercase', letterSpacing: 0.4 },
  error: { fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', borderWidth: 1, borderStyle: 'solid', borderColor: '#fecaca', borderRadius: 8 },
  success: { fontSize: 13, color: '#16a34a', padding: '12px 14px', background: '#f0fdf4', borderWidth: 1, borderStyle: 'solid', borderColor: '#bbf7d0', borderRadius: 8, lineHeight: 1.5 },
  btn: { width: '100%', padding: '10px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  note: { fontSize: 11, color: '#888880', textAlign: 'center', lineHeight: 1.5 },
  footer: { display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 420, marginTop: 14, padding: '0 2px' },
  footerText: { fontSize: 11, color: '#b0b0a8' },
  footerLink: { fontSize: 11, color: '#888880', textDecoration: 'none' },
}