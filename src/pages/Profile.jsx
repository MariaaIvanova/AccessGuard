import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AppLoader from '../components/AppLoader'
import {
  REQUEST_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_STYLES,
  getRequestResponseMap,
} from '../requestUtils'

const inp = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', fontFamily: "'Inter', sans-serif",
  fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
}

const btnPrimary = {
  width: '100%', padding: 10, background: 'var(--btn-bg)', border: 'none',
  borderRadius: 8, color: 'var(--btn-color)', fontFamily: "'Inter', sans-serif",
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  )
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const [requestLogs, setRequestLogs] = useState([])
  const fileRef = useRef()
  const navigate = useNavigate()

  const loadProfile = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    const [profileResult, requestsResult, requestLogsResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('audit_logs')
        .select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)')
        .eq('target_user_id', user.id)
        .in('action', ['request_approved', 'request_rejected'])
        .order('timestamp', { ascending: false }).limit(100),
    ])
    const nextProfile = profileResult.data
    setProfile(nextProfile)
    setFirstName(nextProfile?.first_name || '')
    setLastName(nextProfile?.last_name || '')
    setEmailInput(nextProfile?.email || '')
    setRequests(requestsResult.data || [])
    setRequestLogs(requestLogsResult.data || [])
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const id = window.setTimeout(() => void loadProfile(), 0)
    return () => window.clearTimeout(id)
  }, [loadProfile])

  async function saveProfile() {
    setSaving(true); setSuccess(''); setError('')
    const { error: e } = await supabase.from('users').update({ first_name: firstName, last_name: lastName }).eq('id', profile.id)
    if (e) setError('Грешка при запазване')
    else setSuccess('Профилът е обновен успешно')
    setSaving(false)
  }

  async function changePin() {
    setPinError(''); setPinSuccess('')
    if (!oldPin || !newPin) { setPinError('Моля попълнете и двете полета'); return }
    if (oldPin !== profile?.pin_hash) { setPinError('Старият ПИН е грешен'); return }
    if (newPin.length !== 4 || Number.isNaN(Number(newPin))) { setPinError('Новият ПИН трябва да е 4 цифри'); return }
    if (oldPin === newPin) { setPinError('Новият ПИН трябва да е различен'); return }
    setPinLoading(true)
    const { error: e } = await supabase.from('users').update({ pin_hash: newPin }).eq('id', profile.id)
    if (e) { setPinError('Грешка при промяна') }
    else { setPinSuccess('ПИН кодът е сменен успешно'); setOldPin(''); setNewPin(''); setProfile(c => ({ ...c, pin_hash: newPin })) }
    setPinLoading(false)
  }

  async function changeEmail() {
    const email = emailInput.trim().toLowerCase()
    setEmailError(''); setEmailSuccess('')
    if (!email) { setEmailError('Въведете нов имейл.'); return }
    if (!email.includes('@') || !email.includes('.')) { setEmailError('Въведете валиден имейл адрес.'); return }
    if (email === (profile?.email || '').toLowerCase()) { setEmailError('Новият имейл трябва да е различен.'); return }
    setEmailLoading(true)
    const { error: authError } = await supabase.auth.updateUser({ email })
    if (authError) { setEmailError('Имейлът не можа да бъде променен.'); setEmailLoading(false); return }
    const { data: updated, error: profileError } = await supabase.from('users').update({ email }).eq('id', profile.id).select('*').single()
    if (profileError) { setEmailError('Имейлът в профила не можа да бъде обновен.'); setEmailLoading(false); return }
    setProfile(updated); setEmailInput(updated.email || email)
    setEmailSuccess('Имейлът е обновен успешно.')
    setEmailLoading(false)
  }

  async function changePassword() {
    setPasswordError(''); setPasswordSuccess('')
    if (!newPassword || !confirmPassword) { setPasswordError('Попълнете и двете полета.'); return }
    if (newPassword.length < 6) { setPasswordError('Новата парола трябва да е поне 6 символа.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Паролите не съвпадат.'); return }
    setPasswordLoading(true)
    const { error: e } = await supabase.auth.updateUser({ password: newPassword })
    if (e) { setPasswordError('Паролата не можа да бъде променена.') }
    else { setPasswordSuccess('Паролата е променена успешно.'); setNewPassword(''); setConfirmPassword('') }
    setPasswordLoading(false)
  }

  async function uploadAvatar(event) {
    const file = event.target.files[0]
    if (!file) return
    setUploadingAvatar(true); setError(''); setSuccess('')
    const ext = file.name.split('.').pop()
    const path = `${profile.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setError('Грешка при качване'); setUploadingAvatar(false); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    setProfile(c => ({ ...c, avatar_url: data.publicUrl }))
    setUploadingAvatar(false); setSuccess('Снимката е обновена')
  }

  async function submitRequest() {
    if (!requestMessage.trim()) { setRequestError('Опишете запитването си.'); return }
    setRequestLoading(true); setRequestSuccess(false); setRequestError('')
    const { error: e } = await supabase.from('requests').insert({ user_id: profile.id, type: 'other', message: requestMessage.trim(), status: 'pending' })
    if (e) { setRequestError('Запитването не можа да бъде изпратено.') }
    else { setRequestSuccess(true); setRequestMessage(''); await loadProfile() }
    setRequestLoading(false)
  }

  const responseByRequestId = useMemo(() => getRequestResponseMap(requestLogs), [requestLogs])

  if (loading) return <Layout><AppLoader /></Layout>

  const activeRequests = requests.filter(r => r.status === 'pending')
  const answeredRequests = requests.filter(r => r.status !== 'pending')

  return (
    <Layout>
      <main className="page-main" style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>Моят профил</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Управлявайте вашата информация, ПИН кода и запитванията към администратора</div>
        </div>

        <div className="grid-2col">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Профилна снимка</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--input-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile?.avatar_url ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-muted)' }}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                  <button style={{ padding: '8px 14px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }} onClick={() => fileRef.current.click()} disabled={uploadingAvatar}>{uploadingAvatar ? 'Качване...' : 'Смени снимка'}</button>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>JPG, PNG до 5MB</div>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Лична информация</div>
              {success && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>{success}</div>}
              {error && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Име"><input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} /></Field>
                  <Field label="Фамилия"><input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} /></Field>
                </div>
                <Field label="Имейл"><input style={{ ...inp, color: 'var(--text-muted)' }} value={profile?.email || ''} disabled /></Field>
                <Field label="Роля"><input style={{ ...inp, color: 'var(--text-muted)' }} value={profile?.role === 'admin' ? 'Администратор' : 'Потребител'} disabled /></Field>
                <Field label="Статус"><input style={{ ...inp, color: 'var(--text-muted)' }} value={profile?.status === 'active' ? 'Активен' : 'Изчаква одобрение'} disabled /></Field>
                <button style={btnPrimary} onClick={saveProfile} disabled={saving}>{saving ? 'Запазване...' : 'Запази промените'}</button>
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Смяна на ПИН код</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>Директна смяна без одобрение от администратор</div>
              {pinSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>{pinSuccess}</div>}
              {pinError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>{pinError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <Field label="Стар ПИН"><input style={inp} type="password" placeholder="Стар ПИН" maxLength={4} value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Нов ПИН"><input style={inp} type="password" placeholder="Нов 4-цифрен ПИН" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} /></Field>
                <button style={btnPrimary} onClick={changePin} disabled={pinLoading}>{pinLoading ? 'Промяна...' : 'Смени ПИН'}</button>
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Смяна на имейл</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>Обновете имейла за вход в системата.</div>
              {emailSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>{emailSuccess}</div>}
              {emailError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>{emailError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <Field label="Текущ имейл"><input style={{ ...inp, color: 'var(--text-muted)' }} value={profile?.email || ''} disabled /></Field>
                <Field label="Нов имейл"><input style={inp} type="email" placeholder="new@mail.com" value={emailInput} onChange={e => setEmailInput(e.target.value)} /></Field>
                <button style={btnPrimary} onClick={changeEmail} disabled={emailLoading}>{emailLoading ? 'Промяна...' : 'Смени имейла'}</button>
              </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Смяна на парола</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>Задайте нова парола за вход в профила.</div>
              {passwordSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>{passwordSuccess}</div>}
              {passwordError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>{passwordError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <Field label="Нова парола"><input style={inp} type="password" placeholder="Поне 6 символа" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></Field>
                <Field label="Повтори паролата"><input style={inp} type="password" placeholder="Повторете новата парола" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>
                <button style={btnPrimary} onClick={changePassword} disabled={passwordLoading}>{passwordLoading ? 'Промяна...' : 'Смени паролата'}</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Запитване към администратор</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>Изпратете въпрос или молба. Администраторът ще приеме или откаже запитването и ще ви върне писмен отговор.</div>
              {requestSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>Запитването е изпратено. Ще получите отговор тук.</div>}
              {requestError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>{requestError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Статус"><input value="Ще бъде изпратено до администратор" disabled style={{ ...inp, color: 'var(--text-muted)' }} /></Field>
                <Field label="Описание">
                  <textarea style={{ ...inp, minHeight: 96, resize: 'vertical', paddingTop: 10, lineHeight: 1.5 }}
                    placeholder="Опишете какво ви трябва и как администраторът може да помогне."
                    value={requestMessage} onChange={e => setRequestMessage(e.target.value)} />
                </Field>
                <button style={{ ...btnPrimary, opacity: !requestMessage.trim() ? 0.5 : 1 }} onClick={submitRequest} disabled={requestLoading || !requestMessage.trim()}>
                  {requestLoading ? 'Изпращане...' : 'Изпрати запитване'}
                </button>
              </div>
            </div>

            {activeRequests.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Чакащи запитвания</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeRequests.map((r) => (
                    <div key={r.id} style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{REQUEST_LABELS[r.type] || r.type}</div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...REQUEST_STATUS_STYLES.pending }}>{REQUEST_STATUS_LABELS.pending}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: '#b0b0a8', marginTop: 4 }}>{formatDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {answeredRequests.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Получени отговори</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {answeredRequests.map((r) => {
                    const responseEntry = responseByRequestId[r.id]
                    return (
                      <div key={r.id} style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{REQUEST_LABELS[r.type] || r.type}</div>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...REQUEST_STATUS_STYLES[r.status] }}>{REQUEST_STATUS_LABELS[r.status] || r.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{r.message}</div>
                        <div style={{ padding: '10px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Отговор от администратор</div>
                          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{responseEntry?.response || 'Все още няма добавен писмен отговор.'}</div>
                          {responseEntry?.timestamp && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>{responseEntry.adminName ? `${responseEntry.adminName} · ` : ''}{formatDate(responseEntry.timestamp)}</div>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>{formatDate(r.created_at)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </Layout>
  )
}