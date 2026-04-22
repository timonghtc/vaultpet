import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, Star, Store, TrendingUp, PawPrint } from 'lucide-react';
import { motion } from 'framer-motion';
import PetCard from '@/components/pets/PetCard';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };
const LOCAL_PETS_KEY = 'local_pets';
const LOCAL_SELL_REQUESTS_KEY = 'local_sell_requests';

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const features = [
  { icon: Shield, title: 'Sicher & Geschützt', desc: 'Jede Transaktion ist durch unser System abgesichert.', color: 'bg-teal-100 text-teal-600' },
  { icon: Zap, title: 'Schnelle Lieferung', desc: 'Pets werden schnell und zuverlässig geliefert.', color: 'bg-orange-100 text-orange-500' },
  { icon: Star, title: 'Faire Preise', desc: 'Die besten Preise für Adopt Me Pets — immer fair!', color: 'bg-pink-100 text-pink-600' },
];

export default function Home() {
  const { authMode } = useAuth();
  const isSupabase = authMode === 'supabase'
  const { data: featuredPets = [] } = useQuery({
    queryKey: ['featured-pets', authMode],
    queryFn: async () => {
      if (authMode === 'local') {
        const localPets = readJson(LOCAL_PETS_KEY, []);
        return localPets.filter((p) => (p.status || 'available') === 'available').slice(0, 8);
      }
      if (authMode === 'supabase') {
        if (!supabase) return []
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .in('status', ['available', 'approved'])
          .order('created_at', { ascending: false })
          .limit(8)
        if (error) return []
        return data || []
      }
      return db.entities.Pet.filter({ status: 'available' }, '-created_date', 8);
    },
  });

  const { data: activePetsCountSupabase = null } = useQuery({
    queryKey: ['active-pets-count', authMode],
    enabled: isSupabase && !!supabase,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['available', 'approved'])
      if (error) return 0
      return Number(count || 0)
    }
  })

  const liveSellerCount = useMemo(() => {
    if (authMode !== 'local') return null;
    const sellRequests = readJson(LOCAL_SELL_REQUESTS_KEY, []);
    const pets = readJson(LOCAL_PETS_KEY, []);
    const ids = new Set();
    for (const r of sellRequests) {
      if (r?.seller_id) ids.add(r.seller_id);
      else if (r?.seller_email) ids.add(`email:${r.seller_email}`);
    }
    for (const p of pets) {
      if (p?.seller_id) ids.add(p.seller_id);
      else if (p?.seller_email) ids.add(`email:${p.seller_email}`);
    }
    return ids.size;
  }, [authMode]);

  const activePetsCount = useMemo(() => {
    if (authMode === 'supabase') return Number(activePetsCountSupabase ?? 0)
    if (authMode !== 'local') return null;
    const pets = readJson(LOCAL_PETS_KEY, []);
    return pets.filter((p) => (p.status || 'available') === 'available').length;
  }, [activePetsCountSupabase, authMode]);

  const stats = useMemo(() => {
    const petsValue = activePetsCount == null ? '0' : `${activePetsCount}`;
    return [
      { label: 'Pets verkauft', value: '250+', emoji: '🐾' },
      { label: 'Aktive Pets', value: petsValue, emoji: '🛒' },
      { label: 'Zufrieden', value: '97%', emoji: '⭐' }
    ];
  }, [activePetsCount]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-cyan-50 via-teal-50 to-pink-50">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-primary/15 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-accent/15 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-orange-300/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border-2 border-primary/30 text-primary text-sm font-bold mb-6 shadow-md">
              <PawPrint className="w-4 h-4" />
              #1 Adopt Me Marketplace 🐾
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl md:text-7xl text-foreground leading-tight">
              Kaufe & Verkaufe
              <br />
              <span className="text-primary">Adopt Me Pets!</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed font-semibold">
              Der sicherste Ort für Roblox Adopt Me Pets – schnell, fair und transparent. 🦄✨
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/marketplace" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 px-8 font-bold text-base rounded-2xl h-13 shadow-lg shadow-primary/30 text-lg py-6 bg-primary hover:bg-primary/90">
                  <Store className="w-5 h-5" />
                  Zum Marketplace!
                </Button>
              </Link>
              <Link to="/sell" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 px-8 font-bold text-base rounded-2xl h-13 text-lg py-6 bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/30">
                  <TrendingUp className="w-5 h-5" />
                  Pet verkaufen
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-12 sm:mt-16 flex flex-wrap justify-center gap-4 sm:gap-6 md:gap-16 px-2"
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="text-center bg-white/70 rounded-2xl px-5 py-4 shadow-sm border border-white w-[160px] sm:w-[190px]"
              >
                <div className="text-2xl mb-1">{s.emoji}</div>
                <div className="font-heading text-2xl md:text-3xl text-primary">{s.value}</div>
                <div className="text-sm text-muted-foreground font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-6 rounded-3xl border-2 border-border bg-white shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className={`w-12 h-12 rounded-2xl ${f.color} flex items-center justify-center mb-4`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-xl text-foreground">{f.title}</h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Pets */}
      {featuredPets.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-heading text-3xl text-foreground">✨ Neue Pets</h2>
              <p className="text-muted-foreground font-semibold mt-1">Frisch eingestellt!</p>
            </div>
            <Link to="/marketplace">
              <Button variant="ghost" className="gap-2 text-primary font-bold hover:text-primary rounded-xl">
                Alle ansehen <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {featuredPets.slice(0, 8).map((pet) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
        </section>
      )}

      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-white rounded-3xl p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
              🎁 Bonus für Neukunden
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="font-heading text-2xl sm:text-3xl text-slate-900">1x Legendary Pet gratis</div>
                <div className="text-slate-700 font-semibold mt-1">
                  Registriere dich und wähle im Marketplace 1 Legendary Pet gratis nach deiner Wahl (nur 1x pro neues Konto).
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/register?redirect=%2Fmarketplace">
                  <Button className="rounded-2xl font-bold gap-2">
                    Konto erstellen
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/marketplace">
                  <Button variant="outline" className="rounded-2xl font-bold">
                    Marketplace
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-border bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <PawPrint className="w-5 h-5 text-primary" />
            <span className="font-heading text-xl text-primary">PetVault</span>
          </div>
          <p className="text-sm text-muted-foreground font-semibold">© 2026 PetVault — Der #1 Adopt Me Pet Marketplace 🐾</p>
        </div>
      </footer>
    </div>
  );
}
