import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { BRAND_BANNER, BRAND_LOGO, BRAND_NAME, BRAND_SUBTITLE } from '../branding'
import { applyTheme, getInitialTheme, nextTheme, nextThemeLabel } from '../components/theme'
import {
  eyeBtnStyle,
  fieldStyle,
  getButtonStyle,
  getInputStyle,
  getTabStyle,
  inputIconStyle,
  inputWrapStyle,
  loginStyles,
} from './Login.styles'

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
  const [theme, setTheme] = useState(getInitialTheme)
  const navigate = useNavigate()

  // Прилагаме записаната тема веднага щом Login страницата се отвори
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const cycleTheme = () => setTheme(t => nextTheme(t))

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
    if (!email.includes('@') || !email.includes('.')) {
      setLoginError('Въведете валиден имейл адрес.')
      setLoginSuccess('')
      return
    }

    setForgotLoading(true)
    setLoginError('')
    setLoginSuccess('')

    const redirectTo = `${window.location.origin}${window.location.pathname}#/login?mode=recovery`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      // Покажи реалното съобщение от Supabase, за да може потребителят да види защо не работи
      const msg = error.message || 'Неизвестна грешка'
      if (msg.toLowerCase().includes('rate limit')) {
        setLoginError('Твърде много опити. Опитайте отново след няколко минути.')
      } else if (msg.toLowerCase().includes('redirect')) {
        setLoginError('Грешка с redirect URL. Свържете се с администратор.')
      } else {
        setLoginError(`Не успяхме да изпратим линк: ${msg}`)
      }
    } else {
      setLoginSuccess('Изпратихме ви линк за нова парола. Проверете входящата си поща (и Spam папката).')
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
    <div style={loginStyles.page}>
      <div style={loginStyles.themeBtnWrap}>
        <button onClick={cycleTheme} title={nextThemeLabel(theme)} style={loginStyles.themeBtn}>
          {theme === 'light' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          ) : theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          )}
        </button>
      </div>
      <div style={loginStyles.brand}>
        <div style={loginStyles.brandIcon}><img src={BRAND_LOGO} alt={BRAND_NAME} style={loginStyles.brandIconImage} /></div>
        <div>
          <div style={loginStyles.brandName}>{BRAND_NAME}</div>
          <div style={loginStyles.brandSub}>{BRAND_SUBTITLE}</div>
        </div>
      </div>

      <div style={loginStyles.card}>
        <div style={loginStyles.bannerWrap}>
          <img src={BRAND_BANNER} alt={BRAND_NAME} style={loginStyles.banner} />
        </div>
        <div style={loginStyles.greeting}>{isRecovery ? 'Нова парола' : 'Добре дошли'}</div>
        <div style={loginStyles.greetingSub}>
          {isRecovery
            ? 'Задайте нова парола за профила си и продължете към системата.'
            : `Влезте или създайте нов акаунт в ${BRAND_NAME}`}
        </div>

        {!isRecovery && (
          <div style={loginStyles.tabs}>
            {['login', 'register'].map((t, i) => (
              <button key={t} onClick={() => setTab(t)} style={getTabStyle(tab === t)}>
                {i === 0 ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>
        )}

        {tab === 'login' && (
          <div style={loginStyles.form}>
            <Field label="Имейл"><Input type="email" placeholder="example@mail.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} icon={<IconMail />} /></Field>
            <Field label="Парола"><Input type="password" placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} icon={<IconLock />} /></Field>
            {loginSuccess && <div style={loginStyles.success}>{loginSuccess}</div>}
            {loginError && <div style={loginStyles.error}>{loginError}</div>}
            <Btn onClick={handleLogin} disabled={loading}>{loading ? 'Влизане...' : 'Вход'}</Btn>
            <div style={loginStyles.helperRow}>
              <button onClick={handleForgotPassword} disabled={forgotLoading} style={loginStyles.linkBtn}>
                {forgotLoading ? 'Изпращане...' : 'Забравена парола?'}
              </button>
            </div>
          </div>
        )}

        {tab === 'register' && (
          <div style={loginStyles.form}>
            {regSuccess ? (
              <div style={loginStyles.success}>Акаунтът е създаден успешно. Изчаквайте одобрение от администратор.</div>
            ) : (
              <>
                <div style={loginStyles.grid2}>
                  <Field label="Име"><Input type="text" placeholder="Мария" value={firstName} onChange={e => setFirstName(e.target.value)} icon={<IconUser />} /></Field>
                  <Field label="Фамилия"><Input type="text" placeholder="Иванова" value={lastName} onChange={e => setLastName(e.target.value)} icon={<IconUser />} /></Field>
                </div>
                <Field label="Имейл"><Input type="email" placeholder="example@mail.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} icon={<IconMail />} /></Field>
                <Field label="Парола"><Input type="password" placeholder="••••••••" value={regPass} onChange={e => setRegPass(e.target.value)} icon={<IconLock />} /></Field>
                <Field label="ПИН код"><Input type="password" placeholder="4-цифрен ПИН" maxLength={4} value={regPin} onChange={e => setRegPin(e.target.value)} icon={<IconPin />} /></Field>
                {regError && <div style={loginStyles.error}>{regError}</div>}
                <Btn onClick={handleRegister} disabled={loading}>{loading ? 'Създаване...' : 'Създай акаунт'}</Btn>
                <div style={loginStyles.note}>Акаунтът ще бъде активиран след одобрение от администратор</div>
              </>
            )}
          </div>
        )}

        {tab === 'recovery' && (
          <div style={loginStyles.form}>
            {recoverySuccess && <div style={loginStyles.success}>{recoverySuccess}</div>}
            {recoveryError && <div style={loginStyles.error}>{recoveryError}</div>}
            <Field label="Нова парола"><Input type="password" placeholder="Поне 6 символа" value={recoveryPass} onChange={e => setRecoveryPass(e.target.value)} icon={<IconLock />} /></Field>
            <Field label="Повтори паролата"><Input type="password" placeholder="Повторете новата парола" value={recoveryConfirm} onChange={e => setRecoveryConfirm(e.target.value)} icon={<IconLock />} /></Field>
            <Btn onClick={handleRecoveryPassword} disabled={recoveryLoading}>{recoveryLoading ? 'Запазване...' : 'Запази новата парола'}</Btn>
            <button onClick={() => setTab('login')} style={loginStyles.linkBtn}>Назад към вход</button>
          </div>
        )}
      </div>

      <div style={loginStyles.footer}>
        <span style={loginStyles.footerText}>{BRAND_NAME} v1.0</span>
        <a href="#" style={loginStyles.footerLink}>Помощ</a>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={fieldStyle}>
      <label style={loginStyles.label}>{label}</label>
      {children}
    </div>
  )
}

function Input({ icon, type, ...props }) {
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const effectiveType = isPassword && showPassword ? 'text' : type
  return (
    <div style={inputWrapStyle}>
      <div style={inputIconStyle}>
        {icon}
      </div>
      <input
        {...props}
        type={effectiveType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={getInputStyle(focused, isPassword)}
      />
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword(s => !s)}
          aria-label={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
          title={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
          style={eyeBtnStyle}
        >
          {showPassword ? <IconEyeOff /> : <IconEye />}
        </button>
      )}
    </div>
  )
}

function Btn({ children, disabled, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={getButtonStyle(hov || disabled)}>
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
const IconEye = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IconEyeOff = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
