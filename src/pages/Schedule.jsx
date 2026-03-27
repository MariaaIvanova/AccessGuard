import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

const inp = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }
const btnPrimary = { width: '100%', padding: 10, background: 'var(--btn-bg)', border: 'none', borderRadius: 8, color: 'var(--btn-color)', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: 'pointer' }

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  )
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
  const [reqType, setReqType] = useState('fingerprint')
  const [reqMsg, setReqMsg] = useState('')
  const [reqSuccess, setReqSuccess] = useState(false)
  const [reqLoading, setReqLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const fileRef = useRef()
  const navigate = useNavigate()

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    setFirstName(prof?.first_name || '')
    setLastName(prof?.last_name || '')
    const { data: reqs } = await supabase.from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setRequests(reqs || [])
    setLoading(false)
  }

  async function saveProfile() {
    setSaving(true); setSuccess(''); setError('')
    const { error } = await supabase.from('users').update({ first_name: firstName, last_name: lastName }).eq('id', profile.id)
    if (error) setError('Грешка при запазване')
    else setSuccess('Профилът е обновен успешно')
    setSaving(false)
  }

  async function changePin() {
    setPinError(''); setPinSuccess('')
    if (!oldPin || !newPin) { setPinError('Моля попълнете и двете полета'); return }
    if (oldPin !== profile?.pin_hash) { setPinError('Старият ПИН е грешен'); return }
    if (newPin.length !== 4 || isNaN(newPin)) { setPinError('Новият ПИН трябва да е 4 цифри'); return }
    if (oldPin === newPin) { setPinError('Новият ПИН трябва да е различен'); return }
    setPinLoading(true)
    const { error } = await supabase.from('users').update({ pin_hash: newPin }).eq('id', profile.id)
    if (error) setPinError('Грешка при промяна')
    else { setPinSuccess('ПИН кодът е сменен успешно'); setOldPin(''); setNewPin(''); setProfile(p => ({ ...p, pin_hash: newPin })) }
    setPinLoading(false)
  }

  async function uploadAvatar(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingAvatar(true); setError(''); setSuccess('')
    const ext = file.name.split('.').pop()
    const { error: uploadError } = await supabase.storage.from('avatars').upload(`${profile.id}.${ext}`, file, { upsert: true })
    if (uploadError) { setError('Грешка при качване'); setUploadingAvatar(false); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(`${profile.id}.${ext}`)
    await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    setProfile(p => ({ ...p, avatar_url: data.publicUrl }))
    setUploadingAvatar(false); setSuccess('Снимката е обновена')
  }

  async function submitRequest() {
    if (!reqMsg.trim()) return
    setReqLoading(true); setReqSuccess(false)
    const { error } = await supabase.from('requests').insert({ user_id: profile.id, type: reqType, message: reqMsg, status: 'pending' })
    if (!error) { setReqSuccess(true); setReqMsg(''); loadProfile() }
    setReqLoading(false)
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
      new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
  }

  const REQUEST_LABELS = { pin: 'ПИН код', fingerprint: 'Пръстов отпечатък', nfc: 'NFC карта', other: 'Друго' }
  const STATUS_STYLES = {
    pending: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    approved: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    rejected: { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' },
  }
  const STATUS_LABELS = { pending: 'Изчаква', approved: 'Одобрено', rejected: 'Отказано' }

  if (loading) return <Layout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Зареждане...</div></Layout>

  const activeReqs = requests.filter(r => r.status === 'pending')
  const pastReqs = requests.filter(r => r.status !== 'pending')

  return (
    <Layout>
      <main style={{ padding: '28px 32px 40px', background: 'var(--bg)', minHeight: 'calc(100vh - 56px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: 'var(--text)', marginBottom: 3 }}>Моят профил</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Управлявайте вашата информация и методи за достъп</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Профилна снимка</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--input-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-muted)' }}>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</span>
                  }
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
                  <button style={{ padding: '8px 14px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }} onClick={() => fileRef.current.click()} disabled={uploadingAvatar}>
                    {uploadingAvatar ? 'Качване...' : 'Смени снимка'}
                  </button>
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
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Single inquiry panel */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Подай запитване</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Изпратете запитване към администратора за промяна на метод за достъп или друг въпрос
              </div>
              {reqSuccess && <div style={{ fontSize: 12, color: '#16a34a', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12 }}>Запитването е изпратено! Очаквайте одобрение.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Тип запитване">
                  <select style={inp} value={reqType} onChange={e => setReqType(e.target.value)}>
                    <option value="fingerprint">Пръстов отпечатък — регистриране/смяна</option>
                    <option value="nfc">NFC карта — регистриране/смяна</option>
                    <option value="pin">ПИН код — нулиране (забравен)</option>
                    <option value="other">Друго запитване</option>
                  </select>
                </Field>

                {(reqType === 'fingerprint' || reqType === 'nfc') && (
                  <div style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {reqType === 'fingerprint' ? '👆 Администраторът ще ви помоли да се явите физически за регистриране' : '💳 Администраторът ще регистрира нова или съществуваща NFC карта'}
                  </div>
                )}

                <Field label="Описание">
                  <textarea
                    style={{ ...inp, minHeight: 90, resize: 'vertical', paddingTop: 10, lineHeight: 1.5 }}
                    placeholder={
                      reqType === 'fingerprint' ? 'Напр: Искам да регистрирам нов пръстов отпечатък...' :
                      reqType === 'nfc' ? 'Напр: Изгубих картата си, нуждая се от нова...' :
                      reqType === 'pin' ? 'Напр: Забравих ПИН кода си...' :
                      'Опишете вашия въпрос или проблем...'
                    }
                    value={reqMsg}
                    onChange={e => setReqMsg(e.target.value)}
                  />
                </Field>
                <button style={{ ...btnPrimary, opacity: !reqMsg.trim() ? 0.5 : 1 }} onClick={submitRequest} disabled={reqLoading || !reqMsg.trim()}>
                  {reqLoading ? 'Изпращане...' : 'Изпрати запитване'}
                </button>
              </div>
            </div>

            {activeReqs.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Активни запитвания</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeReqs.map(r => (
                    <div key={r.id} style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{REQUEST_LABELS[r.type] || r.type}</div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>Изчаква</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: '#b0b0a8', marginTop: 4 }}>{formatDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastReqs.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>История на запитванията</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pastReqs.map(r => (
                    <div key={r.id} style={{ padding: '12px 14px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{REQUEST_LABELS[r.type] || r.type}</div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, ...STATUS_STYLES[r.status] }}>{STATUS_LABELS[r.status]}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{formatDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </Layout>
  )
}