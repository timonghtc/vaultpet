import React, { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/lib/useCart';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Trash2, ShoppingCart, Tag, Loader2, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };
const LOCAL_PETS_KEY = 'local_pets';
const LOCAL_ORDERS_KEY = 'local_orders';
const LOCAL_USERS_KEY = 'local_auth_users';
const LOCAL_PAYOUTS_KEY = 'local_payouts';
const LOCAL_MESSAGES_KEY = 'local_messages';
const LOCAL_COUPONS_KEY = 'local_coupons';

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

export default function Checkout() {
  const navigate = useNavigate();
  const { authMode, user, isAuthenticated, isLoadingAuth, refreshLocalUser } = useAuth();
  const { cart, removeFromCart, clearCart, total } = useCart();
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [robloxUsername, setRobloxUsername] = useState('');
  const [deliveryPassword, setDeliveryPassword] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedInfo, setPlacedInfo] = useState(null);

  const isCouponEligibleForPet = (coupon, pet) => {
    if (!coupon || !pet) return false
    const neon = String(pet.neon || 'normal').toLowerCase()
    const petIsNeonOrMega = neon !== 'normal'
    if (coupon.neonRule === 'neon_only' && !petIsNeonOrMega) return false
    if (coupon.neonRule === 'mega_only' && neon !== 'mega_neon') return false
    if (coupon.neonRule === 'normal_only' && petIsNeonOrMega) return false

    const rarity = String(pet.pet_type || '').toLowerCase()
    if (coupon.rarityRule === 'legendary_only' && rarity !== 'legendary') return false
    if (coupon.rarityRule && coupon.rarityRule !== 'any' && coupon.rarityRule !== 'legendary_only' && rarity !== String(coupon.rarityRule).toLowerCase()) {
      return false
    }
    return true
  }

  const discount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'free3') {
      const prices = cart
        .map((p) => Number(p.price || 0))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      return prices.slice(0, 3).reduce((sum, n) => sum + n, 0);
    }
    if (appliedCoupon.type === 'free_total') {
      return total;
    }
    if (appliedCoupon.type === 'local_coupon') {
      const percent = Number(appliedCoupon.percentOff || 0)
      if (!Number.isFinite(percent) || percent <= 0) return 0
      const eligiblePrices = cart
        .filter((p) => isCouponEligibleForPet(appliedCoupon, p))
        .map((p) => Number(p.price || 0))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => b - a)
      const maxPets = appliedCoupon.maxPets == null ? null : Number(appliedCoupon.maxPets)
      const selected = maxPets != null && Number.isFinite(maxPets) && maxPets > 0 ? eligiblePrices.slice(0, maxPets) : eligiblePrices
      const eligibleSubtotal = selected.reduce((sum, n) => sum + n, 0)
      const raw = (eligibleSubtotal * percent) / 100
      const rounded = Math.round(raw * 100) / 100
      return Math.min(total, Math.max(0, rounded))
    }
    return Number(appliedCoupon.discount || 0);
  }, [appliedCoupon, cart, total]);
  const finalTotal = Math.max(0, total - discount);
  const isFreeCheckout = finalTotal <= 0;
  const walletBalance = Number(user?.walletBalance || 0);
  const isWalletCheckout = (authMode === 'local' || authMode === 'supabase') && walletBalance >= finalTotal && finalTotal > 0;
  const canPay = (authMode === 'local' || authMode === 'supabase') && (isFreeCheckout || isWalletCheckout);

  useEffect(() => {
    if (authMode !== 'supabase') return
    if (!isAuthenticated) return
    if (!supabase) return
    if (!user?.id) return
    if (appliedCoupon) return
    const hasLegendary = cart.some((p) => String(p?.pet_type || '').toLowerCase() === 'legendary')
    if (!hasLegendary) return
    let cancelled = false
    Promise.resolve()
      .then(async () => {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_user_id', user.id)
          .eq('coupon_code', 'WELCOME-LEGENDARY')
        if (error) return 1
        return Number(count || 0)
      })
      .then((count) => {
        if (cancelled) return
        if (count > 0) return
        const welcome = {
          type: 'local_coupon',
          code: 'WELCOME-LEGENDARY',
          percentOff: 100,
          neonRule: 'any',
          rarityRule: 'legendary_only',
          maxPets: 1,
          maxUses: 1,
          usedCount: 0,
          active: true
        }
        setCouponInput('WELCOME-LEGENDARY')
        setAppliedCoupon(welcome)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [appliedCoupon, authMode, cart, isAuthenticated, user?.id])

  useEffect(() => {
    if (deliveryPassword) return
    const next = String(user?.tradePassword || '')
    if (!next) return
    setDeliveryPassword(next)
  }, [deliveryPassword, user?.tradePassword])

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    const normalized = couponInput.trim().toUpperCase();
    try {
      if (authMode === 'local') {
        const localCoupons = readJson(LOCAL_COUPONS_KEY, [])
        const found = localCoupons.find((c) => String(c?.code || '').toUpperCase() === normalized)
        if (found) {
          if (!found.active) {
            toast.error('Dieser Coupon ist deaktiviert.')
            return
          }
          const used = Number(found.usedCount || 0)
          const max = found.maxUses == null ? null : Number(found.maxUses)
          if (max != null && Number.isFinite(max) && used >= max) {
            toast.error('Dieser Coupon wurde bereits zu oft genutzt.')
            return
          }
          const eligibleCount = cart.filter((p) => isCouponEligibleForPet(found, p)).length
          if (eligibleCount <= 0) {
            toast.error('Dieser Coupon passt nicht zu deinem Warenkorb.')
            return
          }
          setAppliedCoupon({ ...found, type: 'local_coupon' })
          toast.success('🎉 Coupon angewendet!')
        } else if (normalized === 'FREE3') {
          setAppliedCoupon({ code: 'FREE3', type: 'free3' });
          toast.success('🎉 Coupon angewendet! 3 Pets im Warenkorb sind gratis.');
        } else if (normalized === 'PET10') {
          setAppliedCoupon({ code: 'PET10', type: 'free_total' });
          toast.success('🎉 Coupon angewendet! Dein Warenkorb ist gratis.');
        } else {
          toast.error('Ungültiger Couponcode 😢');
        }
      } else if (authMode === 'supabase') {
        if (!supabase) {
          toast.error('Backend ist nicht aktiv.')
          return
        }
        const { data: found, error } = await supabase
          .from('coupons')
          .select('*')
          .eq('code', normalized)
          .eq('active', true)
          .maybeSingle()
        if (error || !found) {
          toast.error('Ungültiger Couponcode 😢')
          return
        }
        const used = Number(found.used_count || 0)
        const max = found.max_uses == null ? null : Number(found.max_uses)
        if (max != null && Number.isFinite(max) && used >= max) {
          toast.error('Dieser Coupon wurde bereits zu oft genutzt.')
          return
        }
        const mapped = {
          id: found.id,
          code: found.code,
          percentOff: Number(found.percent_off || 0),
          neonRule: found.neon_rule || 'any',
          rarityRule: found.rarity_rule || 'any',
          maxPets: found.max_pets == null ? null : Number(found.max_pets),
          maxUses: found.max_uses == null ? null : Number(found.max_uses),
          usedCount: used,
          active: Boolean(found.active),
          type: 'local_coupon'
        }
        const eligibleCount = cart.filter((p) => isCouponEligibleForPet(mapped, p)).length
        if (eligibleCount <= 0) {
          toast.error('Dieser Coupon passt nicht zu deinem Warenkorb.')
          return
        }
        setAppliedCoupon(mapped)
        toast.success('🎉 Coupon angewendet!')
      } else {
        const results = await db.entities.Coupon.filter({ code: normalized, active: true });
        if (results.length > 0) {
          setAppliedCoupon(results[0]);
          toast.success(`🎉 Coupon angewendet! -€${results[0].discount.toFixed(2)} Rabatt`);
        } else {
          toast.error('Ungültiger Couponcode 😢');
        }
      }
    } finally {
      setCouponLoading(false);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: () => db.entities.Order.create({
      pet_ids: cart.map(p => p.id),
      pet_names: cart.map(p => p.name),
      total: finalTotal,
      coupon_code: appliedCoupon?.code || null,
      discount_amount: discount,
      status: isFreeCheckout ? 'processing' : 'awaiting_payment',
      buyer_email: user?.email,
      roblox_username: robloxUsername,
      delivery_password: deliveryPassword || null
    }),
  });

  const appendMessage = (message) => {
    const existing = readJson(LOCAL_MESSAGES_KEY, []);
    writeJson(LOCAL_MESSAGES_KEY, [{ ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString(), readAt: null }, ...existing].slice(0, 500));
  };

  const getUserNameById = (userId) => {
    const users = readJson(LOCAL_USERS_KEY, [])
    const u = users.find((x) => x.id === userId)
    if (!u) return ''
    return u.displayName || (u.email ? String(u.email).split('@')[0] : '') || ''
  }

  const getCurrentUserName = () => {
    return user?.displayName || (user?.email ? String(user.email).split('@')[0] : '') || ''
  }

  const createPayoutsForCart = (existingPets, soldIds, orderId) => {
    const existingPayouts = readJson(LOCAL_PAYOUTS_KEY, []);
    const petsById = new Map(existingPets.map((p) => [p.id, p]));

    const created = [];
    for (const id of soldIds) {
      const pet = petsById.get(id);
      if (!pet) continue;
      const sellerId = pet.seller_id;
      if (!sellerId) continue;
      const amount = Number(pet.price || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      created.push({
        id: crypto.randomUUID(),
        orderId,
        petId: pet.id,
        petName: pet.name || null,
        sellerId,
        sellerEmail: pet.seller_email || null,
        sellerRoblox: pet.seller_roblox || null,
        amount,
        status: 'awaiting_trade',
        createdAt: new Date().toISOString(),
        paidAt: null
      });

      const sellerName = getUserNameById(sellerId)
      appendMessage({
        toUserId: sellerId,
        type: 'sale',
        title: '🎉 Verkauf abgeschlossen',
        text: `Glückwunsch ${sellerName ? sellerName : ''}! Ich bin Hasi 🐰 und helfe dir beim letzten Schritt.\n\n1) Bitte in Adopt Me online sein\n2) Warte auf eine Freundschaftsanfrage auf Roblox vom Bot\n3) Danach kommt eine Trade-Anfrage (meist 5–10 Minuten)\n4) Trade das Pet an den Bot\n\nDanach muss ein Admin den Trade bestätigen – erst dann wird dein Guthaben auf dein Konto gutgeschrieben.`
      });
    }

    if (created.length) {
      writeJson(LOCAL_PAYOUTS_KEY, [...created, ...existingPayouts].slice(0, 1000));
    }
  };

  const debitBuyerWallet = (buyerId, amount) => {
    const delta = Number(amount);
    if (!buyerId) return false;
    if (!Number.isFinite(delta) || delta <= 0) return false;

    const users = readJson(LOCAL_USERS_KEY, []);
    const idx = users.findIndex((u) => u.id === buyerId);
    if (idx === -1) return false;
    const current = Number(users[idx].walletBalance || 0);
    if (current < delta) return false;
    const nextUsers = [...users];
    nextUsers[idx] = { ...nextUsers[idx], walletBalance: current - delta };
    writeJson(LOCAL_USERS_KEY, nextUsers);
    return true;
  };

  const consumeLocalCoupon = (coupon, orderId) => {
    if (!coupon?.code) return
    const code = String(coupon.code).toUpperCase()
    const all = readJson(LOCAL_COUPONS_KEY, [])
    const idx = all.findIndex((c) => String(c?.code || '').toUpperCase() === code)
    if (idx === -1) return
    const current = all[idx]
    const usedOrderIds = Array.isArray(current.usedOrderIds) ? current.usedOrderIds : []
    if (orderId && usedOrderIds.includes(orderId)) return
    const nextUsed = orderId ? [orderId, ...usedOrderIds].slice(0, 500) : usedOrderIds
    const usedCount = Number(current.usedCount || 0) + 1
    const next = [...all]
    next[idx] = { ...current, usedCount, usedOrderIds: nextUsed }
    writeJson(LOCAL_COUPONS_KEY, next)
  }

  const consumeSupabaseCoupon = async (couponId) => {
    if (!supabase || !couponId) return
    const { data, error } = await supabase.from('coupons').select('id,used_count').eq('id', couponId).maybeSingle()
    if (error || !data) return
    const used = Number(data.used_count || 0) + 1
    await supabase.from('coupons').update({ used_count: used }).eq('id', couponId)
  }

  const handlePayPal = async () => {
    if (!robloxUsername.trim()) {
      toast.error('Bitte gib deinen Roblox-Benutzernamen ein!');
      return;
    }
    if (!deliveryPassword) {
      toast.error('Bitte gib dein Passwort ein!');
      return;
    }
    if (authMode === 'local') {
      if (!canPay) {
        toast.error('Nicht genug Guthaben. Bitte Guthaben im Account aufladen.')
        return
      }

      const paymentMethod = isFreeCheckout ? 'coupon' : 'wallet'
      const status = 'processing'

      const orders = readJson(LOCAL_ORDERS_KEY, []);
      const order = {
        id: crypto.randomUUID(),
        pet_ids: cart.map((p) => p.id),
        pet_names: cart.map((p) => p.name),
        total: finalTotal,
        coupon_code: appliedCoupon?.code || null,
        discount_amount: discount,
        status,
        buyer_email: user?.email || null,
        roblox_username: robloxUsername.trim(),
        delivery_password: deliveryPassword,
        payment_method: paymentMethod,
        createdAt: new Date().toISOString()
      };
      writeJson(LOCAL_ORDERS_KEY, [order, ...orders]);
      if (appliedCoupon?.type === 'local_coupon') {
        consumeLocalCoupon(appliedCoupon, order.id)
      }

      const existingPets = readJson(LOCAL_PETS_KEY, []);
      const soldIds = new Set(cart.map((p) => p.id));
      const nextPets = existingPets.map((p) => (soldIds.has(p.id) ? { ...p, status: 'sold' } : p));
      writeJson(LOCAL_PETS_KEY, nextPets);

      setPlacedInfo({
        robloxUsername: robloxUsername.trim(),
        paymentMethod,
        supportEmail: 'support.petvault@gmail.com'
      });

      const buyerName = getCurrentUserName()
      appendMessage({
        toUserId: user?.id,
        type: 'buy',
        title: '✅ Kauf erfolgreich',
        text: `Glückwunsch ${buyerName ? buyerName : ''}! Ich bin Hasi 🐰 und helfe dir beim letzten Schritt.\n\n1) Bitte in Adopt Me online sein\n2) Warte auf eine Freundschaftsanfrage auf Roblox vom Bot\n3) Danach kommt eine Trade-Anfrage (meist 5–10 Minuten)\n\nDann bekommst du deine Pets im Trade ✅`
      });

      createPayoutsForCart(existingPets, soldIds, order.id);
      if (paymentMethod === 'wallet') {
        const ok = debitBuyerWallet(user?.id, finalTotal);
        if (!ok) {
          toast.error('Guthaben reicht nicht aus.')
          return
        }
        await refreshLocalUser?.()
      }

      clearCart();
      setOrderPlaced(true);

      toast.success('✅ Bestellung abgeschlossen!');
      return;
    }

    if (authMode === 'supabase') {
      if (!supabase) {
        toast.error('Backend ist nicht aktiv.')
        return
      }
      if (!canPay) {
        toast.error('Nicht genug Guthaben. Bitte Guthaben im Account aufladen.')
        return
      }
      const buyerId = user?.id
      const buyerEmail = String(user?.email || '').trim().toLowerCase()
      if (!buyerId || !buyerEmail) {
        toast.error('Nicht angemeldet.')
        return
      }
      const paymentMethod = isFreeCheckout ? 'coupon' : 'wallet'
      const status = 'processing'
      const orderId = crypto.randomUUID()

      try {
        const { data: prof, error: profErr } = await supabase.from('profiles').select('user_id,wallet_balance').eq('user_id', buyerId).maybeSingle()
        if (profErr || !prof) throw new Error('Profil nicht gefunden.')
        if (paymentMethod === 'wallet') {
          const currentBalance = Number(prof.wallet_balance || 0)
          if (currentBalance < finalTotal) throw new Error('Guthaben reicht nicht aus.')
          const { error: balErr } = await supabase.from('profiles').update({ wallet_balance: currentBalance - finalTotal }).eq('user_id', buyerId)
          if (balErr) throw new Error('Guthaben konnte nicht belastet werden.')
          await refreshLocalUser?.()
        }

        const { error: orderErr } = await supabase.from('orders').insert({
          id: orderId,
          buyer_user_id: buyerId,
          buyer_email: buyerEmail,
          pet_ids: cart.map((p) => p.id),
          pet_names: cart.map((p) => p.name),
          total: finalTotal,
          coupon_code: appliedCoupon?.code || null,
          discount_amount: discount,
          status,
          roblox_username: robloxUsername.trim(),
          delivery_password: deliveryPassword,
          payment_method: paymentMethod
        })
        if (orderErr) throw new Error('Bestellung konnte nicht gespeichert werden.')

        if (appliedCoupon?.type === 'local_coupon' && appliedCoupon?.id) {
          await consumeSupabaseCoupon(appliedCoupon.id)
        }

        const ids = cart.map((p) => p.id)
        if (ids.length) {
          await supabase.from('pets').update({ status: 'sold' }).in('id', ids)
        }

        const payoutRows = cart
          .map((p) => {
            const sellerUserId = p.seller_user_id || null
            const amount = Number(p.price || 0)
            if (!sellerUserId) return null
            if (!Number.isFinite(amount) || amount <= 0) return null
            return {
              order_id: orderId,
              pet_id: p.id,
              pet_name: p.name || null,
              seller_user_id: sellerUserId,
              seller_email: p.seller_email || null,
              seller_roblox: p.seller_roblox || null,
              amount,
              status: 'awaiting_trade'
            }
          })
          .filter(Boolean)

        if (payoutRows.length) {
          const { error: payoutErr } = await supabase.from('payouts').insert(payoutRows)
          if (!payoutErr) {
            for (const pr of payoutRows) {
              await supabase.from('messages').insert({
                to_user_id: pr.seller_user_id,
                type: 'sale',
                title: '🎉 Verkauf abgeschlossen',
                text: `Glückwunsch! Ich bin Hasi 🐰 und helfe dir beim letzten Schritt.\n\n1) Bitte in Adopt Me online sein\n2) Warte auf eine Freundschaftsanfrage auf Roblox vom Bot\n3) Danach kommt eine Trade-Anfrage (meist 5–10 Minuten)\n4) Trade das Pet an den Bot\n\nDanach muss ein Admin den Trade bestätigen – erst dann wird dein Guthaben auf dein Konto gutgeschrieben.`
              })
            }
          }
        }

        const buyerName = getCurrentUserName()
        await supabase.from('messages').insert({
          to_user_id: buyerId,
          type: 'buy',
          title: '✅ Kauf erfolgreich',
          text: `Glückwunsch ${buyerName ? buyerName : ''}! Ich bin Hasi 🐰 und helfe dir beim letzten Schritt.\n\n1) Bitte in Adopt Me online sein\n2) Warte auf eine Freundschaftsanfrage auf Roblox vom Bot\n3) Danach kommt eine Trade-Anfrage (meist 5–10 Minuten)\n\nDann bekommst du deine Pets im Trade ✅`
        })

        setPlacedInfo({
          robloxUsername: robloxUsername.trim(),
          paymentMethod,
          supportEmail: 'support.petvault@gmail.com'
        })
        clearCart()
        setOrderPlaced(true)
        toast.success('✅ Bestellung abgeschlossen!')
        return
      } catch (e) {
        toast.error(e?.message || 'Bestellung fehlgeschlagen.')
        return
      }
    }

    toast.error('Zahlung ist nur mit Guthaben verfügbar.')
  };

  const openLogin = () => {
    const redirectPath = '/checkout'
    window.location.hash = `#/login?redirect=${encodeURIComponent(redirectPath)}`
  }

  if (orderPlaced) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-24 h-24 bg-green-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-14 h-14 text-green-500" />
          </div>
          <h2 className="font-heading text-3xl text-foreground mb-2">Bestellung aufgegeben! 🎉</h2>
          {placedInfo?.paymentMethod ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-start gap-3 p-3 rounded-2xl border-2 border-primary/20 bg-primary/5 text-left"
              >
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-2xl leading-none"
                >
                  🐰
                </motion.div>
                <div className="text-sm">
                  <div className="font-bold text-foreground">
                    {placedInfo.paymentMethod === 'coupon' ? 'Gratis per Coupon ✅' : 'Mit Guthaben bezahlt ✅'}
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                    Lieferung innerhalb von 30 Minuten. Bei Fragen: {placedInfo.supportEmail}
                  </div>
                </div>
              </motion.div>
              <p className="text-muted-foreground font-semibold leading-relaxed mt-3">
                Wir liefern dein Pet an <strong>@{placedInfo.robloxUsername}</strong>.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground font-semibold leading-relaxed">Bestellung wird verarbeitet.</p>
          )}
          <Button className="mt-8 rounded-2xl font-bold px-8" onClick={() => navigate('/marketplace')}>
            Weiter shoppen 🛒
          </Button>
        </motion.div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <ShoppingCart className="w-12 h-12 text-primary" />
          </div>
          <h2 className="font-heading text-3xl text-foreground mb-2">Warenkorb ist leer!</h2>
          <p className="text-muted-foreground font-semibold">Füge Pets hinzu und komm zurück 🐾</p>
          <Button className="mt-8 rounded-2xl font-bold px-8" onClick={() => navigate('/marketplace')}>
            Zum Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-heading text-4xl text-foreground mb-8">🛒 Warenkorb</h1>

      {!isLoadingAuth && !isAuthenticated ? (
        <Card className="mb-6 p-4 border-2 border-primary/20 bg-primary/5 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="font-bold text-foreground">Du bist nicht angemeldet.</div>
            <div className="text-sm text-muted-foreground font-semibold sm:ml-auto">
              Du kannst den Warenkorb sehen, aber zum Bezahlen musst du dich anmelden.
            </div>
          </div>
          <Button className="mt-3 rounded-2xl font-bold" onClick={openLogin}>
            Anmelden
          </Button>
        </Card>
      ) : null}

      <div className="grid md:grid-cols-5 gap-6">
        {/* Cart items */}
        <div className="md:col-span-3 space-y-3">
          {cart.map((pet) => (
            <motion.div key={pet.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="flex items-center gap-4 p-4 border-2 border-border rounded-2xl bg-white">
                <img
                  src={pet.image_url || 'https://images.unsplash.com/photo-1535930749574-1399327ce78f?w=200&h=200&fit=crop'}
                  alt={pet.name}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-border"
                />
                <div className="flex-1">
                  <p className="font-heading text-lg">{pet.name}</p>
                  <p className="text-xs text-muted-foreground font-semibold capitalize">{pet.age?.replace('_', ' ')}</p>
                </div>
                <p className="font-heading text-xl text-primary">€{pet.price?.toFixed(2)}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive rounded-xl"
                  onClick={() => removeFromCart(pet.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <div className="md:col-span-2 space-y-4">
          <Card className="p-5 border-2 border-border rounded-2xl bg-white space-y-4">
            <h2 className="font-heading text-xl">Zusammenfassung</h2>

            <div className="space-y-2 text-sm font-semibold">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zwischensumme</span>
                <span>€{total.toFixed(2)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-green-600">
                  <span>Rabatt ({appliedCoupon.code})</span>
                  <span>-€{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t-2 border-border pt-2 flex justify-between font-bold text-base">
                <span>Gesamt</span>
                <span className="text-primary font-heading text-xl">€{finalTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Coupon */}
            {!appliedCoupon ? (
              <div className="space-y-2">
                <Label className="font-bold flex items-center gap-1"><Tag className="w-4 h-4" /> Couponcode</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Code eingeben..."
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    className="rounded-xl border-2 font-bold uppercase"
                    onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                  />
                  <Button variant="outline" className="rounded-xl border-2 font-bold" onClick={applyCoupon} disabled={couponLoading}>
                    {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'OK'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border-2 border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="font-bold text-green-700 text-sm">Coupon "{appliedCoupon.code}" aktiv!</span>
                <button className="ml-auto text-xs text-muted-foreground underline" onClick={() => setAppliedCoupon(null)}>Entfernen</button>
              </div>
            )}

            {authMode === 'local' || authMode === 'supabase' ? (
              <div className="p-3 rounded-2xl border-2 border-slate-200 bg-slate-50">
                <div className="font-bold text-foreground">Zahlung</div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                  Du bezahlst immer mit Guthaben. Verfügbar: €{walletBalance.toFixed(2)} • Benötigt: €{finalTotal.toFixed(2)}
                </div>
                {!canPay && finalTotal > 0 ? (
                  <div className="text-xs text-amber-700 font-bold mt-1">
                    Guthaben reicht nicht aus. Geh zu Account → Guthaben und löse einen Code ein.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-3 rounded-2xl border-2 border-slate-200 bg-slate-50">
                <div className="font-bold text-foreground">Zahlung</div>
                <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                  Zahlung ist nur mit Guthaben verfügbar.
                </div>
              </div>
            )}

            {/* Roblox Username */}
            <div className="space-y-2">
              <Label className="font-bold">🎮 Roblox Username</Label>
              <Input
                placeholder="Dein Roblox Name"
                value={robloxUsername}
                onChange={(e) => setRobloxUsername(e.target.value)}
                className="rounded-xl border-2 font-bold"
              />
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-3 rounded-2xl border-2 border-primary/20 bg-primary/5"
              >
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-2xl leading-none"
                >
                  🐰
                </motion.div>
                <div className="text-sm">
                  <div className="font-bold text-foreground">Wichtig!</div>
                  <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                    Bitte deinen Roblox Username ganz genau so eingeben wie in Roblox, damit die Lieferung klappt ✅
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">🔐 Passwort</Label>
              <Input
                type="password"
                placeholder="Passwort eingeben..."
                value={deliveryPassword}
                onChange={(e) => setDeliveryPassword(e.target.value)}
                className="rounded-xl border-2 font-bold"
              />
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-3 rounded-2xl border-2 border-amber-200 bg-amber-50"
              >
                <motion.div
                  animate={{ rotate: [-2, 2, -2] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-2xl leading-none"
                >
                  🐰
                </motion.div>
                <div className="text-sm">
                  <div className="font-bold text-foreground">Bitte richtig eingeben!</div>
                  <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                    Bitte exakt eingeben – das ist wichtig, damit der Kauf/Abgleich problemlos klappt ✅
                  </div>
                </div>
              </motion.div>
            </div>

            {/* PayPal Button */}
            <Button
              className="w-full h-12 rounded-2xl font-bold text-base gap-2 text-white shadow-lg bg-primary hover:bg-primary/90 shadow-primary/25"
              onClick={handlePayPal}
              disabled={createOrderMutation.isPending || !canPay || !isAuthenticated}
            >
              {createOrderMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isFreeCheckout ? '✅ Gratis bestellen' : '✅ Mit Guthaben zahlen'}
                </>
              )}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
