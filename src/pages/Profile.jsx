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
import {
  getRequestSubmitButtonStyle,
  getStatusBadgeStyle,
  profileStyles,
} from './Profile.styles'

function Field({ label, children }) {
  return (
    <div style={profileStyles.fieldWrap}>
      <label style={profileStyles.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

const IconEye = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const IconEyeOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        style={{ ...style, paddingRight: 38 }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Скрий паролата' : 'Покажи паролата'}
        title={show ? 'Скрий паролата' : 'Покажи паролата'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 28,
          height: 28,
          border: 'none',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          borderRadius: 6,
          padding: 0,
        }}
      >
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
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
  const [door, setDoor] = useState(null)
  const [nfcEnrolling, setNfcEnrolling] = useState(false)
  const [nfcMessage, setNfcMessage] = useState('')
  const [fpEnrolling, setFpEnrolling] = useState(false)
  const [fpMessage, setFpMessage] = useState('')
  const fileRef = useRef()
  const navigate = useNavigate()

  const loadProfile = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    const [profileResult, requestsResult, requestLogsResult, doorResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('audit_logs')
        .select('*, admin:users!audit_logs_admin_id_fkey(first_name, last_name)')
        .eq('target_user_id', user.id)
        .in('action', ['request_approved', 'request_rejected'])
        .order('timestamp', { ascending: false }).limit(100),
      supabase.from('doors').select('id, name, device_id').limit(1).single(),
    ])
    const nextProfile = profileResult.data
    setProfile(nextProfile)
    setFirstName(nextProfile?.first_name || '')
    setLastName(nextProfile?.last_name || '')
    setEmailInput(nextProfile?.email || '')
    setRequests(requestsResult.data || [])
    setRequestLogs(requestLogsResult.data || [])
    setDoor(doorResult.data || null)
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const id = window.setTimeout(() => void loadProfile(), 0)
    return () => window.clearTimeout(id)
  }, [loadProfile])

  // Realtime: следи дали bridge е записал nfc_uid / fingerprint_ref
  // Използваме useRef за да избегнем пресъздаване на subscription при всяка промяна на profile
  const nfcEnrollingRef = useRef(nfcEnrolling)
  const fpEnrollingRef = useRef(fpEnrolling)

  useEffect(() => {
    nfcEnrollingRef.current = nfcEnrolling
  }, [nfcEnrolling])

  useEffect(() => {
    fpEnrollingRef.current = fpEnrolling
  }, [fpEnrolling])

  useEffect(() => {
    if (!profile?.id) return
    console.log('[Profile] Starting enrollment Realtime subscription for user', profile.id)
    const channel = supabase.channel(`profile-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users',
        filter: `id=eq.${profile.id}`,
      }, (msg) => {
        console.log('[Profile] users UPDATE:', msg)
        const upd = msg.new
        setProfile((p) => ({ ...p, ...upd }))
        if (nfcEnrollingRef.current && upd.nfc_uid) {
          console.log('[Profile] NFC enrollment detected:', upd.nfc_uid)
          setNfcEnrolling(false)
          setNfcMessage(`success:Картата е регистрирана (UID: ${upd.nfc_uid})`)
        }
        if (fpEnrollingRef.current && upd.fingerprint_ref) {
          console.log('[Profile] FP enrollment detected:', upd.fingerprint_ref)
          setFpEnrolling(false)
          setFpMessage(`success:Отпечатъкът е регистриран (slot ${upd.fingerprint_ref})`)
        }
      })
      .subscribe((status) => {
        console.log('[Profile] Enrollment subscription status:', status)
      })
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

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

  async function enrollNfcCard() {
    if (!door?.id) { setNfcMessage('error:Няма намерена врата.'); return }
    if (!door.device_id) { setNfcMessage('error:Вратата няма свързано устройство.'); return }
    setNfcEnrolling(true); setNfcMessage('info:Сложете NFC картата на четеца. Имате 30 секунди.')
    const { error } = await supabase.from('device_commands')
      .insert({
        door_id: door.id, command: 'enroll_nfc',
        payload: { user_id: profile.id, timeout_ms: 30000 },
        issued_by: profile.id, status: 'pending',
      })
    if (error) {
      setNfcEnrolling(false)
      setNfcMessage(`error:Грешка: ${error.message}`)
      return
    }
    setNfcMessage('info:Командата е изпратена към устройството. Сложете NFC картата на четеца.')
    // Resolution идва през Realtime subscription горе
    setTimeout(() => {
      setNfcEnrolling((on) => {
        if (on) setNfcMessage('error:Няма получена карта. Опитайте пак.')
        return false
      })
    }, 32000)
  }

  async function removeNfcCard() {
    setNfcMessage('')
    const { error } = await supabase.from('users').update({ nfc_uid: null }).eq('id', profile.id)
    if (error) setNfcMessage(`error:${error.message}`)
    else { setProfile(c => ({ ...c, nfc_uid: null })); setNfcMessage('success:Картата е премахната') }
  }

  async function enrollFingerprint() {
    if (!door?.id) { setFpMessage('error:Няма намерена врата.'); return }
    if (!door.device_id) { setFpMessage('error:Вратата няма свързано устройство.'); return }
    // Намираме свободен слот (1-127) — от 1 до 127, който още не е зает
    const { data: usedRefs } = await supabase.from('users')
      .select('fingerprint_ref').not('fingerprint_ref', 'is', null)
    const used = new Set((usedRefs || []).map(r => parseInt(r.fingerprint_ref, 10)).filter(n => !isNaN(n)))
    let slot = 1
    while (used.has(slot) && slot < 128) slot++
    if (slot >= 128) { setFpMessage('error:Сензорът е пълен (127 пръста).'); return }

    setFpEnrolling(true)
    setFpMessage(`info:Сложете пръст на сензора. Когато OLED каже „махни", махнете и сложете ПАК. Slot: ${slot}`)
    const { error } = await supabase.from('device_commands')
      .insert({
        door_id: door.id, command: 'enroll_fingerprint',
        payload: { user_id: profile.id, slot, timeout_ms: 30000 },
        issued_by: profile.id, status: 'pending',
      })
    if (error) {
      setFpEnrolling(false)
      setFpMessage(`error:Грешка: ${error.message}`)
      return
    }
    setFpMessage(`info:Командата е изпратена към устройството. Следвайте инструкциите на OLED. Slot: ${slot}`)
    setTimeout(() => {
      setFpEnrolling((on) => {
        if (on) setFpMessage('error:Времето изтече. Опитайте пак.')
        return false
      })
    }, 32000)
  }

  async function removeFingerprint() {
    setFpMessage('')
    const { error } = await supabase.from('users').update({ fingerprint_ref: null }).eq('id', profile.id)
    if (error) setFpMessage(`error:${error.message}`)
    else { setProfile(c => ({ ...c, fingerprint_ref: null })); setFpMessage('success:Отпечатъкът е премахнат') }
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
      <main className="page-main" style={profileStyles.main}>
        <div style={profileStyles.header}>
          <div style={profileStyles.title}>Моят профил</div>
          <div style={profileStyles.subtitle}>Управлявайте вашата информация, ПИН кода и запитванията към администратора</div>
        </div>

        <div className="grid-2col">

          <div style={profileStyles.column}>
            <div style={profileStyles.sectionCard}>
              <div style={profileStyles.sectionTitle}>Профилна снимка</div>
              <div style={profileStyles.avatarRow}>
                <div style={profileStyles.avatarWrap}>
                  {profile?.avatar_url ? <img src={profile.avatar_url} style={profileStyles.avatarImage} /> : <span style={profileStyles.avatarInitials}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" style={profileStyles.hiddenFileInput} onChange={uploadAvatar} />
                  <button style={profileStyles.uploadButton} onClick={() => fileRef.current.click()} disabled={uploadingAvatar}>{uploadingAvatar ? 'Качване...' : 'Смени снимка'}</button>
                  <div style={profileStyles.uploadHint}>JPG, PNG до 5MB</div>
                </div>
              </div>
            </div>

            <div style={profileStyles.sectionCard}>
              <div style={profileStyles.sectionTitle}>Лична информация</div>
              {success && <div style={profileStyles.successNotice}>{success}</div>}
              {error && <div style={profileStyles.errorNotice}>{error}</div>}
              <div style={profileStyles.stack}>
                <div style={profileStyles.twoColumnGrid}>
                  <Field label="Име"><input style={profileStyles.input} value={firstName} onChange={e => setFirstName(e.target.value)} /></Field>
                  <Field label="Фамилия"><input style={profileStyles.input} value={lastName} onChange={e => setLastName(e.target.value)} /></Field>
                </div>
                <Field label="Имейл"><input style={profileStyles.mutedInput} value={profile?.email || ''} disabled /></Field>
                <Field label="Роля"><input style={profileStyles.mutedInput} value={profile?.role === 'admin' ? 'Администратор' : 'Потребител'} disabled /></Field>
                <Field label="Статус"><input style={profileStyles.mutedInput} value={profile?.status === 'active' ? 'Активен' : 'Изчаква одобрение'} disabled /></Field>
                <button style={profileStyles.primaryButton} onClick={saveProfile} disabled={saving}>{saving ? 'Запазване...' : 'Запази промените'}</button>
              </div>
            </div>

            <div style={profileStyles.sectionCard}>
              <div style={profileStyles.groupedSectionHeader}>
                <div style={profileStyles.sectionTitle}>Достъп и сигурност</div>
              </div>

              <div style={profileStyles.settingsGrid}>
                <div data-tour="profile-pin" style={profileStyles.settingPanel}>
                  <div style={profileStyles.sectionTitleCompact}>Смяна на ПИН код</div>
                  <div style={profileStyles.sectionSubtitle}>Директна смяна без одобрение от администратор</div>
                  {pinSuccess && <div style={profileStyles.successNotice}>{pinSuccess}</div>}
                  {pinError && <div style={profileStyles.errorNotice}>{pinError}</div>}
                  <div style={profileStyles.stack}>
                    <Field label="Стар ПИН"><PasswordInput style={profileStyles.input} placeholder="Стар ПИН" maxLength={4} value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g, ''))} /></Field>
                    <Field label="Нов ПИН"><PasswordInput style={profileStyles.input} placeholder="Нов 4-цифрен ПИН" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} /></Field>
                    <button style={profileStyles.primaryButton} onClick={changePin} disabled={pinLoading}>{pinLoading ? 'Промяна...' : 'Смени ПИН'}</button>
                  </div>
                </div>

                <div data-tour="profile-nfc" style={profileStyles.settingPanel}>
                  <div style={profileStyles.sectionTitleCompact}>NFC карта</div>
                  <div style={profileStyles.sectionSubtitle}>
                    Регистрирайте безконтактна карта или гривна за вход. Сложете я върху четеца, когато ви помоли.
                  </div>
                  {nfcMessage && (
                    <div style={{
                      fontSize: 12, padding: '8px 12px', borderRadius: 8, marginTop: 6, marginBottom: 10,
                      ...(nfcMessage.startsWith('error:') ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }
                        : nfcMessage.startsWith('success:') ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                        : { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' })
                    }}>
                      {nfcMessage.replace(/^(error|success|info):/, '')}
                    </div>
                  )}
                  <div style={profileStyles.stack}>
                    <Field label="Текущ UID">
                      <input style={profileStyles.mutedInput} value={profile?.nfc_uid || 'Не е регистрирана'} disabled />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={{ ...profileStyles.primaryButton, flex: 1 }} onClick={enrollNfcCard} disabled={nfcEnrolling}>
                        {nfcEnrolling ? 'Изчаква карта...' : (profile?.nfc_uid ? 'Регистрирай нова' : 'Регистрирай карта')}
                      </button>
                      {profile?.nfc_uid && (
                        <button style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={removeNfcCard}>
                          Премахни
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div data-tour="profile-fingerprint" style={profileStyles.settingPanel}>
                  <div style={profileStyles.sectionTitleCompact}>Пръстов отпечатък</div>
                  <div style={profileStyles.sectionSubtitle}>
                    Регистрацията изисква 2 поставяния. Следвайте инструкциите на OLED дисплея.
                  </div>
                  {fpMessage && (
                    <div style={{
                      fontSize: 12, padding: '8px 12px', borderRadius: 8, marginTop: 6, marginBottom: 10,
                      ...(fpMessage.startsWith('error:') ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }
                        : fpMessage.startsWith('success:') ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                        : { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' })
                    }}>
                      {fpMessage.replace(/^(error|success|info):/, '')}
                    </div>
                  )}
                  <div style={profileStyles.stack}>
                    <Field label="Текущ slot">
                      <input style={profileStyles.mutedInput} value={profile?.fingerprint_ref ? `Slot ${profile.fingerprint_ref}` : 'Не е регистриран'} disabled />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={{ ...profileStyles.primaryButton, flex: 1 }} onClick={enrollFingerprint} disabled={fpEnrolling}>
                        {fpEnrolling ? 'Регистриране...' : (profile?.fingerprint_ref ? 'Регистрирай отново' : 'Регистрирай отпечатък')}
                      </button>
                      {profile?.fingerprint_ref && (
                        <button style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={removeFingerprint}>
                          Премахни
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={profileStyles.settingPanel}>
                  <div style={profileStyles.sectionTitleCompact}>Смяна на имейл</div>
                  <div style={profileStyles.sectionSubtitle}>Обновете имейла за вход в системата.</div>
                  {emailSuccess && <div style={profileStyles.successNotice}>{emailSuccess}</div>}
                  {emailError && <div style={profileStyles.errorNotice}>{emailError}</div>}
                  <div style={profileStyles.stack}>
                    <Field label="Текущ имейл"><input style={profileStyles.mutedInput} value={profile?.email || ''} disabled /></Field>
                    <Field label="Нов имейл"><input style={profileStyles.input} type="email" placeholder="new@mail.com" value={emailInput} onChange={e => setEmailInput(e.target.value)} /></Field>
                    <button style={profileStyles.primaryButton} onClick={changeEmail} disabled={emailLoading}>{emailLoading ? 'Промяна...' : 'Смени имейла'}</button>
                  </div>
                </div>

                <div style={{ ...profileStyles.settingPanel, ...profileStyles.settingPanelWide }}>
                  <div style={profileStyles.sectionTitleCompact}>Смяна на парола</div>
                  <div style={profileStyles.sectionSubtitle}>Задайте нова парола за вход в профила.</div>
                  {passwordSuccess && <div style={profileStyles.successNotice}>{passwordSuccess}</div>}
                  {passwordError && <div style={profileStyles.errorNotice}>{passwordError}</div>}
                  <div style={profileStyles.twoColumnGrid}>
                    <Field label="Нова парола"><PasswordInput style={profileStyles.input} placeholder="Поне 6 символа" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></Field>
                    <Field label="Повтори паролата"><PasswordInput style={profileStyles.input} placeholder="Повторете новата парола" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>
                  </div>
                  <div style={{ marginTop: 13 }}>
                    <button style={profileStyles.primaryButton} onClick={changePassword} disabled={passwordLoading}>{passwordLoading ? 'Промяна...' : 'Смени паролата'}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={profileStyles.column}>
            <div style={profileStyles.sectionCard}>
              <div style={profileStyles.sectionTitleCompact}>Запитване към администратор</div>
              <div style={profileStyles.sectionSubtitle}>Изпратете въпрос или молба. Администраторът ще приеме или откаже запитването и ще ви върне писмен отговор.</div>
              {requestSuccess && <div style={profileStyles.requestSuccessNotice}>Запитването е изпратено. Ще получите отговор тук.</div>}
              {requestError && <div style={profileStyles.errorNotice}>{requestError}</div>}
              <div style={profileStyles.requestStack}>
                <Field label="Статус"><input value="Ще бъде изпратено до администратор" disabled style={profileStyles.requestStatusInput} /></Field>
                <Field label="Описание">
                  <textarea style={profileStyles.requestTextarea}
                    placeholder="Опишете какво ви трябва и как администраторът може да помогне."
                    value={requestMessage} onChange={e => setRequestMessage(e.target.value)} />
                </Field>
                <button style={getRequestSubmitButtonStyle(!requestMessage.trim())} onClick={submitRequest} disabled={requestLoading || !requestMessage.trim()}>
                  {requestLoading ? 'Изпращане...' : 'Изпрати запитване'}
                </button>
              </div>
            </div>

            {activeRequests.length > 0 && (
              <div style={profileStyles.sectionCard}>
                <div style={profileStyles.sectionTitle}>Чакащи запитвания</div>
                <div style={profileStyles.requestList}>
                  {activeRequests.map((r) => (
                    <div key={r.id} style={profileStyles.requestPendingCard}>
                      <div style={profileStyles.requestHeader}>
                        <div style={profileStyles.pendingRequestTitle}>{REQUEST_LABELS[r.type] || r.type}</div>
                        <span style={getStatusBadgeStyle(REQUEST_STATUS_STYLES.pending)}>{REQUEST_STATUS_LABELS.pending}</span>
                      </div>
                      <div style={profileStyles.pendingMessage}>{r.message}</div>
                      <div style={profileStyles.pendingMeta}>{formatDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {answeredRequests.length > 0 && (
              <div style={profileStyles.sectionCard}>
                <div style={profileStyles.sectionTitle}>Получени отговори</div>
                <div style={profileStyles.requestList}>
                  {answeredRequests.map((r) => {
                    const responseEntry = responseByRequestId[r.id]
                    return (
                      <div key={r.id} style={profileStyles.requestAnsweredCard}>
                        <div style={profileStyles.requestHeader}>
                          <div style={profileStyles.answeredRequestTitle}>{REQUEST_LABELS[r.type] || r.type}</div>
                          <span style={getStatusBadgeStyle(REQUEST_STATUS_STYLES[r.status])}>{REQUEST_STATUS_LABELS[r.status] || r.status}</span>
                        </div>
                        <div style={profileStyles.answeredMessage}>{r.message}</div>
                        <div style={profileStyles.responseBox}>
                          <div style={profileStyles.responseLabel}>Отговор от администратор</div>
                          <div style={profileStyles.responseText}>{responseEntry?.response || 'Все още няма добавен писмен отговор.'}</div>
                          {responseEntry?.timestamp && <div style={profileStyles.answeredMeta}>{responseEntry.adminName ? `${responseEntry.adminName} · ` : ''}{formatDate(responseEntry.timestamp)}</div>}
                        </div>
                        <div style={profileStyles.answeredMeta}>{formatDate(r.created_at)}</div>
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
