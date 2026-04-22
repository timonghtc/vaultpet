import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

import { useAuth } from '@/lib/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/api/supabaseClient'

const LOCAL_TOPUP_REQUESTS_KEY = 'local_topup_requests'
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

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export default function WalletTopUp() {
  const navigate = useNavigate()
  const { authMode, user, isAuthenticated, isLoadingAuth } = useAuth()
  const [method, setMethod] = useState('roblox_giftcard')
  const [amount, setAmount] = useState('')
  const [giftCardCode, setGiftCardCode] = useState('')
  const [paypalIssue, setPaypalIssue] = useState(false)
  const [submitOverlay, setSubmitOverlay] = useState(null)

  const quickAmounts = useMemo(() => [5, 10, 20, 50], [])

  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      navigate('/login?redirect=/wallet/topup', { replace: true })
    }
  }, [isAuthenticated, isLoadingAuth, navigate])

  if (!isLoadingAuth && !isAuthenticated) return null

  const submitGiftCard = () => {
    const value = parseFloat(String(amount || '').replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Bitte einen gültigen Betrag eingeben.')
      return
    }
    const code = String(giftCardCode || '').trim()
    if (!code) {
      toast.error('Bitte den Roblox Code eingeben.')
      return
    }

    const name = user?.displayName || (user?.email ? String(user.email).split('@')[0] : '')
    const messageText = `Hey ${name ? name : ''}! 🐰\n\nDeine Aufladung wurde eingereicht und muss kurz vom Admin freigegeben werden.\nIn der Regel dauert das nicht länger als 5 Minuten.\n\nDu bekommst hier eine Nachricht, sobald dein Guthaben freigeschaltet wurde.`

    if (authMode === 'supabase') {
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      const uid = user?.id
      if (!uid) {
        toast.error('Nicht angemeldet.')
        return
      }
      Promise.resolve()
        .then(async () => {
          const { error: topupError } = await supabase.from('topup_requests').insert({
            user_id: uid,
            email: user?.email || null,
            amount: value,
            status: 'pending',
            payment_method: 'roblox_giftcard',
            gift_card_code: code
          })
          if (topupError) throw new Error('Aufladung konnte nicht gespeichert werden.')
          const { error: msgError } = await supabase.from('messages').insert({
            to_user_id: uid,
            type: 'topup_submitted',
            title: '💳 Aufladung eingegangen',
            text: messageText
          })
          if (msgError) throw new Error('Nachricht konnte nicht gespeichert werden.')
        })
        .then(() => {
          toast.success('✅ Antrag eingegangen. Er wird in der Regel in unter 5 Minuten freigegeben.')
          setSubmitOverlay({ amount: value })
          setAmount('')
          setGiftCardCode('')
          window.setTimeout(() => setSubmitOverlay(null), 2600)
        })
        .catch((e) => toast.error(e?.message || 'Fehler beim Einreichen.'))
      return
    }

    const requests = readJson(LOCAL_TOPUP_REQUESTS_KEY, [])
    const req = {
      id: crypto.randomUUID(),
      userId: user?.id || null,
      email: user?.email || null,
      amount: value,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentMethod: 'roblox_giftcard',
      giftCardCode: code
    }
    writeJson(LOCAL_TOPUP_REQUESTS_KEY, [req, ...requests])

    const allMessages = readJson(LOCAL_MESSAGES_KEY, [])
    const msg = {
      id: crypto.randomUUID(),
      toUserId: user?.id || null,
      type: 'topup_submitted',
      title: '💳 Aufladung eingegangen',
      text: messageText,
      createdAt: new Date().toISOString(),
      readAt: null
    }
    writeJson(LOCAL_MESSAGES_KEY, [msg, ...allMessages].slice(0, 500))

    toast.success('✅ Antrag eingegangen. Er wird in der Regel in unter 5 Minuten freigegeben.')
    setSubmitOverlay({ amount: value })
    setAmount('')
    setGiftCardCode('')
    window.setTimeout(() => setSubmitOverlay(null), 2600)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-4xl text-foreground">💳 Guthaben aufladen</h1>
        <p className="text-muted-foreground font-semibold mt-2">
          Wähle eine Methode und lade Guthaben auf dein PetVault Konto.
        </p>
      </div>

      <Card className="p-6 border-2 border-border rounded-2xl bg-white space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-700">Zahlungsmethode</div>
          <Select value={method} onValueChange={(v) => setMethod(v)}>
            <SelectTrigger className="rounded-xl border-2 font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roblox_giftcard">Roblox Gift-Card</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {method === 'paypal' ? (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center border border-amber-200">
                <span className="text-xl leading-none">🐰</span>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900">Upsi…</div>
                <div className="text-sm text-slate-700 font-semibold mt-1">
                  Es ist ein Problem aufgetaucht. Wir arbeiten gerade daran 🙈
                </div>
              </div>
            </div>
            <Button type="button" className="mt-4 w-full rounded-2xl font-bold" onClick={() => setPaypalIssue(true)}>
              PayPal ist gerade nicht verfügbar
            </Button>
            {paypalIssue ? (
              <div className="text-xs text-slate-600 font-semibold mt-2">
                Bitte nutze vorerst die Roblox Gift-Card.
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-700">Schnellbeträge</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickAmounts.map((v) => (
                <Button key={v} type="button" variant="outline" className="rounded-xl font-bold" onClick={() => setAmount(String(v))}>
                  €{v}
                </Button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Betrag (EUR)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="z.B. 15"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Roblox Code</label>
              <input
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-semibold"
              />
              <div className="text-xs text-slate-500 font-semibold">
                Der Code wird vom Admin geprüft. Guthaben wird erst danach freigeschaltet.
              </div>
            </div>

            <Button type="button" className="w-full rounded-2xl font-bold h-11" onClick={submitGiftCard}>
              Kaufen
            </Button>
          </>
        )}
      </Card>

      {submitOverlay ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-md bg-white border-2 border-primary/20 rounded-3xl p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} className="text-4xl leading-none">
                🐰
              </motion.div>
              <div className="flex-1">
                <div className="font-heading text-2xl text-foreground">Kauf eingereicht! 📨</div>
                <div className="text-sm text-muted-foreground font-semibold mt-1">
                  Deine Aufladung muss kurz vom Admin freigegeben werden. Normalerweise dauert das nicht länger als 5 Minuten ⏳
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border-2 border-border bg-secondary p-3">
              <div className="font-bold text-foreground truncate">Guthaben-Aufladung</div>
              <div className="text-xs text-muted-foreground font-semibold">Betrag: €{Number(submitOverlay.amount || 0).toFixed(2)} • Status: Wartet auf Genehmigung…</div>
            </div>
            <div className="mt-5">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 2.4, ease: 'easeInOut' }} className="h-full bg-primary" />
              </div>
              <div className="mt-2 text-xs text-muted-foreground font-semibold">
                Du bekommst eine Nachricht, sobald dein Guthaben freigeschaltet wurde.
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  )
}
