import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/lib/AuthContext'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/api/supabaseClient'

const LOCAL_ORDERS_KEY = 'local_orders'
const LOCAL_MESSAGES_KEY = 'local_messages'

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

const formatTime = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function Account() {
  const { authMode, user, isAuthenticated, isLoadingAuth, localUpdateProfile, localChangePassword, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('redirect')
    return raw || '/'
  }, [location.search])

  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [robloxUsername, setRobloxUsername] = useState(user?.robloxUsername || '')

  const [currentPassword, setCurrentPassword] = useState('')
  const [passwordNew, setPasswordNew] = useState('')
  const [passwordNew2, setPasswordNew2] = useState('')
  const [ordersRefresh, setOrdersRefresh] = useState(0)
  const [messagesRefresh, setMessagesRefresh] = useState(0)
  const [section, setSection] = useState('profile')

  useEffect(() => {
    setDisplayName(user?.displayName || '')
    setEmail(user?.email || '')
    setRobloxUsername(user?.robloxUsername || '')
  }, [user?.displayName, user?.email, user?.robloxUsername])

  const nameCooldown = useMemo(() => {
    const last = user?.displayNameChangedAt ? new Date(user.displayNameChangedAt).getTime() : null
    if (!last || !Number.isFinite(last)) return { locked: false, remainingMin: 0 }
    const remainingMs = 60 * 60 * 1000 - (Date.now() - last)
    if (remainingMs <= 0) return { locked: false, remainingMin: 0 }
    return { locked: true, remainingMin: Math.ceil(remainingMs / 60000) }
  }, [user?.displayNameChangedAt])

  const { data: supabaseOrders = [] } = useQuery({
    queryKey: ['my-orders', authMode, user?.email],
    enabled: authMode === 'supabase' && !!user?.email && !!supabase,
    queryFn: async () => {
      const emailKey = String(user?.email || '').trim().toLowerCase()
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_email', emailKey)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) return []
      return (data || []).map((o) => ({
        ...o,
        createdAt: o.created_at || o.createdAt || null
      }))
    }
  })

  const myOrders = useMemo(() => {
    if (authMode === 'supabase') return supabaseOrders
    const all = readJson(LOCAL_ORDERS_KEY, [])
    const emailKey = String(user?.email || '').trim().toLowerCase()
    const filtered = all.filter((o) => String(o?.buyer_email || '').trim().toLowerCase() === emailKey)
    filtered.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return filtered
  }, [authMode, ordersRefresh, supabaseOrders, user?.email])

  const { data: supabaseMessages = [] } = useQuery({
    queryKey: ['my-messages', authMode, user?.id, messagesRefresh],
    enabled: authMode === 'supabase' && !!user?.id && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) return []
      return (data || []).map((m) => ({
        id: m.id,
        toUserId: m.to_user_id,
        type: m.type || null,
        title: m.title || '',
        text: m.text || '',
        createdAt: m.created_at || null,
        readAt: m.read_at || null
      }))
    }
  })

  const myMessages = useMemo(() => {
    if (authMode === 'supabase') return supabaseMessages
    const all = readJson(LOCAL_MESSAGES_KEY, [])
    const uid = user?.id
    const filtered = all.filter((m) => m?.toUserId && m.toUserId === uid)
    filtered.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return filtered
  }, [authMode, messagesRefresh, supabaseMessages, user?.id])

  const unreadCount = useMemo(() => myMessages.filter((m) => !m.readAt).length, [myMessages])

  useEffect(() => {
    if (authMode === 'base44') return
    if (!user?.id) return
    if (authMode === 'supabase') {
      if (!supabase) return
      const uid = user.id
      const name = user?.displayName || (user?.email ? String(user.email).split('@')[0] : '')
      const greet = name ? `Hey ${name}!` : 'Hey!'
      const desiredTitle = '👋 Hey! Ich bin Hasi'
      const desiredText = `${greet} Ich bin Hasi 🐰\n\nSchön, dass du da bist. Ich bin dein PetVault‑Support und schicke dir hier Updates zu Bestellungen, Verkäufen und deinem Guthaben.\n\nWenn du Fragen hast:\n- Schau in „So geht’s / FAQ“\n- Oder schreib uns: support.petvault@gmail.com\n\nViel Spaß in PetVault!`
      Promise.resolve()
        .then(async () => {
          const { data: existing, error } = await supabase
            .from('messages')
            .select('id,text')
            .eq('to_user_id', uid)
            .eq('type', 'intro')
            .order('created_at', { ascending: false })
            .limit(1)
          if (error) return
          const row = existing?.[0] || null
          if (row?.id) {
            const existingText = String(row?.text || '')
            if (!/verkauf/i.test(existingText)) return
            await supabase.from('messages').update({ title: desiredTitle, text: desiredText }).eq('id', row.id)
            return
          }
          await supabase.from('messages').insert({
            to_user_id: uid,
            type: 'intro',
            title: desiredTitle,
            text: desiredText
          })
        })
        .then(() => setMessagesRefresh((n) => n + 1))
        .catch(() => {})
      return
    }
    const all = readJson(LOCAL_MESSAGES_KEY, [])
    const name = user?.displayName || (user?.email ? String(user.email).split('@')[0] : '')
    const greet = name ? `Hey ${name}!` : 'Hey!'
    const desiredTitle = '👋 Hey! Ich bin Hasi'
    const desiredText = `${greet} Ich bin Hasi 🐰\n\nSchön, dass du da bist. Ich bin dein PetVault‑Support und schicke dir hier Updates zu Bestellungen, Verkäufen und deinem Guthaben.\n\nWenn du Fragen hast:\n- Schau in „So geht’s / FAQ“\n- Oder schreib uns: support.petvault@gmail.com\n\nViel Spaß in PetVault!`

    const introIndex = all.findIndex((m) => m?.toUserId === user.id && m?.type === 'intro')
    if (introIndex !== -1) {
      const existing = all[introIndex]
      const existingText = String(existing?.text || '')
      if (!/verkauf/i.test(existingText)) return
      const next = [...all]
      next[introIndex] = { ...existing, title: desiredTitle, text: desiredText }
      window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(next.slice(0, 500)))
      setMessagesRefresh((n) => n + 1)
      return
    }

    const intro = {
      id: crypto.randomUUID(),
      toUserId: user.id,
      type: 'intro',
      title: desiredTitle,
      text: desiredText,
      createdAt: new Date().toISOString(),
      readAt: null
    }
    window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify([intro, ...all].slice(0, 500)))
    setMessagesRefresh((n) => n + 1)
  }, [authMode, user?.id])

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    const allowed = new Set(['profile', 'orders', 'messages'])
    if (tab && allowed.has(tab)) {
      if (tab !== section) setSection(tab)
      return
    }
    if (!tab && section !== 'profile') {
      setSection('profile')
    }
  }, [location.search, section])

  useEffect(() => {
    if (section !== 'messages') return
    if (!user?.id) return
    if (authMode === 'supabase') {
      if (!supabase) return
      const uid = user.id
      const now = new Date().toISOString()
      Promise.resolve()
        .then(async () => {
          await supabase.from('messages').update({ read_at: now }).eq('to_user_id', uid).is('read_at', null)
        })
        .then(() => setMessagesRefresh((n) => n + 1))
        .catch(() => {})
      return
    }
    const all = readJson(LOCAL_MESSAGES_KEY, [])
    let changed = false
    const now = new Date().toISOString()
    const next = all.map((m) => {
      if (m?.toUserId === user.id && !m.readAt) {
        changed = true
        return { ...m, readAt: now }
      }
      return m
    })
    if (changed) {
      window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(next))
      setMessagesRefresh((n) => n + 1)
    }
  }, [section, user?.id, authMode])

  const getOrderBadge = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'delivered') return { label: '📦 Geliefert', className: 'text-emerald-700 border-emerald-300 font-bold' }
    if (s === 'processing') return { label: '⏳ In Bearbeitung', className: 'text-amber-700 border-amber-300 font-bold' }
    if (s === 'awaiting_payment') return { label: '💳 Zahlung offen', className: 'text-slate-700 border-slate-300 font-bold' }
    if (s === 'paid') return { label: '✅ Bezahlt', className: 'text-emerald-700 border-emerald-300 font-bold' }
    return { label: status ? String(status) : '—', className: 'text-slate-700 border-slate-300 font-bold' }
  }

  if (!isLoadingAuth && !isAuthenticated) {
    navigate(`/login?redirect=${encodeURIComponent('/account')}`, { replace: true })
    return null
  }

  if (authMode === 'base44') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-2">
          <div className="font-heading text-2xl text-primary">PetVault</div>
          <h1 className="text-xl font-semibold text-slate-900">Account</h1>
          <p className="text-sm text-slate-600">Account-Einstellungen sind in diesem Modus nicht verfügbar.</p>
        </div>
      </div>
    )
  }

  const onSaveProfile = async (e) => {
    e.preventDefault()
    try {
      await localUpdateProfile({ email, robloxUsername, displayName })
      toast.success('✅ Profil gespeichert.')
    } catch (err) {
      toast.error(err?.message || 'Fehler beim Speichern.')
    }
  }

  const onSavePassword = async (e) => {
    e.preventDefault()
    try {
      if (passwordNew !== passwordNew2) {
        throw new Error('Passwörter stimmen nicht überein.')
      }
      await localChangePassword({ currentPassword, newPassword: passwordNew })
      setCurrentPassword('')
      setPasswordNew('')
      setPasswordNew2('')
      toast.success('✅ Passwort gespeichert.')
    } catch (err) {
      toast.error(err?.message || 'Fehler beim Ändern des Passworts.')
    }
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-heading text-2xl text-primary">PetVault</div>
            <h1 className="text-2xl font-semibold text-slate-900">Account</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                logout()
                navigate(redirectTo, { replace: true })
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
            >
              Abmelden
            </button>
          </div>
        </div>

        <div className="space-y-6">

          {section === 'profile' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-heading text-xl text-slate-900">Profil</h2>
                <form className="space-y-3" onSubmit={onSaveProfile}>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      type="text"
                      required
                      disabled={nameCooldown.locked}
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                    <div className="text-xs text-slate-500">
                      {nameCooldown.locked ? `Du kannst deinen Namen in ca. ${nameCooldown.remainingMin} Min wieder ändern.` : '2–30 Zeichen. (Max. 1x pro Stunde ändern)'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">E-Mail</label>
                    <input
                      value={email}
                      type="email"
                      required
                      disabled
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                    <div className="text-xs text-slate-500">E-Mail kann nicht geändert werden.</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Roblox Username</label>
                    <input
                      value={robloxUsername}
                      onChange={(e) => setRobloxUsername(e.target.value)}
                      type="text"
                      required
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                    <div className="text-xs text-slate-500">3–20 Zeichen, nur Buchstaben/Zahlen/Unterstrich.</div>
                  </div>
                  <button type="submit" className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
                    Speichern
                  </button>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-heading text-xl text-slate-900">Passwort</h2>
                <form className="space-y-3" onSubmit={onSavePassword}>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Aktuelles Passwort</label>
                    <input
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      type="password"
                      required
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Neues Passwort</label>
                    <input
                      value={passwordNew}
                      onChange={(e) => setPasswordNew(e.target.value)}
                      type="password"
                      required
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Neues Passwort wiederholen</label>
                    <input
                      value={passwordNew2}
                      onChange={(e) => setPasswordNew2(e.target.value)}
                      type="password"
                      required
                      className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
                    />
                    <div className="text-xs text-slate-500">Mindestens 6 Zeichen.</div>
                  </div>
                  <button type="submit" className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
                    Passwort speichern
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {section === 'orders' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-xl text-slate-900">Bestellungen</h2>
                <button
                  type="button"
                  onClick={() => setOrdersRefresh((n) => n + 1)}
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
                >
                  Aktualisieren
                </button>
              </div>

              {myOrders.length === 0 ? (
                <div className="text-sm text-slate-600">
                  Noch keine Bestellungen.
                </div>
              ) : (
                <div className="space-y-3">
                  {myOrders.map((o, idx) => {
                    const badge = getOrderBadge(o.status)
                    return (
                      <div key={o.id || `o-${idx}`} className="border-2 border-slate-100 rounded-2xl p-4 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">
                              Bestellung {o.id ? `#${String(o.id).slice(0, 8)}` : ''}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {formatDate(o.createdAt)}
                            </div>
                          </div>
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-600 font-semibold">Roblox</span>
                            <span className="text-slate-900 font-bold sm:ml-2">@{o.roblox_username || '-'}</span>
                          </div>
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-600 font-semibold">Gesamt</span>
                            <span className="text-slate-900 font-bold sm:ml-2">€{Number(o.total || 0).toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="mt-3 text-sm">
                          <div className="text-slate-600 font-semibold">Pets</div>
                          <div className="text-slate-900 font-bold mt-0.5">
                            {Array.isArray(o.pet_names) && o.pet_names.length ? o.pet_names.join(', ') : '-'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          {section === 'messages' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
                    <span className="text-xl leading-none">🐰</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">Hasi • PetVault Bot</div>
                    <div className="text-xs text-slate-500 truncate">Online • Antwort meist schnell</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/how')}
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
                >
                  FAQ
                </button>
              </div>

              <div className="p-4 bg-[#efeae2]">
                {myMessages.length === 0 ? (
                  <div className="text-sm text-slate-600">Noch keine Nachrichten.</div>
                ) : (
                  <div className="space-y-3">
                    {myMessages
                      .slice()
                      .reverse()
                      .map((m, idx) => (
                        <div key={m.id || `m-${idx}`} className="flex items-end gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center border border-white/50 flex-shrink-0">
                            <span className="text-base leading-none">🐰</span>
                          </div>
                          <div className="max-w-[85%] sm:max-w-[70%]">
                            <div className="bg-white rounded-2xl rounded-bl-md px-3 py-2 shadow-sm border border-black/5">
                              {m.title ? (
                                <div className="font-bold text-slate-900 text-sm">{m.title}</div>
                              ) : null}
                              <div className="text-sm text-slate-800 font-semibold whitespace-pre-wrap mt-0.5">
                                {m.text || ''}
                              </div>
                              <div className="text-[11px] text-slate-500 text-right mt-1">
                                {formatTime(m.createdAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-slate-200 bg-white">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/my-pets')}
                    className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
                  >
                    Meine Verkäufe
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/wallet/topup')}
                    className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800"
                  >
                    Guthaben aufladen
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/how')}
                    className="h-10 px-3 rounded-xl bg-primary text-white text-sm font-bold"
                  >
                    Hilfe / FAQ
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          
        </div>
      </div>
    </div>
  )
}
