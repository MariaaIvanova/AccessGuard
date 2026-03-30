/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const DialogContext = createContext({
  showAlert: async () => true,
  showConfirm: async () => false,
})

function normalizeOptions(options) {
  if (typeof options === 'string') {
    return { message: options }
  }

  return options || {}
}

function DialogIcon({ tone }) {
  const palette = {
    default: { background: 'var(--input-bg)', color: 'var(--text-muted)' },
    success: { background: '#f0fdf4', color: '#16a34a' },
    warning: { background: '#fffbeb', color: '#92400e' },
    danger: { background: '#fef2f2', color: '#ef4444' },
  }

  const colors = palette[tone] || palette.default

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: colors.background,
        color: colors.color,
        border: '1px solid var(--border)',
      }}
    >
      {tone === 'success' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : tone === 'danger' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      ) : tone === 'warning' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v4h1" />
        </svg>
      )}
    </div>
  )
}

function AppDialog({ dialog, onConfirm, onCancel }) {
  if (!dialog) return null

  const confirmButtonStyles = {
    default: { background: 'var(--btn-bg)', color: 'var(--btn-color)', border: 'none' },
    success: { background: '#16a34a', color: '#fff', border: 'none' },
    warning: { background: '#f59e0b', color: '#fff', border: 'none' },
    danger: { background: '#ef4444', color: '#fff', border: 'none' },
  }

  const confirmStyle = confirmButtonStyles[dialog.tone] || confirmButtonStyles.default

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(17, 17, 17, 0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 440px)',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '22px 22px 18px', display: 'flex', gap: 14 }}>
          <DialogIcon tone={dialog.tone} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="app-dialog-title" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.3, marginBottom: 8 }}>
              {dialog.title}
            </div>
            <div id="app-dialog-message" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
              {dialog.message}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 22px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {dialog.kind === 'confirm' && (
            <button
              onClick={onCancel}
              style={{
                minWidth: 96,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {dialog.cancelLabel}
            </button>
          )}

          <button
            onClick={onConfirm}
            style={{
              minWidth: 110,
              padding: '10px 14px',
              borderRadius: 10,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              ...confirmStyle,
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolverRef = useRef(null)

  const closeDialog = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result)
      resolverRef.current = null
    }

    setDialog(null)
  }, [])

  const dismissDialog = useCallback(() => {
    closeDialog(dialog?.kind === 'alert')
  }, [closeDialog, dialog])

  const openDialog = useCallback((nextDialog) => (
    new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false)
      }

      resolverRef.current = resolve
      setDialog(nextDialog)
    })
  ), [])

  const showAlert = useCallback((options) => {
    const normalized = normalizeOptions(options)

    return openDialog({
      kind: 'alert',
      title: normalized.title || 'Съобщение',
      message: normalized.message || '',
      confirmLabel: normalized.confirmLabel || 'Разбрах',
      tone: normalized.tone || 'default',
    })
  }, [openDialog])

  const showConfirm = useCallback((options) => {
    const normalized = normalizeOptions(options)

    return openDialog({
      kind: 'confirm',
      title: normalized.title || 'Потвърждение',
      message: normalized.message || '',
      confirmLabel: normalized.confirmLabel || 'Потвърди',
      cancelLabel: normalized.cancelLabel || 'Отказ',
      tone: normalized.tone || 'warning',
    })
  }, [openDialog])

  useEffect(() => {
    if (!dialog) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        dismissDialog()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dialog, dismissDialog])

  const value = useMemo(() => ({
    showAlert,
    showConfirm,
  }), [showAlert, showConfirm])

  return (
    <DialogContext.Provider value={value}>
      {children}
      <AppDialog dialog={dialog} onConfirm={() => closeDialog(true)} onCancel={dismissDialog} />
    </DialogContext.Provider>
  )
}

export function useDialog() {
  return useContext(DialogContext)
}
