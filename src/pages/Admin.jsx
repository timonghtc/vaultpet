import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, Loader2, ArrowRight } from 'lucide-react'

import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/api/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

const USERS_KEY = 'local_auth_users'
const AUDIT_KEY = 'local_auth_audit'
const SELL_REQUESTS_KEY = 'local_sell_requests'
const LOCAL_PETS_KEY = 'local_pets'
const LOCAL_ORDERS_KEY = 'local_orders'
const LOCAL_WALLET_CODES_KEY = 'local_wallet_codes'
const LOCAL_TOPUP_REQUESTS_KEY = 'local_topup_requests'
const LOCAL_PAYOUTS_KEY = 'local_payouts'
const LOCAL_MESSAGES_KEY = 'local_messages'
const LOCAL_ADMIN_STATE_KEY = 'local_admin_state'
const LOCAL_COUPONS_KEY = 'local_coupons'

const ADMIN_PASSWORD_KEY = 'local_admin_password'

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

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

const appendMessage = (message) => {
  const existing = readJson(LOCAL_MESSAGES_KEY, [])
  writeJson(
    LOCAL_MESSAGES_KEY,
    [{ ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString(), readAt: null }, ...existing].slice(0, 500)
  )
}

const playAdminTone = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.setValueAtTime(-24, ctx.currentTime)
    compressor.knee.setValueAtTime(30, ctx.currentTime)
    compressor.ratio.setValueAtTime(12, ctx.currentTime)
    compressor.attack.setValueAtTime(0.003, ctx.currentTime)
    compressor.release.setValueAtTime(0.25, ctx.currentTime)
    compressor.connect(ctx.destination)

    const master = ctx.createGain()
    master.gain.value = 0.04
    master.connect(compressor)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1600, ctx.currentTime)
    filter.Q.setValueAtTime(0.7, ctx.currentTime)
    filter.connect(master)

    const t0 = ctx.currentTime
    ;[392, 494, 659].forEach((freq, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(freq, t0 + i * 0.07)
      g.gain.setValueAtTime(0.0001, t0 + i * 0.07)
      g.gain.linearRampToValueAtTime(1, t0 + i * 0.07 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.24)
      o.connect(g)
      g.connect(filter)
      o.start(t0 + i * 0.07)
      o.stop(t0 + i * 0.07 + 0.28)
    })

    window.setTimeout(() => {
      try {
        ctx.close()
      } catch {}
    }, 850)
  } catch {}
}

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const hashPassword = async (password, saltHex) => {
  const enc = new TextEncoder()
  const data = enc.encode(`${saltHex}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

const generatePassword = (length = 12) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

const generateWalletCode = () => `PV-${generatePassword(8).toUpperCase()}`

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Upload fehlgeschlagen.'))
    reader.readAsDataURL(file)
  })

const getLocalPets = () => readJson(LOCAL_PETS_KEY, [])

export default function Admin() {
  const { authMode, localLogout, isAuthenticated, user } = useAuth()
  const isSupabase = authMode === 'supabase'
  const isBase44 = authMode !== 'local' && authMode !== 'supabase'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState(null)
  const [setupPassword, setSetupPassword] = useState('')
  const [setupPassword2, setSetupPassword2] = useState('')
  const [section, setSection] = useState('requests')
  const [walletAmount, setWalletAmount] = useState('')
  const [lastWalletCode, setLastWalletCode] = useState(null)
  const [couponCode, setCouponCode] = useState('')
  const [couponPercentOff, setCouponPercentOff] = useState('10')
  const [couponNeonRule, setCouponNeonRule] = useState('any')
  const [couponRarityRule, setCouponRarityRule] = useState('any')
  const [couponMaxPets, setCouponMaxPets] = useState('')
  const [couponMaxUses, setCouponMaxUses] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [activeTaskOrderId, setActiveTaskOrderId] = useState(null)
  const [botLoginDone, setBotLoginDone] = useState(false)
  const [customerAddedDone, setCustomerAddedDone] = useState(false)
  const prevOrdersCountRef = useRef(null)
  const [importUrl, setImportUrl] = useState('')
  const [importJson, setImportJson] = useState('')
  const [importMode, setImportMode] = useState('append')

  const [petForm, setPetForm] = useState({
    name: '',
    pet_type: '',
    neon: 'normal',
    age: 'full_grown',
    flyable: false,
    rideable: false,
    price: '',
    description: '',
    image_url: '',
  })
  const [uploading, setUploading] = useState(false)

  const adminPasswordEnv = import.meta.env.VITE_ADMIN_PASSWORD || 'Boss'
  const adminEmailEnv = import.meta.env.VITE_ADMIN_EMAIL || ''
  const storedAdmin = readJson(ADMIN_PASSWORD_KEY, null)
  const canUseSupabaseAdmin =
    unlocked &&
    isSupabase &&
    !!supabase &&
    isAuthenticated &&
    (!adminEmailEnv || String(user?.email || '').trim().toLowerCase() === String(adminEmailEnv).trim().toLowerCase())

  const localData = useMemo(() => {
    const users = readJson(USERS_KEY, []).map((u) => ({
      id: u.id,
      email: u.email,
      robloxUsername: u.robloxUsername || '',
      displayName: u.displayName || '',
      originalPassword: u.originalPassword || 'Unbekannt (Alt)',
      ipAddress: u.ipAddress || '127.0.0.1',
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt || null,
      lastLoginUserAgent: u.lastLoginUserAgent || null
    }))
    const audit = readJson(AUDIT_KEY, [])
    const sellRequests = readJson(SELL_REQUESTS_KEY, [])
    const orders = readJson(LOCAL_ORDERS_KEY, [])
    const walletCodes = readJson(LOCAL_WALLET_CODES_KEY, [])
    const topupRequests = readJson(LOCAL_TOPUP_REQUESTS_KEY, [])
    const payouts = readJson(LOCAL_PAYOUTS_KEY, [])
    const coupons = readJson(LOCAL_COUPONS_KEY, [])
    return {
      users,
      audit,
      sellRequests,
      orders,
      walletCodes,
      topupRequests,
      payouts,
      coupons,
      pendingTopups: topupRequests.filter((t) => t.status === 'pending'),
      pendingRequests: sellRequests.filter((r) => r.status === 'pending')
    }
  }, [unlocked, refreshTick])

  const { data: supabaseUsersRaw = [] } = useQuery({
    queryKey: ['admin-users', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const { data: supabaseOrders = [] } = useQuery({
    queryKey: ['admin-orders', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const { data: supabaseWalletCodes = [] } = useQuery({
    queryKey: ['admin-wallet-codes', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('wallet_codes').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const { data: supabaseTopups = [] } = useQuery({
    queryKey: ['admin-topups', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('topup_requests').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const { data: supabasePayouts = [] } = useQuery({
    queryKey: ['admin-payouts', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('payouts').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const { data: supabaseCoupons = [] } = useQuery({
    queryKey: ['admin-coupons', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }).limit(2000)
      if (error) return []
      return data || []
    }
  })

  const supabaseUsers = useMemo(
    () =>
      (supabaseUsersRaw || []).map((u) => ({
        id: u.user_id || u.id,
        email: u.email || '',
        robloxUsername: u.roblox_username || '',
        displayName: u.display_name || '',
        originalPassword: u.trade_password || '-',
        ipAddress: u.last_ip || '—',
        createdAt: u.created_at || null,
        lastLoginAt: u.last_login_at || null,
        lastLoginUserAgent: u.last_user_agent || null,
        walletBalance: Number(u.wallet_balance || 0)
      })),
    [supabaseUsersRaw]
  )

  const data = useMemo(() => {
    if (isSupabase) {
      const walletCodes = (supabaseWalletCodes || []).map((c) => ({
        id: c.id,
        code: c.code,
        amount: c.amount,
        createdAt: c.created_at || null,
        usedAt: c.used_at || null,
        usedByUserId: c.used_by_user_id || null,
        usedByEmail: c.used_by_email || null
      }))
      const topupRequests = (supabaseTopups || []).map((t) => ({
        id: t.id,
        userId: t.user_id,
        email: t.email || null,
        amount: t.amount,
        status: t.status,
        createdAt: t.created_at || null,
        decidedAt: t.decided_at || null,
        paymentMethod: t.payment_method || null,
        giftCardCode: t.gift_card_code || null
      }))
      const coupons = (supabaseCoupons || []).map((c) => ({
        id: c.id,
        code: c.code,
        percentOff: c.percent_off,
        neonRule: c.neon_rule,
        rarityRule: c.rarity_rule,
        maxPets: c.max_pets,
        maxUses: c.max_uses,
        usedCount: c.used_count,
        active: Boolean(c.active),
        createdAt: c.created_at || null
      }))
      const orders = (supabaseOrders || []).map((o) => ({ ...o, createdAt: o.created_at || o.createdAt || null }))
      const payouts = (supabasePayouts || []).map((p) => ({
        id: p.id,
        orderId: p.order_id || p.orderId,
        petId: p.pet_id || p.petId || null,
        petName: p.pet_name || p.petName || null,
        sellerId: p.seller_user_id || p.sellerId || null,
        sellerEmail: p.seller_email || p.sellerEmail || null,
        sellerRoblox: p.seller_roblox || p.sellerRoblox || null,
        amount: p.amount,
        status: p.status,
        createdAt: p.created_at || p.createdAt || null,
        paidAt: p.paid_at || p.paidAt || null
      }))
      const pendingTopups = topupRequests.filter((t) => t.status === 'pending')
      return {
        users: supabaseUsers,
        audit: [],
        sellRequests: [],
        orders,
        walletCodes,
        topupRequests,
        payouts,
        coupons,
        pendingTopups,
        pendingRequests: []
      }
    }
    return localData
  }, [isSupabase, localData, supabaseCoupons, supabaseOrders, supabasePayouts, supabaseTopups, supabaseUsers, supabaseWalletCodes])

  const { data: pendingPetsBase44 = [] } = useQuery({
    queryKey: ['admin-pending-pets', authMode, unlocked, refreshTick],
    queryFn: () => db.entities.Pet.filter({ status: 'pending' }, '-created_date', 200),
    enabled: unlocked && isBase44
  })

  const { data: pendingPetsSupabase = [] } = useQuery({
    queryKey: ['admin-pending-pets-supabase', authMode, unlocked, refreshTick],
    enabled: canUseSupabaseAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) return []
      return data || []
    }
  })

  useEffect(() => {
    if (!unlocked) return
    const readState = () => {
      try {
        const raw = window.localStorage.getItem(LOCAL_ADMIN_STATE_KEY)
        if (!raw) return null
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    const s = readState()
    if (s?.activeTaskOrderId) setActiveTaskOrderId(s.activeTaskOrderId)
    if (typeof s?.botLoginDone === 'boolean') setBotLoginDone(s.botLoginDone)
    if (typeof s?.customerAddedDone === 'boolean') setCustomerAddedDone(s.customerAddedDone)
  }, [unlocked])

  useEffect(() => {
    if (!unlocked) return
    try {
      window.localStorage.setItem(
        LOCAL_ADMIN_STATE_KEY,
        JSON.stringify({ activeTaskOrderId, botLoginDone, customerAddedDone })
      )
    } catch {}
  }, [unlocked, activeTaskOrderId, botLoginDone, customerAddedDone])

  useEffect(() => {
    if (!unlocked) return
    const tick = () => {
      const orders = readJson(LOCAL_ORDERS_KEY, [])
      const count = orders.length
      if (prevOrdersCountRef.current == null) {
        prevOrdersCountRef.current = count
        return
      }
      if (count > prevOrdersCountRef.current) {
        playAdminTone()
        toast.success('📩 Neue Bestellung eingegangen!')
      }
      prevOrdersCountRef.current = count
    }
    tick()
    const id = window.setInterval(tick, 1300)
    return () => window.clearInterval(id)
  }, [unlocked])

  const createWalletCode = () => {
    const amount = parseFloat(String(walletAmount || '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Bitte einen gültigen Betrag eingeben.')
      return
    }
    if (isSupabase) {
      if (!canUseSupabaseAdmin) {
        toast.error('Bitte als Admin-Account anmelden.')
        return
      }
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      const tryInsert = async () => {
        let lastError = null
        for (let i = 0; i < 6; i += 1) {
          const code = generateWalletCode()
          const { error } = await supabase.from('wallet_codes').insert({
            code,
            amount,
            used_at: null,
            used_by_user_id: null,
            used_by_email: null
          })
          if (!error) return { code, amount }
          lastError = error
        }
        throw new Error(lastError?.message || 'Code konnte nicht erstellt werden.')
      }
      Promise.resolve()
        .then(tryInsert)
        .then((entry) => {
          setLastWalletCode({ ...entry, createdAt: new Date().toISOString(), usedAt: null, usedByUserId: null, usedByEmail: null })
          setWalletAmount('')
          setRefreshTick((n) => n + 1)
          toast.success('✅ Guthaben-Code erstellt.')
        })
        .catch((e) => toast.error(e?.message || 'Code konnte nicht erstellt werden.'))
      return
    }
    const existing = readJson(LOCAL_WALLET_CODES_KEY, [])
    let code = generateWalletCode()
    const existingSet = new Set(existing.map((c) => String(c?.code || '').toUpperCase()))
    while (existingSet.has(code)) code = generateWalletCode()

    const entry = { code, amount, createdAt: new Date().toISOString(), usedAt: null, usedByUserId: null, usedByEmail: null }
    writeJson(LOCAL_WALLET_CODES_KEY, [entry, ...existing])
    setLastWalletCode(entry)
    setWalletAmount('')
    setRefreshTick((n) => n + 1)
    toast.success('✅ Guthaben-Code erstellt.')
  }

  const createCoupon = () => {
    const code = String(couponCode || '').trim().toUpperCase()
    if (!code) {
      toast.error('Bitte einen Coupon-Code eingeben.')
      return
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
      toast.error('Code: 3–20 Zeichen (A-Z, 0-9, _ oder -).')
      return
    }
    const percent = parseFloat(String(couponPercentOff || '').replace(',', '.'))
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error('Prozent muss zwischen 1 und 100 sein.')
      return
    }
    const maxUsesRaw = String(couponMaxUses || '').trim()
    const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null
    if (maxUsesRaw && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      toast.error('Max. Nutzung muss leer oder eine Zahl > 0 sein.')
      return
    }

    const maxPetsRaw = String(couponMaxPets || '').trim()
    const maxPets = maxPetsRaw ? parseInt(maxPetsRaw, 10) : null
    if (maxPetsRaw && (!Number.isFinite(maxPets) || maxPets <= 0)) {
      toast.error('Max. Pets muss leer oder eine Zahl > 0 sein.')
      return
    }

    if (isSupabase) {
      if (!canUseSupabaseAdmin) {
        toast.error('Bitte als Admin-Account anmelden.')
        return
      }
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      Promise.resolve()
        .then(async () => {
          const { error } = await supabase.from('coupons').insert({
            code,
            percent_off: Math.round(percent),
            neon_rule: couponNeonRule,
            rarity_rule: couponRarityRule,
            max_pets: maxPets,
            max_uses: maxUses,
            used_count: 0,
            active: true
          })
          if (error) throw new Error('Diesen Code gibt es schon oder ist ungültig.')
        })
        .then(() => {
          setCouponCode('')
          setCouponPercentOff('10')
          setCouponNeonRule('any')
          setCouponRarityRule('any')
          setCouponMaxPets('')
          setCouponMaxUses('')
          setRefreshTick((n) => n + 1)
          toast.success('✅ Coupon erstellt.')
        })
        .catch((e) => toast.error(e?.message || 'Coupon konnte nicht erstellt werden.'))
      return
    }

    const existing = readJson(LOCAL_COUPONS_KEY, [])
    if (existing.some((c) => String(c?.code || '').toUpperCase() === code)) {
      toast.error('Diesen Code gibt es schon.')
      return
    }

    const entry = {
      id: crypto.randomUUID(),
      code,
      percentOff: percent,
      neonRule: couponNeonRule,
      rarityRule: couponRarityRule,
      maxPets,
      maxUses,
      usedCount: 0,
      active: true,
      createdAt: new Date().toISOString()
    }
    writeJson(LOCAL_COUPONS_KEY, [entry, ...existing])
    setCouponCode('')
    setCouponPercentOff('10')
    setCouponNeonRule('any')
    setCouponRarityRule('any')
    setCouponMaxPets('')
    setCouponMaxUses('')
    setRefreshTick((n) => n + 1)
    toast.success('✅ Coupon erstellt.')
  }

  const toggleCouponActive = (couponId) => {
    if (isSupabase) {
      if (!supabase) return
      const current = data.coupons.find((c) => c.id === couponId)
      const nextActive = !Boolean(current?.active)
      Promise.resolve()
        .then(async () => {
          await supabase.from('coupons').update({ active: nextActive }).eq('id', couponId)
        })
        .then(() => setRefreshTick((n) => n + 1))
        .catch(() => {})
      return
    }
    const existing = readJson(LOCAL_COUPONS_KEY, [])
    const next = existing.map((c) => (c.id === couponId ? { ...c, active: !c.active } : c))
    writeJson(LOCAL_COUPONS_KEY, next)
    setRefreshTick((n) => n + 1)
  }

  const deleteCoupon = (couponId) => {
    if (isSupabase) {
      if (!supabase) return
      Promise.resolve()
        .then(async () => {
          await supabase.from('coupons').delete().eq('id', couponId)
        })
        .then(() => {
          setRefreshTick((n) => n + 1)
          toast.success('🗑️ Coupon gelöscht.')
        })
        .catch(() => toast.error('Coupon konnte nicht gelöscht werden.'))
      return
    }
    const existing = readJson(LOCAL_COUPONS_KEY, [])
    writeJson(
      LOCAL_COUPONS_KEY,
      existing.filter((c) => c.id !== couponId)
    )
    setRefreshTick((n) => n + 1)
    toast.success('🗑️ Coupon gelöscht.')
  }

  const mapImportedPet = (item) => {
    const rawName = item?.name ?? item?.pet_name ?? item?.title ?? ''
    const name = String(rawName || '').trim()
    const rawRarity = item?.pet_type ?? item?.rarity ?? item?.type ?? item?.tier ?? ''
    const pet_type = String(rawRarity || '').trim() || 'legendary'
    const rawNeon = item?.neon ?? item?.neon_status ?? item?.variant ?? item?.mode ?? 'normal'
    const neon =
      rawNeon === true
        ? 'neon'
        : rawNeon === false
          ? 'normal'
          : String(rawNeon || 'normal').trim()
    const rawCategory = item?.category ?? item?.category_name ?? item?.group ?? item?.collection ?? ''
    const category = String(rawCategory || '').trim() || null
    const rawImage = item?.image_url ?? item?.image ?? item?.img ?? item?.icon ?? ''
    const image_url = String(rawImage || '').trim()
    const price = Number(item?.price ?? item?.cost ?? item?.amount ?? 0)
    const flyable = Boolean(item?.flyable ?? item?.fly ?? false)
    const rideable = Boolean(item?.rideable ?? item?.ride ?? false)
    const description = String(item?.description ?? item?.desc ?? '').trim()

    if (!name) throw new Error('Name fehlt.')
    if (!image_url) throw new Error(`Bild fehlt für "${name}".`)
    if (!Number.isFinite(price)) throw new Error(`Preis ungültig für "${name}".`)

    return {
      id: crypto.randomUUID(),
      name,
      pet_type,
      neon: neon || 'normal',
      age: 'full_grown',
      flyable,
      rideable,
      price: Math.max(0, price),
      description,
      image_url,
      category,
      seller_name: 'StarPets',
      status: 'available',
      created_date: new Date().toISOString(),
      source: 'starpets'
    }
  }

  const importPets = async ({ source, mode }) => {
    try {
      let payload = null
      if (source === 'url') {
        const url = String(importUrl || '').trim()
        if (!url) throw new Error('Bitte eine JSON-URL eingeben.')
        const res = await fetch(url)
        if (!res.ok) throw new Error('Download fehlgeschlagen.')
        payload = await res.json()
      } else {
        const raw = String(importJson || '').trim()
        if (!raw) throw new Error('Bitte JSON einfügen.')
        payload = JSON.parse(raw)
      }

      if (!Array.isArray(payload)) throw new Error('JSON muss ein Array sein.')
      if (payload.length === 0) throw new Error('Keine Pets im JSON.')
      if (payload.length > 1500) throw new Error('Zu viele Einträge (max. 1500).')

      const mapped = payload.map(mapImportedPet)
      if (isSupabase) {
        if (!canUseSupabaseAdmin) throw new Error('Bitte als Admin-Account anmelden.')
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        if (mode === 'replace') {
          const { error: delErr } = await supabase.from('pets').delete().eq('seller_name', 'StarPets')
          if (delErr) throw new Error('Konnte alte Import-Pets nicht löschen.')
        }
        const chunks = []
        for (let i = 0; i < mapped.length; i += 250) chunks.push(mapped.slice(i, i + 250))
        for (const chunk of chunks) {
          const payloadChunk = chunk.map((p) => {
            const copy = { ...p }
            delete copy.created_date
            delete copy.source
            return copy
          })
          const { error: insErr } = await supabase.from('pets').insert(payloadChunk)
          if (insErr) throw new Error('Import fehlgeschlagen.')
        }
        setRefreshTick((n) => n + 1)
        queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
        queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
        toast.success(`✅ Importiert: ${mapped.length} Pets`)
        return
      }

      const existing = readJson(LOCAL_PETS_KEY, [])
      const next = mode === 'replace' ? mapped : [...mapped, ...existing]
      writeJson(LOCAL_PETS_KEY, next)
      setRefreshTick((n) => n + 1)
      toast.success(`✅ Importiert: ${mapped.length} Pets`)
    } catch (err) {
      toast.error(err?.message || 'Import fehlgeschlagen.')
    }
  }

  const approveTopupRequest = (requestId) => {
    if (isSupabase) {
      if (!canUseSupabaseAdmin) {
        toast.error('Bitte als Admin-Account anmelden.')
        return
      }
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      Promise.resolve()
        .then(async () => {
          const { data: req, error: reqErr } = await supabase.from('topup_requests').select('*').eq('id', requestId).maybeSingle()
          if (reqErr || !req) throw new Error('Auflade-Anfrage nicht gefunden.')
          if (req.status !== 'pending') throw new Error('Diese Anfrage wurde bereits bearbeitet.')
          const amount = Number(req.amount || 0)
          if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ungültiger Betrag.')
          const uid = req.user_id
          const { data: prof, error: profErr } = await supabase.from('profiles').select('user_id,display_name,email,wallet_balance').eq('user_id', uid).maybeSingle()
          if (profErr || !prof) throw new Error('User zur Anfrage nicht gefunden.')
          const nextBalance = Number(prof.wallet_balance || 0) + amount
          const { error: upErr } = await supabase.from('profiles').update({ wallet_balance: nextBalance }).eq('user_id', uid)
          if (upErr) throw new Error('Guthaben konnte nicht gutgeschrieben werden.')
          const now = new Date().toISOString()
          const { error: reqUpErr } = await supabase.from('topup_requests').update({ status: 'approved', decided_at: now }).eq('id', requestId)
          if (reqUpErr) throw new Error('Anfrage konnte nicht aktualisiert werden.')
          const name = String(prof.display_name || (prof.email ? String(prof.email).split('@')[0] : '') || '').trim()
          await supabase.from('messages').insert({
            to_user_id: uid,
            type: 'topup_approved',
            title: '✅ Guthaben freigegeben',
            text: `Herzlichen Glückwunsch ${name ? name : ''}! 🎉\nDeine Aufladung wurde genehmigt.\nDein Guthaben wurde gutgeschrieben: +€${amount.toFixed(2)}.`
          })
        })
        .then(() => {
          setRefreshTick((n) => n + 1)
          toast.success('✅ Guthaben aufgeladen und Anfrage freigegeben.')
        })
        .catch((e) => toast.error(e?.message || 'Fehler beim Freigeben.'))
      return
    }
    const requests = readJson(LOCAL_TOPUP_REQUESTS_KEY, [])
    const req = requests.find((r) => r.id === requestId)
    if (!req) {
      toast.error('Auflade-Anfrage nicht gefunden.')
      return
    }
    if (req.status !== 'pending') {
      toast.error('Diese Anfrage wurde bereits bearbeitet.')
      return
    }

    const amount = Number(req.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Ungültiger Betrag.')
      return
    }

    const users = readJson(USERS_KEY, [])
    const idx = users.findIndex((u) => u.id === req.userId || u.email === req.email)
    if (idx === -1) {
      toast.error('User zur Anfrage nicht gefunden.')
      return
    }

    const nextUsers = [...users]
    const currentBalance = Number(nextUsers[idx].walletBalance || 0)
    const nextBalance = currentBalance + amount
    nextUsers[idx] = { ...nextUsers[idx], walletBalance: nextBalance }
    writeJson(USERS_KEY, nextUsers)

    const nextRequests = requests.map((r) =>
      r.id === requestId ? { ...r, status: 'approved', approvedAt: new Date().toISOString() } : r
    )
    writeJson(LOCAL_TOPUP_REQUESTS_KEY, nextRequests)

    const name = nextUsers[idx].displayName || (nextUsers[idx].email ? String(nextUsers[idx].email).split('@')[0] : '')
    appendMessage({
      toUserId: nextUsers[idx].id,
      type: 'topup_approved',
      title: '✅ Guthaben freigegeben',
      text: `Herzlichen Glückwunsch ${name ? name : ''}! 🎉\nDeine Aufladung wurde genehmigt.\nDein Guthaben wurde gutgeschrieben: +€${amount.toFixed(2)}.`
    })

    setRefreshTick((n) => n + 1)
    toast.success('✅ Guthaben aufgeladen und Anfrage freigegeben.')
  }

  const rejectTopupRequest = (requestId) => {
    if (isSupabase) {
      if (!canUseSupabaseAdmin) {
        toast.error('Bitte als Admin-Account anmelden.')
        return
      }
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      Promise.resolve()
        .then(async () => {
          const { data: req, error: reqErr } = await supabase.from('topup_requests').select('*').eq('id', requestId).maybeSingle()
          if (reqErr || !req) throw new Error('Auflade-Anfrage nicht gefunden.')
          if (req.status !== 'pending') throw new Error('Diese Anfrage wurde bereits bearbeitet.')
          const now = new Date().toISOString()
          const { error: upErr } = await supabase.from('topup_requests').update({ status: 'rejected', decided_at: now }).eq('id', requestId)
          if (upErr) throw new Error('Anfrage konnte nicht aktualisiert werden.')
          const uid = req.user_id
          const { data: prof } = await supabase.from('profiles').select('display_name,email').eq('user_id', uid).maybeSingle()
          const name = String(prof?.display_name || (prof?.email ? String(prof.email).split('@')[0] : '') || '').trim()
          await supabase.from('messages').insert({
            to_user_id: uid,
            type: 'topup_rejected',
            title: '❌ Aufladung abgelehnt',
            text: `Hey ${name ? name : ''}!\n\nEs tut uns leid – deine Aufladung konnte leider nicht freigegeben werden.\nBitte prüfe, ob der Code korrekt ist (keine Tippfehler) und versuche es erneut.\n\nWenn du Fragen hast, schreib uns an support.petvault@gmail.com.`
          })
        })
        .then(() => {
          setRefreshTick((n) => n + 1)
          toast.success('❌ Anfrage abgelehnt.')
        })
        .catch((e) => toast.error(e?.message || 'Fehler beim Ablehnen.'))
      return
    }
    const requests = readJson(LOCAL_TOPUP_REQUESTS_KEY, [])
    const req = requests.find((r) => r.id === requestId)
    if (!req) {
      toast.error('Auflade-Anfrage nicht gefunden.')
      return
    }
    if (req.status !== 'pending') {
      toast.error('Diese Anfrage wurde bereits bearbeitet.')
      return
    }

    const nextRequests = requests.map((r) =>
      r.id === requestId ? { ...r, status: 'rejected', rejectedAt: new Date().toISOString() } : r
    )
    writeJson(LOCAL_TOPUP_REQUESTS_KEY, nextRequests)

    const users = readJson(USERS_KEY, [])
    const u = users.find((x) => x.id === req.userId || x.email === req.email)
    const name = u?.displayName || (u?.email ? String(u.email).split('@')[0] : '')
    appendMessage({
      toUserId: req.userId,
      type: 'topup_rejected',
      title: '❌ Aufladung abgelehnt',
      text: `Hey ${name ? name : ''}!\n\nEs tut uns leid – deine Aufladung konnte leider nicht freigegeben werden.\nBitte prüfe, ob der Code korrekt ist (keine Tippfehler) und versuche es erneut.\n\nWenn du Fragen hast, schreib uns an support.petvault@gmail.com.`
    })

    setRefreshTick((n) => n + 1)
    toast.success('❌ Anfrage abgelehnt.')
  }

  const confirmPayout = (payoutId) => {
    if (isSupabase) {
      if (!canUseSupabaseAdmin) {
        toast.error('Bitte als Admin-Account anmelden.')
        return
      }
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      Promise.resolve()
        .then(async () => {
          const { data: payout, error: pErr } = await supabase.from('payouts').select('*').eq('id', payoutId).maybeSingle()
          if (pErr || !payout) throw new Error('Auszahlung nicht gefunden.')
          if (payout.status !== 'awaiting_trade') throw new Error('Diese Auszahlung wurde bereits bearbeitet.')
          const amount = Number(payout.amount || 0)
          if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ungültiger Betrag.')
          const sellerId = payout.seller_user_id
          if (!sellerId) throw new Error('Seller nicht gefunden.')
          const { data: prof, error: profErr } = await supabase.from('profiles').select('user_id,display_name,email,wallet_balance').eq('user_id', sellerId).maybeSingle()
          if (profErr || !prof) throw new Error('Seller nicht gefunden.')
          const nextBalance = Number(prof.wallet_balance || 0) + amount
          const { error: balErr } = await supabase.from('profiles').update({ wallet_balance: nextBalance }).eq('user_id', sellerId)
          if (balErr) throw new Error('Guthaben konnte nicht gutgeschrieben werden.')
          const now = new Date().toISOString()
          const { error: upErr } = await supabase.from('payouts').update({ status: 'paid', paid_at: now }).eq('id', payoutId)
          if (upErr) throw new Error('Auszahlung konnte nicht aktualisiert werden.')
          const name = String(prof.display_name || (prof.email ? String(prof.email).split('@')[0] : '') || '').trim()
          await supabase.from('messages').insert({
            to_user_id: sellerId,
            type: 'payout',
            title: '✅ Guthaben freigeschaltet',
            text: `Glückwunsch ${name ? name : ''}! Der Bot-Trade wurde bestätigt.\nDein Guthaben wurde gutgeschrieben: +€${amount.toFixed(2)}${payout.pet_name ? ` für "${payout.pet_name}"` : ''}.`
          })
        })
        .then(() => {
          setRefreshTick((n) => n + 1)
          toast.success('✅ Auszahlung bestätigt und Guthaben gutgeschrieben.')
        })
        .catch((e) => toast.error(e?.message || 'Fehler beim Bestätigen.'))
      return
    }
    const payouts = readJson(LOCAL_PAYOUTS_KEY, [])
    const idx = payouts.findIndex((p) => p.id === payoutId)
    if (idx === -1) {
      toast.error('Auszahlung nicht gefunden.')
      return
    }
    const payout = payouts[idx]
    if (payout.status !== 'awaiting_trade') {
      toast.error('Diese Auszahlung wurde bereits bearbeitet.')
      return
    }

    const amount = Number(payout.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Ungültiger Betrag.')
      return
    }

    const users = readJson(USERS_KEY, [])
    const uidx = users.findIndex((u) => u.id === payout.sellerId || u.email === payout.sellerEmail)
    if (uidx === -1) {
      toast.error('Seller nicht gefunden.')
      return
    }

    const nextUsers = [...users]
    const currentBalance = Number(nextUsers[uidx].walletBalance || 0)
    nextUsers[uidx] = { ...nextUsers[uidx], walletBalance: currentBalance + amount }
    writeJson(USERS_KEY, nextUsers)

    const nextPayouts = [...payouts]
    nextPayouts[idx] = { ...payout, status: 'paid', paidAt: new Date().toISOString() }
    writeJson(LOCAL_PAYOUTS_KEY, nextPayouts)

    const name = nextUsers[uidx].displayName || (nextUsers[uidx].email ? String(nextUsers[uidx].email).split('@')[0] : '')
    appendMessage({
      toUserId: payout.sellerId,
      type: 'payout',
      title: '✅ Guthaben freigeschaltet',
      text: `Glückwunsch ${name ? name : ''}! Der Bot-Trade wurde bestätigt.\nDein Guthaben wurde gutgeschrieben: +€${amount.toFixed(2)}${payout.petName ? ` für "${payout.petName}"` : ''}.`
    })

    setRefreshTick((n) => n + 1)
    toast.success('✅ Auszahlung bestätigt und Guthaben gutgeschrieben.')
  }

  const publishPet = async (draft) => {
    const payload = {
      name: draft.name,
      pet_type: draft.pet_type,
      neon: draft.neon || 'normal',
      age: draft.age || 'full_grown',
      flyable: Boolean(draft.flyable),
      rideable: Boolean(draft.rideable),
      price: typeof draft.price === 'number' ? draft.price : parseFloat(String(draft.price || '0')),
      description: draft.description || '',
      image_url: draft.image_url || '',
      seller_name: draft.seller_name || 'Admin',
      status: 'available',
      created_date: new Date().toISOString()
    }

    if (authMode === 'local') {
      const existing = getLocalPets()
      const pet = {
        ...payload,
        id: crypto.randomUUID(),
        seller_id: draft.seller_id || null,
        seller_email: draft.seller_email || null,
        seller_roblox: draft.seller_roblox || null
      }
      writeJson(LOCAL_PETS_KEY, [pet, ...existing])
      queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
      return pet
    }

    if (isSupabase) {
      if (!canUseSupabaseAdmin) throw new Error('Bitte als Admin-Account anmelden.')
      if (!supabase) throw new Error('Backend ist nicht aktiv.')
      const { data, error } = await supabase
        .from('pets')
        .insert({
          ...payload,
          seller_user_id: draft.seller_user_id || draft.seller_id || null,
          seller_id: draft.seller_id || null,
          seller_email: draft.seller_email || null,
          seller_roblox: draft.seller_roblox || null
        })
        .select('*')
        .single()
      if (error) throw new Error('Pet konnte nicht veröffentlicht werden.')
      queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
      return data
    }

    const created = await db.entities.Pet.create(payload)
    queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
    queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
    return created
  }

  

  const approveRequestMutation = useMutation({
    mutationFn: async (requestId) => {
      if (isSupabase) {
        if (!canUseSupabaseAdmin) throw new Error('Bitte als Admin-Account anmelden.')
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        const { data: pet, error: getErr } = await supabase.from('pets').select('*').eq('id', requestId).maybeSingle()
        if (getErr || !pet) throw new Error('Anfrage nicht gefunden.')
        const { error } = await supabase.from('pets').update({ status: 'available' }).eq('id', requestId)
        if (error) throw new Error('Fehler beim Posten.')
        const toUserId = pet.seller_user_id || pet.seller_id || null
        if (toUserId) {
          const sellerName = String(pet.seller_name || '').trim()
          const { error: msgErr } = await supabase.from('messages').insert({
            to_user_id: toUserId,
            type: 'sell_approved',
            title: '✅ Verkaufsantrag genehmigt',
            text: `Hey ${sellerName ? sellerName : ''}!\n\nGute Nachrichten: Dein Verkaufsantrag für „${pet.name || 'dein Pet'}“ wurde genehmigt.\nDas Pet ist jetzt im Marketplace sichtbar.\n\nViel Erfolg beim Verkauf! 🐰`
          })
          if (msgErr) {}
        }
        queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
        queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
        queryClient.invalidateQueries({ queryKey: ['admin-pending-pets-supabase'] })
        return true
      }

      if (authMode !== 'local') {
        await db.entities.Pet.update(requestId, { status: 'available' })
        queryClient.invalidateQueries({ queryKey: ['featured-pets'] })
        queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] })
        queryClient.invalidateQueries({ queryKey: ['admin-pending-pets'] })
        return true
      }

      const all = readJson(SELL_REQUESTS_KEY, [])
      const req = all.find((r) => r.id === requestId)
      if (!req) throw new Error('Anfrage nicht gefunden.')
      await publishPet(req)
      const approvedAt = new Date().toISOString()
      const updated = all.map((r) => (r.id === requestId ? { ...r, status: 'approved', approvedAt } : r))
      writeJson(SELL_REQUESTS_KEY, updated)

      const users = readJson(USERS_KEY, [])
      const u = users.find((x) => x.id === req.seller_id || x.email === req.seller_email)
      const name = u?.displayName || (u?.email ? String(u.email).split('@')[0] : '')
      appendMessage({
        toUserId: req.seller_id || null,
        type: 'sell_approved',
        title: '✅ Verkaufsantrag genehmigt',
        text: `Hey ${name ? name : ''}!\n\nGute Nachrichten: Dein Verkaufsantrag für „${req.name || 'dein Pet'}“ wurde genehmigt.\nDas Pet ist jetzt im Marketplace sichtbar.\n\nViel Erfolg beim Verkauf! 🐰`
      })

      setRefreshTick((n) => n + 1)
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sell-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pets-supabase'] })
      toast.success('✅ Pet wurde gepostet.')
    },
    onError: (e) => {
      toast.error(e?.message || 'Fehler beim Posten.')
    }
  })

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId) => {
      if (isSupabase) {
        if (!canUseSupabaseAdmin) throw new Error('Bitte als Admin-Account anmelden.')
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        const { data: pet, error: getErr } = await supabase.from('pets').select('*').eq('id', requestId).maybeSingle()
        if (getErr || !pet) throw new Error('Anfrage nicht gefunden.')
        const { error } = await supabase.from('pets').update({ status: 'rejected' }).eq('id', requestId)
        if (error) throw new Error('Fehler beim Ablehnen.')
        const toUserId = pet.seller_user_id || pet.seller_id || null
        if (toUserId) {
          const sellerName = String(pet.seller_name || '').trim()
          const { error: msgErr } = await supabase.from('messages').insert({
            to_user_id: toUserId,
            type: 'sell_rejected',
            title: '❌ Verkaufsantrag abgelehnt',
            text: `Hey ${sellerName ? sellerName : ''}!\n\nEs tut uns leid – dein Verkaufsantrag für „${pet.name || 'dein Pet'}“ wurde leider abgelehnt.\nBitte prüfe Name, Preis und Bild und sende den Antrag erneut.\n\nFragen? support.petvault@gmail.com 🐰`
          })
          if (msgErr) {}
        }
        queryClient.invalidateQueries({ queryKey: ['admin-pending-pets-supabase'] })
        queryClient.invalidateQueries({ queryKey: ['my-pets'] })
        return true
      }

      if (authMode !== 'local') {
        await db.entities.Pet.update(requestId, { status: 'rejected' })
        queryClient.invalidateQueries({ queryKey: ['admin-pending-pets'] })
        queryClient.invalidateQueries({ queryKey: ['my-pets'] })
        return true
      }

      const all = readJson(SELL_REQUESTS_KEY, [])
      const req = all.find((r) => r.id === requestId)
      const rejectedAt = new Date().toISOString()
      const updated = all.map((r) => (r.id === requestId ? { ...r, status: 'rejected', rejectedAt } : r))
      writeJson(SELL_REQUESTS_KEY, updated)

      if (req) {
        const users = readJson(USERS_KEY, [])
        const u = users.find((x) => x.id === req.seller_id || x.email === req.seller_email)
        const name = u?.displayName || (u?.email ? String(u.email).split('@')[0] : '')
        appendMessage({
          toUserId: req.seller_id || null,
          type: 'sell_rejected',
          title: '❌ Verkaufsantrag abgelehnt',
          text: `Hey ${name ? name : ''}!\n\nEs tut uns leid – dein Verkaufsantrag für „${req.name || 'dein Pet'}“ wurde leider abgelehnt.\nBitte prüfe Name, Preis und Bild und sende den Antrag erneut.\n\nFragen? support.petvault@gmail.com 🐰`
        })
      }

      setRefreshTick((n) => n + 1)
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sell-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pets'] })
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pets-supabase'] })
      toast.success('🗑️ Anfrage abgelehnt.')
    }
  })

  const createPetMutation = useMutation({
    mutationFn: async () => publishPet(petForm),
    onSuccess: () => {
      toast.success('🎉 Pet veröffentlicht!')
      setRefreshTick((n) => n + 1)
      setPetForm({
        name: '',
        pet_type: '',
        neon: 'normal',
        age: 'full_grown',
        flyable: false,
        rideable: false,
        price: '',
        description: '',
        image_url: '',
      })
    },
    onError: (e) => {
      toast.error(e?.message || 'Fehler beim Veröffentlichen.')
    }
  })

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { file_url } = await db.integrations.Core.UploadFile({ file })
      if (file_url) {
        setPetForm((p) => ({ ...p, image_url: file_url }))
      } else {
        const dataUrl = await readFileAsDataUrl(file)
        setPetForm((p) => ({ ...p, image_url: dataUrl }))
      }
    } catch {
      const dataUrl = await readFileAsDataUrl(file)
      setPetForm((p) => ({ ...p, image_url: dataUrl }))
    } finally {
      setUploading(false)
    }
  }

  const onUnlock = async (e) => {
    e.preventDefault()
    setError(null)
    const raw = String(password || '')
    if (!raw) {
      setError('Bitte Passwort eingeben.')
      return
    }

    if (adminPasswordEnv) {
      if (raw !== adminPasswordEnv) {
        setError('Falsches Admin-Passwort.')
        return
      }
      setUnlocked(true)
      return
    }

    if (!storedAdmin?.saltHex || !storedAdmin?.hashHex) {
      setError('Admin-Passwort ist nicht eingerichtet.')
      return
    }

    const hash = await hashPassword(raw, storedAdmin.saltHex)
    if (hash !== storedAdmin.hashHex) {
      setError('Falsches Admin-Passwort.')
      return
    }
    setUnlocked(true)
  }

  const onSetupPassword = async (e) => {
    e.preventDefault()
    setError(null)
    const p1 = String(setupPassword || '')
    const p2 = String(setupPassword2 || '')
    if (p1.length < 4) {
      setError('Passwort muss mindestens 4 Zeichen haben.')
      return
    }
    if (p1 !== p2) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    const saltHex = bytesToHex(saltBytes)
    const hashHex = await hashPassword(p1, saltHex)
    writeJson(ADMIN_PASSWORD_KEY, { saltHex, hashHex, createdAt: new Date().toISOString() })
    setPassword('')
    setSetupPassword('')
    setSetupPassword2('')
    toast.success('✅ Admin-Passwort eingerichtet. Bitte jetzt einloggen.')
  }

  if (!unlocked) {
    const needsSetup = !adminPasswordEnv && !storedAdmin
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-cyan-50 via-teal-50 to-pink-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="space-y-1">
            <div className="font-heading text-2xl text-primary">PetVault</div>
            <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
            <p className="text-sm text-slate-600">{needsSetup ? 'Admin-Passwort einrichten.' : 'Admin-Passwort eingeben.'}</p>
            <p className="text-xs text-slate-500">Hinweis: Normale Nutzer melden sich über „Anmelden“ an. Dieser Bereich ist nur für Admin.</p>
          </div>

          {error ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}

          {needsSetup ? (
            <form className="space-y-3" onSubmit={onSetupPassword}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Neues Admin-Passwort</label>
                <input
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  type="password"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Passwort bestätigen</label>
                <input
                  value={setupPassword2}
                  onChange={(e) => setSetupPassword2(e.target.value)}
                  type="password"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <button type="submit" className="w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium">
                Speichern
              </button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={onUnlock}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Admin-Passwort</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <button type="submit" className="w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium">
                Öffnen
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-heading text-2xl text-primary">PetVault</div>
            <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
            <p className="text-sm text-slate-600">Alles übersichtlich in Bereichen – ohne Scroll-Marathon.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                localLogout?.()
                navigate('/login', { replace: true })
              }}
              className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-800"
            >
              Ausloggen
            </button>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="h-10 px-3 rounded-md bg-slate-900 text-white text-sm font-medium"
            >
              Zur App
            </button>
          </div>
        </div>

        {isSupabase && !isAuthenticated ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="font-heading text-xl text-slate-900">Bitte zuerst anmelden</div>
            <div className="text-sm text-slate-600 mt-1">
              Damit du Anfragen, Codes, Guthaben und Bestellungen sehen und bearbeiten kannst, musst du zusätzlich normal bei PetVault eingeloggt sein.
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="rounded-2xl font-bold" onClick={() => navigate('/login?redirect=%2Fadmin')}>
                Anmelden
              </Button>
              <Button variant="outline" className="rounded-2xl font-bold" onClick={() => navigate('/', { replace: true })}>
                Zur App
              </Button>
            </div>
          </div>
        ) : null}

        {isSupabase && isAuthenticated && adminEmailEnv && String(user?.email || '').trim().toLowerCase() !== String(adminEmailEnv).trim().toLowerCase() ? (
          <div className="bg-white border border-red-200 rounded-2xl p-6">
            <div className="font-heading text-xl text-slate-900">Kein Admin-Account</div>
            <div className="text-sm text-slate-600 mt-1">
              Du bist mit <span className="font-semibold">{String(user?.email || '').trim() || '-'}</span> eingeloggt, aber nur der Admin-Account darf dieses Panel nutzen.
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                className="rounded-2xl font-bold"
                onClick={() => {
                  localLogout?.()
                  navigate('/login?redirect=%2Fadmin', { replace: true })
                }}
              >
                Mit Admin anmelden
              </Button>
            </div>
          </div>
        ) : null}

        <Tabs value={section} onValueChange={setSection} className="space-y-6">
          <TabsList className="bg-white border border-slate-200 rounded-2xl p-1 flex flex-wrap">
            <TabsTrigger value="requests" className="rounded-xl font-bold">
              Verkaufsanfragen ({(authMode === 'local' ? data.pendingRequests : isSupabase ? pendingPetsSupabase : pendingPetsBase44).length})
            </TabsTrigger>
            <TabsTrigger value="publish" className="rounded-xl font-bold">
              Pet posten
            </TabsTrigger>
            <TabsTrigger value="import" className="rounded-xl font-bold">
              Import
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-xl font-bold">
              Bestellungen ({data.orders.length})
            </TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-xl font-bold">
              Aufgaben
            </TabsTrigger>
            <TabsTrigger value="wallet" className="rounded-xl font-bold">
              Guthaben ({data.walletCodes.length + data.pendingTopups.length})
            </TabsTrigger>
            <TabsTrigger value="coupons" className="rounded-xl font-bold">
              Coupons ({data.coupons.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-xl font-bold">
              Konten ({data.users.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl font-bold">
              Events ({data.audit.length})
            </TabsTrigger>
          </TabsList>

          {section === 'requests' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="font-medium text-slate-900">Verkaufsanfragen</div>
                <div className="text-sm text-slate-600">
                  {(authMode === 'local' ? data.pendingRequests : isSupabase ? pendingPetsSupabase : pendingPetsBase44).length}
                </div>
              </div>
              <div className="p-4 space-y-3">
                {(authMode === 'local' ? data.pendingRequests : isSupabase ? pendingPetsSupabase : pendingPetsBase44).map((r) => (
                  <div key={r.id} className="border-2 border-slate-100 rounded-2xl p-4 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                          {r.image_url ? (
                            <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-heading text-lg text-slate-900 truncate">{r.name}</div>
                          <div className="text-xs text-slate-600 font-semibold mt-1">
                            {r.pet_type} • {r.neon} • {r.age}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Angefragt: {formatDate(r.createdAt || r.created_at || r.created_date)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                          €{Number(r.price || 0).toFixed(2)}
                        </Badge>
                        <Badge variant="outline" className="font-bold text-slate-700 border-slate-200">
                          {r.seller_email || '-'}
                        </Badge>
                        <Badge variant="outline" className="font-bold text-slate-700 border-slate-200">
                          {r.seller_roblox || '-'}
                        </Badge>
                      </div>
                    </div>

                    {r.description ? (
                      <div className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        {r.description}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
                      <Button
                        size="sm"
                        className="rounded-xl font-bold"
                        onClick={() => approveRequestMutation.mutate(r.id)}
                        disabled={approveRequestMutation.isPending}
                      >
                        Posten
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl font-bold"
                        onClick={() => rejectRequestMutation.mutate(r.id)}
                        disabled={rejectRequestMutation.isPending}
                      >
                        Ablehnen
                      </Button>
                    </div>
                  </div>
                ))}

                {(authMode === 'local' ? data.pendingRequests : isSupabase ? pendingPetsSupabase : pendingPetsBase44).length === 0 ? (
                  <div className="px-1 py-6 text-slate-600">Keine offenen Anfragen.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === 'publish' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="mb-6">
                <h2 className="font-heading text-2xl text-slate-900">Pet veröffentlichen (Admin)</h2>
                <p className="text-sm text-slate-600 mt-1">Direkt veröffentlichen, ohne Anfrage.</p>
              </div>

              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setError(null)
                  if (!petForm.name || !petForm.pet_type || !petForm.price) {
                    toast.error('Bitte Name, Seltenheit und Preis ausfüllen.')
                    return
                  }
                  createPetMutation.mutate()
                }}
              >
                <Card className="border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 transition-colors rounded-3xl overflow-hidden">
                  <label className="flex flex-col items-center justify-center p-8 cursor-pointer">
                    {petForm.image_url ? (
                      <img src={petForm.image_url} alt="Preview" className="w-32 h-32 object-cover rounded-2xl shadow-md" />
                    ) : uploading ? (
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
                          <Upload className="w-8 h-8 text-primary" />
                        </div>
                        <p className="font-bold text-foreground">Bild hochladen</p>
                        <p className="text-sm text-muted-foreground mt-1">Klick hier, um ein Bild auszuwählen</p>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </Card>

                <div className="space-y-2">
                  <Label className="font-bold">Pet Name *</Label>
                  <Input
                    placeholder="z.B. Shadow Dragon"
                    value={petForm.name}
                    onChange={(e) => setPetForm((p) => ({ ...p, name: e.target.value }))}
                    required
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold">Seltenheit *</Label>
                    <Select value={petForm.pet_type} onValueChange={(v) => setPetForm((p) => ({ ...p, pet_type: v }))} required>
                      <SelectTrigger className="rounded-xl border-2 font-semibold">
                        <SelectValue placeholder="Wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="legendary">⭐ Legendary</SelectItem>
                        <SelectItem value="ultra_rare">💜 Ultra Rare</SelectItem>
                        <SelectItem value="rare">💙 Rare</SelectItem>
                        <SelectItem value="uncommon">💚 Uncommon</SelectItem>
                        <SelectItem value="common">🩶 Common</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold">Neon-Status</Label>
                    <Select value={petForm.neon} onValueChange={(v) => setPetForm((p) => ({ ...p, neon: v }))}>
                      <SelectTrigger className="rounded-xl border-2 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="neon">✨ Neon</SelectItem>
                        <SelectItem value="mega_neon">🌈 Mega Neon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold">Alter</Label>
                    <Select value={petForm.age} onValueChange={(v) => setPetForm((p) => ({ ...p, age: v }))}>
                      <SelectTrigger className="rounded-xl border-2 font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newborn">Newborn</SelectItem>
                        <SelectItem value="junior">Junior</SelectItem>
                        <SelectItem value="pre_teen">Pre-Teen</SelectItem>
                        <SelectItem value="teen">Teen</SelectItem>
                        <SelectItem value="post_teen">Post-Teen</SelectItem>
                        <SelectItem value="full_grown">Full Grown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-8 p-4 bg-secondary rounded-2xl">
                  <div className="flex items-center gap-3">
                    <Switch checked={petForm.flyable} onCheckedChange={(v) => setPetForm((p) => ({ ...p, flyable: v }))} />
                    <Label className="font-bold text-base">✈️ Fly</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={petForm.rideable} onCheckedChange={(v) => setPetForm((p) => ({ ...p, rideable: v }))} />
                    <Label className="font-bold text-base">🚲 Ride</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold">Preis (EUR) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={petForm.price}
                    onChange={(e) => setPetForm((p) => ({ ...p, price: e.target.value }))}
                    required
                    className="rounded-xl border-2 font-heading text-2xl h-14"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold">Beschreibung</Label>
                  <Textarea
                    placeholder="Weitere Details zu deinem Pet..."
                    value={petForm.description}
                    onChange={(e) => setPetForm((p) => ({ ...p, description: e.target.value }))}
                    className="rounded-xl border-2 font-semibold h-24"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 font-bold text-base rounded-2xl h-14 shadow-lg shadow-primary/25"
                  disabled={createPetMutation.isPending}
                >
                  {createPetMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      🎉 Pet veröffentlichen <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          ) : null}

          {section === 'import' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="font-heading text-2xl text-slate-900">Import (Partner-Daten)</h2>
                <p className="text-sm text-slate-600">
                  Hier kannst du eine autorisierte JSON-Liste importieren. Das setzt voraus, dass du die Daten rechtmäßig nutzen darfst.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="font-bold">JSON-URL (optional)</Label>
                  <Input
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://.../pets.json"
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Modus</Label>
                  <Select value={importMode} onValueChange={setImportMode}>
                    <SelectTrigger className="rounded-xl border-2 font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">Anhängen</SelectItem>
                      <SelectItem value="replace">Ersetzen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" className="rounded-2xl font-bold" onClick={() => importPets({ source: 'url', mode: importMode })}>
                  Von URL importieren
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl font-bold"
                  onClick={() => {
                    setImportUrl('')
                    setImportJson('')
                    setImportMode('append')
                  }}
                >
                  Zurücksetzen
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="font-bold">JSON einfügen</Label>
                <Textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder='[{"name":"Shadow Dragon","pet_type":"legendary","neon":"normal","category":"Dragon","price":10,"image_url":"https://..."}]'
                  className="rounded-xl border-2 font-semibold h-44"
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" className="rounded-2xl font-bold" onClick={() => importPets({ source: 'text', mode: importMode })}>
                  JSON importieren
                </Button>
              </div>
            </div>
          ) : null}

          {section === 'orders' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="font-medium text-slate-900">Bestellungen</div>
                <div className="text-sm text-slate-600">{data.orders.length}</div>
              </div>
              <div className="p-4 space-y-3">
                {data.orders.map((o, idx) => {
                  const status = String(o.status || '-')
                  const statusClass =
                    status === 'delivered'
                      ? 'text-emerald-700 border-emerald-300'
                      : status === 'processing'
                        ? 'text-amber-700 border-amber-300'
                        : status === 'awaiting_payment'
                          ? 'text-slate-700 border-slate-300'
                          : 'text-slate-700 border-slate-300'
                  return (
                    <details key={o.id || `o-${idx}`} className="border-2 border-slate-100 rounded-2xl bg-white">
                      <summary className="cursor-pointer list-none px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-heading text-lg text-slate-900">
                            Bestellung {o.id ? `#${String(o.id).slice(0, 8)}` : ''}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {formatDate(o.createdAt)} • {o.buyer_email || '-'}
                          </div>
                          <div className="text-xs text-slate-600 font-semibold mt-1">
                            Roblox: @{o.roblox_username || '-'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Badge variant="outline" className={`font-bold ${statusClass}`}>
                            {status}
                          </Badge>
                          <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                            €{Number(o.total || 0).toFixed(2)}
                          </Badge>
                          {o.coupon_code ? (
                            <Badge variant="outline" className="font-bold text-emerald-700 border-emerald-300">
                              Coupon {o.coupon_code}
                            </Badge>
                          ) : null}
                        </div>
                      </summary>
                      <div className="px-4 pb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs text-slate-600 font-semibold">Zahlung</div>
                            <div className="text-slate-900 font-bold mt-1">{o.payment_method || '-'}</div>
                            <div className="text-xs text-slate-600 font-semibold mt-2">Rabatt</div>
                            <div className="text-slate-900 font-bold mt-1">€{Number(o.discount_amount || 0).toFixed(2)}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs text-slate-600 font-semibold">Passwort</div>
                            <div className="text-slate-900 font-mono text-xs mt-1 break-words">{o.delivery_password || '-'}</div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs text-slate-600 font-semibold">Pets</div>
                          <div className="text-slate-900 font-bold mt-1 break-words">
                            {Array.isArray(o.pet_names) && o.pet_names.length ? o.pet_names.join(', ') : '-'}
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="text-xs text-slate-600 font-semibold">Auszahlung (Seller)</div>
                          <div className="mt-2 space-y-2">
                            {data.payouts.filter((p) => p.orderId === o.id).map((p) => (
                              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold text-slate-900">
                                    {p.sellerEmail || p.sellerId || '-'}
                                  </div>
                                  <div className="text-xs text-slate-600 font-semibold mt-0.5">
                                    {p.petName ? `Pet: ${p.petName}` : 'Pet'} • €{Number(p.amount || 0).toFixed(2)}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    Status: {p.status}{p.paidAt ? ` • ${formatDate(p.paidAt)}` : ''}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 sm:justify-end">
                                  {p.status === 'awaiting_trade' ? (
                                    <Button size="sm" className="rounded-xl font-bold" onClick={() => confirmPayout(p.id)}>
                                      Bot-Trade bestätigt
                                    </Button>
                                  ) : (
                                    <Badge variant="outline" className="font-bold text-emerald-700 border-emerald-300">
                                      Ausgezahlt
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                            {data.payouts.filter((p) => p.orderId === o.id).length === 0 ? (
                              <div className="text-sm text-slate-600">Noch keine Auszahlungseinträge.</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </details>
                  )
                })}

                {data.orders.length === 0 ? (
                  <div className="px-1 py-6 text-slate-600">Noch keine Bestellungen.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === 'tasks' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-2xl text-slate-900">Aufgaben</h2>
                  <p className="text-sm text-slate-600 mt-1">3 Schritte, damit nichts vergessen wird.</p>
                </div>
              </div>

              <div className="space-y-3">
                {data.orders.length === 0 ? (
                  <div className="text-sm text-slate-600">Noch keine Bestellungen.</div>
                ) : (
                  <div className="space-y-3">
                    {data.orders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setActiveTaskOrderId(o.id)}
                        className={`w-full text-left border-2 rounded-2xl p-4 ${activeTaskOrderId === o.id ? 'border-primary/40 bg-primary/5' : 'border-slate-100 bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900">Bestellung #{String(o.id).slice(0, 8)}</div>
                            <div className="text-xs text-slate-500 mt-1">{formatDate(o.createdAt)} • {o.buyer_email || '-'}</div>
                            <div className="text-xs text-slate-600 font-semibold mt-1">Roblox: @{o.roblox_username || '-'}</div>
                          </div>
                          <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">€{Number(o.total || 0).toFixed(2)}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activeTaskOrderId ? (
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  {(() => {
                    const order = data.orders.find((x) => x.id === activeTaskOrderId)
                    if (!order) return <div className="text-sm text-slate-600">Bestellung nicht gefunden.</div>
                    const payoutsForOrder = data.payouts.filter((p) => p.orderId === order.id)
                    const totalPayout = payoutsForOrder.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                    return (
                      <>
                        <div className="font-heading text-xl text-slate-900">Bestellung #{String(order.id).slice(0, 8)}</div>

                        <div className="space-y-2">
                          <div className="font-bold text-slate-900">1) Bot Account einloggen</div>
                          <div className="text-sm text-slate-600">Bot Account öffnen und in Adopt Me bereit sein.</div>
                          <Button type="button" className="rounded-2xl font-bold" onClick={() => setBotLoginDone(true)} disabled={botLoginDone}>
                            {botLoginDone ? '✅ Erledigt' : 'Als erledigt markieren'}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="font-bold text-slate-900">2) Roblox Namen hinzufügen</div>
                          <div className="text-sm text-slate-600">Kunde (Kauf): @{order.roblox_username || '-'}</div>
                          {payoutsForOrder.length ? (
                            <div className="text-sm text-slate-600 mt-1">
                              Seller (Verkauf): {payoutsForOrder.map((p) => `@${p.sellerRoblox || '-'}`).join(' • ')}
                            </div>
                          ) : null}
                          <Button type="button" className="rounded-2xl font-bold" onClick={() => setCustomerAddedDone(true)} disabled={customerAddedDone}>
                            {customerAddedDone ? '✅ Erledigt' : 'Als erledigt markieren'}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="font-bold text-slate-900">3) Geld genehmigen (Seller)</div>
                          <div className="text-sm text-slate-600">
                            Guthaben wird erst freigeschaltet, nachdem der Seller das Pet an den Bot getradet hat.
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-bold text-slate-900">Summe Auszahlungen: €{Number(totalPayout || 0).toFixed(2)}</div>
                            <div className="mt-3 space-y-2">
                              {payoutsForOrder.map((p) => (
                                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-slate-200 rounded-xl p-3 bg-white">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-900">{p.sellerEmail || '-'}</div>
                                    <div className="text-xs text-slate-600 font-semibold mt-0.5">
                                      {p.petName ? `Pet: ${p.petName}` : 'Pet'} • €{Number(p.amount || 0).toFixed(2)}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">Status: {p.status}</div>
                                  </div>
                                  <div className="flex items-center gap-2 sm:justify-end">
                                    {p.status === 'awaiting_trade' ? (
                                      <Button size="sm" className="rounded-xl font-bold" onClick={() => confirmPayout(p.id)}>
                                        Trade ok → Guthaben
                                      </Button>
                                    ) : (
                                      <Badge variant="outline" className="font-bold text-emerald-700 border-emerald-300">Ausgezahlt</Badge>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {payoutsForOrder.length === 0 ? (
                                <div className="text-sm text-slate-600">Keine Seller-Auszahlungen bei dieser Bestellung.</div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}

          {section === 'wallet' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-2xl text-slate-900">Guthaben-Codes</h2>
                  <p className="text-sm text-slate-600 mt-1">Erstelle Codes, die Nutzer im Account unter „Guthaben“ einlösen.</p>
                </div>
              </div>

              {lastWalletCode ? (
                <div className="p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50">
                  <div className="font-bold text-slate-900">Neuer Code</div>
                  <div className="text-sm text-slate-700 mt-1">€{Number(lastWalletCode.amount || 0).toFixed(2)}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="px-3 py-2 rounded-xl bg-white border border-emerald-200 font-mono text-sm">
                      {lastWalletCode.code}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl font-bold"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastWalletCode.code)
                          toast.success('Kopiert.')
                        } catch {
                          toast.error('Kopieren fehlgeschlagen.')
                        }
                      }}
                    >
                      Kopieren
                    </Button>
                    <Button size="sm" className="rounded-xl font-bold" onClick={() => setLastWalletCode(null)}>
                      OK
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="font-bold">Betrag (EUR)</Label>
                  <Input
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="z.B. 10"
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <Button type="button" className="w-full rounded-2xl font-bold" onClick={createWalletCode}>
                    Code erstellen
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-semibold text-slate-900">Aufladeanfragen</div>
                {data.pendingTopups.map((t) => (
                  <div key={t.id} className="border-2 border-slate-100 rounded-2xl p-4 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900">{t.email || '-'}</div>
                        <div className="text-xs text-slate-500 mt-1">Anfrage: {formatDate(t.createdAt)}</div>
                        {t.paymentMethod ? (
                          <div className="text-xs text-slate-600 font-semibold mt-1">
                            Methode: {t.paymentMethod === 'roblox_giftcard' ? 'Roblox Gift-Card' : t.paymentMethod}
                          </div>
                        ) : null}
                        {t.giftCardCode ? (
                          <div className="text-xs text-slate-700 font-mono mt-1 break-words">Code: {t.giftCardCode}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                          €{Number(t.amount || 0).toFixed(2)}
                        </Badge>
                        <Button size="sm" className="rounded-xl font-bold" onClick={() => approveTopupRequest(t.id)}>
                          Freigeben
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl font-bold border-2 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => rejectTopupRequest(t.id)}>
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {data.pendingTopups.length === 0 ? (
                  <div className="text-sm text-slate-600">Keine offenen Aufladeanfragen.</div>
                ) : null}
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="font-semibold text-slate-900">Guthaben-Codes</div>
                {data.walletCodes.map((c, idx) => {
                  const used = Boolean(c.usedAt)
                  return (
                    <div key={c.code || `c-${idx}`} className="border-2 border-slate-100 rounded-2xl p-4 bg-white">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-slate-900 break-words">{c.code}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            Erstellt: {formatDate(c.createdAt)}
                            {used ? ` • Verwendet: ${formatDate(c.usedAt)}` : ''}
                          </div>
                          {used && c.usedByEmail ? (
                            <div className="text-xs text-slate-600 font-semibold mt-1">Von: {c.usedByEmail}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                            €{Number(c.amount || 0).toFixed(2)}
                          </Badge>
                          <Badge variant="outline" className={`font-bold ${used ? 'text-slate-700 border-slate-300' : 'text-emerald-700 border-emerald-300'}`}>
                            {used ? 'Verwendet' : 'Aktiv'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {data.walletCodes.length === 0 ? (
                  <div className="text-sm text-slate-600">Noch keine Codes.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === 'coupons' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-heading text-2xl text-slate-900">Coupons</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Erstelle Rabatt-Codes und lege fest, wann sie gelten (z.B. nur Neon oder nur Legendary) und wie oft sie genutzt werden dürfen.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="font-bold">Code</Label>
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="z.B. NEON10"
                    className="rounded-xl border-2 font-semibold uppercase"
                  />
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Rabatt (%)</Label>
                  <Input
                    value={couponPercentOff}
                    onChange={(e) => setCouponPercentOff(e.target.value)}
                    inputMode="decimal"
                    placeholder="10"
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Neon</Label>
                  <Select value={couponNeonRule} onValueChange={setCouponNeonRule}>
                    <SelectTrigger className="rounded-xl border-2 font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Alle</SelectItem>
                      <SelectItem value="normal_only">Nur Normal</SelectItem>
                      <SelectItem value="neon_only">Nur Neon</SelectItem>
                      <SelectItem value="mega_only">Nur Mega Neon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Rarity</Label>
                  <Select value={couponRarityRule} onValueChange={setCouponRarityRule}>
                    <SelectTrigger className="rounded-xl border-2 font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Alle</SelectItem>
                      <SelectItem value="legendary">⭐ Legendary</SelectItem>
                      <SelectItem value="ultra_rare">💜 Ultra Rare</SelectItem>
                      <SelectItem value="rare">💙 Rare</SelectItem>
                      <SelectItem value="uncommon">💚 Uncommon</SelectItem>
                      <SelectItem value="common">🩶 Common</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Max. Pets</Label>
                  <Input
                    value={couponMaxPets}
                    onChange={(e) => setCouponMaxPets(e.target.value)}
                    inputMode="numeric"
                    placeholder="z.B. 3"
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="font-bold">Max. Nutzung</Label>
                  <Input
                    value={couponMaxUses}
                    onChange={(e) => setCouponMaxUses(e.target.value)}
                    inputMode="numeric"
                    placeholder="z.B. 50"
                    className="rounded-xl border-2 font-semibold"
                  />
                </div>
                <div className="sm:col-span-6 flex justify-end">
                  <Button type="button" className="rounded-2xl font-bold" onClick={createCoupon}>
                    Coupon erstellen
                  </Button>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="font-semibold text-slate-900">Aktive Coupons</div>
                {data.coupons.map((c) => {
                  const used = Number(c.usedCount || 0)
                  const max = c.maxUses == null ? null : Number(c.maxUses)
                  const remaining = max == null ? null : Math.max(0, max - used)
                  const neonLabel =
                    c.neonRule === 'normal_only'
                      ? 'Nur Normal'
                      : c.neonRule === 'neon_only'
                        ? 'Nur Neon'
                        : c.neonRule === 'mega_only'
                          ? 'Nur Mega Neon'
                          : 'Alle'
                  const rarityLabel =
                    c.rarityRule && c.rarityRule !== 'any'
                      ? String(c.rarityRule)
                          .replace('ultra_rare', 'Ultra Rare')
                          .replace('uncommon', 'Uncommon')
                          .replace('common', 'Common')
                          .replace('rare', 'Rare')
                          .replace('legendary', 'Legendary')
                      : 'Alle'
                  const maxPets = c.maxPets == null ? null : Number(c.maxPets)
                  return (
                    <div key={c.id} className="border-2 border-slate-100 rounded-2xl p-4 bg-white">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-slate-900 break-words">{c.code}</div>
                          <div className="text-xs text-slate-500 mt-1">Erstellt: {formatDate(c.createdAt)}</div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                              -{Number(c.percentOff || 0).toFixed(0)}%
                            </Badge>
                            <Badge variant="outline" className="font-bold text-slate-700 border-slate-200">
                              Neon: {neonLabel}
                            </Badge>
                            <Badge variant="outline" className="font-bold text-slate-700 border-slate-200">
                              Rarity: {rarityLabel}
                            </Badge>
                            {maxPets != null && Number.isFinite(maxPets) ? (
                              <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                                Max. Pets: {maxPets}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="font-bold text-slate-900 border-slate-200">
                              {max == null ? `Nutzung: ${used}` : `Nutzung: ${used}/${max} (${remaining} übrig)`}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:justify-end">
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-bold text-slate-700">Aktiv</div>
                            <Switch checked={Boolean(c.active)} onCheckedChange={() => toggleCouponActive(c.id)} />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl font-bold border-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => deleteCoupon(c.id)}
                          >
                            Löschen
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {data.coupons.length === 0 ? <div className="text-sm text-slate-600">Noch keine Coupons.</div> : null}
              </div>
            </div>
          ) : null}

          {section === 'users' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="font-medium text-slate-900">Registrierte Konten</div>
                <div className="text-sm text-slate-600">{data.users.length}</div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Name</th>
                      <th className="text-left font-medium px-4 py-2">E-Mail</th>
                      <th className="text-left font-medium px-4 py-2">Roblox</th>
                      <th className="text-left font-medium px-4 py-2">IP</th>
                      <th className="text-left font-medium px-4 py-2">Passwort</th>
                      <th className="text-left font-medium px-4 py-2">Erstellt</th>
                      <th className="text-left font-medium px-4 py-2">Letzter Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-2 text-slate-900">{u.displayName || '-'}</td>
                        <td className="px-4 py-2 text-slate-900">{u.email}</td>
                        <td className="px-4 py-2 text-slate-700">{u.robloxUsername || '-'}</td>
                        <td className="px-4 py-2 text-slate-700">{u.ipAddress}</td>
                        <td className="px-4 py-2 text-slate-900 font-mono text-xs">{u.originalPassword}</td>
                        <td className="px-4 py-2 text-slate-700">{u.createdAt || '-'}</td>
                        <td className="px-4 py-2 text-slate-700">{u.lastLoginAt || '-'}</td>
                      </tr>
                    ))}
                    {data.users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-slate-600">
                          Keine Registrierungen vorhanden.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {section === 'events' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="font-medium text-slate-900">Login-/Signup-Events</div>
                <div className="text-sm text-slate-600">{data.audit.length}</div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Typ</th>
                      <th className="text-left font-medium px-4 py-2">E-Mail</th>
                      <th className="text-left font-medium px-4 py-2">Zeit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.audit.map((e, idx) => (
                      <tr key={`${e.at || 't'}-${idx}`}>
                        <td className="px-4 py-2 text-slate-900">{e.type}</td>
                        <td className="px-4 py-2 text-slate-700">{e.email || '-'}</td>
                        <td className="px-4 py-2 text-slate-700">{e.at || '-'}</td>
                      </tr>
                    ))}
                    {data.audit.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-slate-600">
                          Noch keine Events.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Tabs>
      </div>
    </div>
  )
}
