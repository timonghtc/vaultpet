import React, { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import PetCard from '@/components/pets/PetCard';
import PetFilters from '@/components/pets/PetFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { PackageOpen } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient'
import { Button } from '@/components/ui/button'

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };
const LOCAL_PETS_KEY = 'local_pets';

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export default function Marketplace() {
  const { authMode, user, isAuthenticated } = useAuth();
  const [filters, setFilters] = useState({
    search: '',
    rarity: 'all',
    neon: 'all',
    category: 'all',
    sort: 'newest',
  });
  const [showWelcome, setShowWelcome] = useState(false)

  const { data: pets = [], isLoading: petsLoading } = useQuery({
    queryKey: ['marketplace-pets', authMode],
    queryFn: async () => {
      if (authMode === 'local') {
        const localPets = readJson(LOCAL_PETS_KEY, []);
        return localPets.filter((p) => (p.status || 'available') === 'available').slice(0, 100);
      }
      if (authMode === 'supabase') {
        if (!supabase) return []
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .in('status', ['available', 'approved'])
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) return []
        return data || []
      }
      return db.entities.Pet.filter({ status: 'available' }, '-created_date', 100);
    },
  });

  const isLoading = petsLoading;

  const { data: welcomeUsedCount = 0 } = useQuery({
    queryKey: ['welcome-used', authMode, user?.id],
    enabled: authMode === 'supabase' && isAuthenticated && !!supabase && !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_user_id', user.id)
        .eq('coupon_code', 'WELCOME-LEGENDARY')
      if (error) return 0
      return Number(count || 0)
    }
  })

  useEffect(() => {
    if (authMode !== 'supabase') return
    if (!isAuthenticated) return
    if (welcomeUsedCount > 0) return
    const flag = window.localStorage.getItem('pv_just_registered')
    if (flag !== '1') return
    window.localStorage.removeItem('pv_just_registered')
    setFilters((p) => ({ ...p, rarity: 'legendary', search: '', sort: 'newest' }))
    setShowWelcome(true)
  }, [authMode, isAuthenticated, welcomeUsedCount])

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of pets) {
      if (p?.category) set.add(String(p.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pets]);

  const filteredPets = useMemo(() => {
    let result = [...pets];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (filters.rarity !== 'all') result = result.filter((p) => p.pet_type === filters.rarity);
    if (filters.neon !== 'all') result = result.filter((p) => (p.neon || 'normal') === filters.neon);
    if (filters.category !== 'all') result = result.filter((p) => String(p.category || '') === filters.category);
    if (filters.sort === 'price_low') result.sort((a, b) => a.price - b.price);
    else if (filters.sort === 'price_high') result.sort((a, b) => b.price - a.price);
    return result;
  }, [pets, filters]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-heading text-4xl text-foreground">🛒 Marketplace</h1>
        <p className="text-muted-foreground font-semibold mt-1">
          {filteredPets.length} Pets verfügbar
        </p>
      </div>

      {authMode === 'supabase' && isAuthenticated && welcomeUsedCount === 0 ? (
        <div className="mb-6 border-2 border-amber-200 bg-amber-50 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="font-bold text-slate-900">
              🎁 Bonus für Neukunden: 1x Legendary Pet gratis (egal welcher Preis)
            </div>
            <div className="text-sm text-slate-700 font-semibold sm:ml-auto">
              Wähle ein Legendary aus und geh dann zum Warenkorb.
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="rounded-2xl font-bold"
              onClick={() => setFilters((p) => ({ ...p, rarity: 'legendary', search: '' }))}
            >
              Legendary anzeigen
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl font-bold"
              onClick={() => setShowWelcome(true)}
            >
              Wie funktioniert’s?
            </Button>
          </div>
        </div>
      ) : null}

      <PetFilters filters={filters} categories={categories} onFilterChange={setFilters} />

      {showWelcome ? (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6">
            <div className="font-heading text-2xl text-slate-900">👋 Hey! Ich bin Hasi</div>
            <div className="text-sm text-slate-700 font-semibold mt-2 leading-relaxed">
              Willkommensgeschenk: Such dir 1 Legendary Pet aus. Im Warenkorb wird es automatisch gratis gemacht.
              Du kannst zusätzlich weitere Pets auswählen – die bezahlst du normal.
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="rounded-2xl font-bold" onClick={() => setShowWelcome(false)}>
                Alles klar
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl font-bold"
                onClick={() => {
                  setFilters((p) => ({ ...p, rarity: 'legendary', search: '' }))
                  setShowWelcome(false)
                }}
              >
                Legendary wählen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden">
                <Skeleton className="aspect-square" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-6 w-1/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPets.length === 0 ? (
          <div className="text-center py-20">
            <PackageOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading text-2xl">Keine Pets gefunden 😢</h3>
            <p className="text-muted-foreground font-semibold text-sm mt-1">Versuche andere Filter!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {filteredPets.map((pet) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
