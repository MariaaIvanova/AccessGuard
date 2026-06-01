import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useOnboarding } from '../context/OnboardingContext'

function buildSteps(role) {
  const steps = [
    {
      target: null,
      title: 'Добре дошли в AccessGuard',
      body: 'Това е системата за контрол на достъп. За 30 секунди ще ви покажем основните функции.',
      icon: 'wave',
    },
    {
      target: '[data-tour="device-indicator"]',
      route: '/dashboard',
      title: 'Статус на устройството',
      body: 'Зелената точка означава, че физическият контролер (ESP32) е свързан и работи. Червена точка = устройството е офлайн.',
      icon: 'signal',
    },
    {
      target: '[data-tour="door-status"]',
      route: '/dashboard',
      title: 'Статус на вратата',
      body: 'Тук виждате дали вратата е отворена или затворена в реално време. Стойността се обновява автоматично без презареждане на страницата.',
      icon: 'door',
    },
    {
      target: '[data-tour="open-pin-btn"]',
      route: '/dashboard',
      title: 'Дистанционно отваряне',
      body: 'Натиснете „Отвори с ПИН" и въведете 4-цифрения си ПИН код за дистанционно отваряне на вратата. ПИН-ът е различен от паролата за вход.',
      icon: 'key',
    },
    {
      target: '[data-tour="nav-history"]',
      title: 'Журнал на влизанията',
      body: 'Всяко влизане се записва автоматично — кога, с кой метод (ПИН, NFC, отпечатък) и резултат. Може да филтрирате и експортирате към CSV.',
      icon: 'list',
    },
    {
      target: '[data-tour="nav-profile"]',
      title: 'Вашият профил',
      body: 'От профила управлявате методите за достъп. Сега ще ви покажем какво трябва да настроите.',
      icon: 'user',
    },
    {
      target: '[data-tour="profile-pin"]',
      route: '/profile',
      title: 'ПИН код',
      body: 'Тук задавате или сменяте 4-цифрения си ПИН код. С него можете да отваряте вратата от клавиатурата на устройството или дистанционно през приложението.',
      icon: 'keypad',
    },
    {
      target: '[data-tour="profile-nfc"]',
      route: '/profile',
      title: 'Регистрация на NFC карта',
      body: 'Натиснете „Регистрирай карта" и доближете NFC картата си до четеца в рамките на 15 секунди. След това можете да отваряте вратата само с допиране на картата — без приложение, без ПИН.',
      icon: 'card',
    },
    {
      target: '[data-tour="profile-fingerprint"]',
      route: '/profile',
      title: 'Регистрация на пръстов отпечатък',
      body: 'Натиснете „Регистрирай отпечатък" и следвайте инструкциите на OLED дисплея — допирате пръст, махате го, допирате го отново. След това вратата ще се отваря само при допиране на сензора.',
      icon: 'finger',
    },
  ]
  if (role === 'admin') {
    steps.push({
      target: '[data-tour="nav-admin"]',
      title: 'Администрация',
      body: 'Като администратор имате достъп до управление на потребители, графици, аварийно заключване, генериране на QR кодове за гости и анализ на данните.',
      icon: 'shield',
    })
  }
  steps.push({
    target: null,
    title: 'Готово!',
    body: 'Това беше всичко. Може да отворите това ръководство отново от иконата „?" в навигационната лента.',
    icon: 'check',
  })
  return steps
}

const ICONS = {
  wave: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11.5V14a5 5 0 0 0 5 5h0a5 5 0 0 0 5-5v-3" />
      <path d="M7 11.5V8a2 2 0 1 1 4 0v3.5" />
      <path d="M11 11.5V6a2 2 0 1 1 4 0v5.5" />
      <path d="M15 11.5V7a2 2 0 1 1 4 0v4.5" />
    </svg>
  ),
  signal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c5 0 5-7 10-7s5 7 10 7" />
      <circle cx="12" cy="17" r="2" />
    </svg>
  ),
  door: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="18" rx="1" /><circle cx="15" cy="12" r="1" />
    </svg>
  ),
  key: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><line x1="10.85" y1="12.15" x2="19" y2="4" /><line x1="18" y1="5" x2="20" y2="7" /><line x1="15" y1="8" x2="17" y2="10" />
    </svg>
  ),
  list: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  user: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  keypad: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="0.5" fill="currentColor" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
      <circle cx="16" cy="8" r="0.5" fill="currentColor" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      <circle cx="16" cy="12" r="0.5" fill="currentColor" />
      <circle cx="8" cy="16" r="0.5" fill="currentColor" />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
      <circle cx="16" cy="16" r="0.5" fill="currentColor" />
    </svg>
  ),
  card: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M14 9a3 3 0 0 1 0 6" />
      <path d="M17 7a6 6 0 0 1 0 10" />
    </svg>
  ),
  finger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 11v6" />
      <path d="M8 13c0-2.21 1.79-4 4-4s4 1.79 4 4v3" />
      <path d="M5 13c0-3.87 3.13-7 7-7s7 3.13 7 7v2" />
      <path d="M9 19c0 1.66 1.34 3 3 3" />
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
}

export default function OnboardingTour() {
  const { showTour, close, role } = useOnboarding()
  const [step, setStep] = useState(0)
  const [box, setBox] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const steps = buildSteps(role)
  const current = steps[step]
  const cardRef = useRef(null)

  // Reset стъпката когато tour-ът се пусне отначало
  useEffect(() => {
    if (showTour) setStep(0)
  }, [showTour])

  useEffect(() => {
    if (!showTour) return
    if (current.route && location.pathname !== current.route) {
      navigate(current.route)
    }
  }, [showTour, step, current.route, location.pathname, navigate])

  useEffect(() => {
    if (!showTour) return
    if (!current.target) {
      setBox(null)
      return
    }

    function tryUpdate() {
      const el = document.querySelector(current.target)
      if (!el) {
        setBox(null)
        return false
      }
      const r = el.getBoundingClientRect()
      setBox({
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        w: r.width,
        h: r.height,
      })
      return true
    }

    // Опитва на 100ms интервали до 2 секунди (за случаи когато страницата
    // още зарежда данни и елементът не е готов веднага)
    let attempts = 0
    const interval = window.setInterval(() => {
      attempts++
      const ok = tryUpdate()
      if (ok || attempts > 20) window.clearInterval(interval)
    }, 100)

    window.addEventListener('resize', tryUpdate)
    window.addEventListener('scroll', tryUpdate, true)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', tryUpdate)
      window.removeEventListener('scroll', tryUpdate, true)
    }
  }, [showTour, step, current.target, location.pathname])

  function complete() {
    close()
  }

  function next() {
    if (step + 1 >= steps.length) complete()
    else setStep(step + 1)
  }
  function prev() {
    if (step > 0) setStep(step - 1)
  }

  // Early return — СЛЕД всички hooks (защото иначе React Hooks правилото се нарушава)
  if (!showTour) return null

  // Позициониране на card-а
  const cardStyle = (() => {
    const base = {
      position: 'fixed',
      width: 'min(360px, calc(100vw - 32px))',
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 20,
      boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      zIndex: 10002,
      animation: 'tour-card-in 0.3s ease',
    }
    if (!box) {
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cardW = Math.min(360, vw - 32)
    const cardH = 220
    const spaceBelow = vh - (box.y + box.h - window.scrollY)
    const spaceAbove = box.y - window.scrollY
    const above = spaceBelow < cardH + 20 && spaceAbove > spaceBelow
    let top, left
    if (above) top = box.y - window.scrollY - cardH - 12
    else top = box.y - window.scrollY + box.h + 12
    left = box.x - window.scrollX + box.w / 2 - cardW / 2
    left = Math.max(16, Math.min(left, vw - cardW - 16))
    top = Math.max(16, Math.min(top, vh - cardH - 16))
    return { ...base, top, left }
  })()

  const padding = 8
  const cutout = box ? {
    x: box.x - window.scrollX - padding,
    y: box.y - window.scrollY - padding,
    w: box.w + padding * 2,
    h: box.h + padding * 2,
  } : null

  return (
    <>
      <style>{`
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Overlay с cutout — затъмнява всичко освен подчертания елемент */}
      <svg
        style={{
          position: 'fixed', inset: 0, width: '100vw', height: '100vh',
          zIndex: 10000, pointerEvents: 'auto',
        }}
        onClick={(e) => {
          // Click извън card-а затваря само ако е извън cutout-а
          if (cutout) {
            const x = e.clientX, y = e.clientY
            if (x >= cutout.x && x <= cutout.x + cutout.w && y >= cutout.y && y <= cutout.y + cutout.h) return
          }
        }}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {cutout && (
              <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx="8" fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
        {cutout && (
          <rect
            x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h}
            rx="8" fill="none" stroke="#fff" strokeWidth="2"
            style={{ animation: 'tour-pulse 1.8s ease-in-out infinite' }}
          />
        )}
      </svg>

      {/* Card */}
      <div ref={cardRef} style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--input-bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text)',
          }}>
            {ICONS[current.icon] || ICONS.wave}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Стъпка {step + 1} от {steps.length}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{current.title}</div>
          </div>
          <button
            onClick={complete}
            title="Пропусни ръководството"
            style={{
              border: 'none', background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 4, borderRadius: 4, lineHeight: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
          {current.body}
        </div>

        {/* Прогрес индикатор */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? 'var(--text)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button
            onClick={prev}
            disabled={step === 0}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'var(--input-bg)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
              cursor: step === 0 ? 'not-allowed' : 'pointer',
              opacity: step === 0 ? 0.4 : 1,
            }}
          >
            Назад
          </button>
          <button
            onClick={next}
            style={{
              padding: '8px 18px', borderRadius: 8,
              background: 'var(--btn-bg)', color: 'var(--btn-color)',
              border: 'none',
              fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {step + 1 >= steps.length ? 'Започни' : 'Напред'}
          </button>
        </div>
      </div>
    </>
  )
}
