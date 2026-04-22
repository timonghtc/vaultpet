import React, { useMemo, useState } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, PackageOpen, Loader2, Plane, Bike } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import RarityBadge from '@/components/pets/RarityBadge';
import NeonBadge from '@/components/pets/NeonBadge';
import LoginPrompt from '@/components/auth/LoginPrompt';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient'

const db =
  globalThis.__B44_DB__ ||
  {
    auth: { isAuthenticated: async () => false, me: async () => null },
    entities: new Proxy(
      {},
      {
        get: () => ({
          filter: async () => [],
          get: async () => null,
          create: async () => ({}),
          update: async () => ({}),
          delete: async () => ({})
        })
      }
    ),
    integrations: { Core: { UploadFile: async () => ({ file_url: '' }) } }
  };

const SELL_REQUESTS_KEY = 'local_sell_requests';
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

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

const formatDate = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

export default function MyPets() {
  const queryClient = useQueryClient();
  const { authMode, user, isAuthenticated, isLoadingAuth } = useAuth();
  const [tab, setTab] = useState('requests');
  const [legacyTab, setLegacyTab] = useState('available');
  const [refreshKey, setRefreshKey] = useState(0);
  const isLocal = authMode === 'local';
  const isSupabase = authMode === 'supabase'
  const isBase44 = authMode !== 'local' && authMode !== 'supabase'

  const allRequests = useMemo(() => (isLocal ? readJson(SELL_REQUESTS_KEY, []) : []), [isLocal, refreshKey]);
  const allPetsLocal = useMemo(() => (isLocal ? readJson(LOCAL_PETS_KEY, []) : []), [isLocal, refreshKey]);

  const myRequests = useMemo(() => {
    if (!isLocal) return [];
    const mine = allRequests.filter((r) => r?.seller_id && r.seller_id === user?.id);
    mine.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return mine;
  }, [allRequests, isLocal, user?.id]);

  const myPetsLocal = useMemo(() => {
    if (!isLocal) return [];
    const mine = allPetsLocal.filter((p) => p?.seller_id === user?.id || p?.seller_email === user?.email);
    mine.sort((a, b) => String(b.created_date || b.createdAt || '').localeCompare(String(a.created_date || a.createdAt || '')));
    return mine;
  }, [allPetsLocal, isLocal, user?.email, user?.id]);

  const pendingCount = useMemo(() => myRequests.filter((r) => r.status === 'pending').length, [myRequests]);
  const approvedCount = useMemo(() => myRequests.filter((r) => r.status === 'approved').length, [myRequests]);
  const rejectedCount = useMemo(() => myRequests.filter((r) => r.status === 'rejected').length, [myRequests]);
  const availableCount = useMemo(() => myPetsLocal.filter((p) => (p.status || 'available') === 'available').length, [myPetsLocal]);
  const soldCount = useMemo(() => myPetsLocal.filter((p) => p.status === 'sold').length, [myPetsLocal]);

  const filteredLocalPets = useMemo(() => {
    if (!isLocal) return [];
    return myPetsLocal.filter((p) => {
      const status = p.status || 'available';
      if (tab === 'available') return status === 'available';
      if (tab === 'sold') return status === 'sold';
      return true;
    });
  }, [isLocal, myPetsLocal, tab]);

  const { data: baseUserBase44, isLoading: userLoadingBase44 } = useQuery({
    queryKey: ['me', authMode],
    queryFn: () => db.auth.me(),
    enabled: isBase44
  })

  const baseUser = isSupabase ? user : baseUserBase44
  const userLoading = isSupabase ? isLoadingAuth : userLoadingBase44

  const { data: myPets = [], isLoading: petsLoading } = useQuery({
    queryKey: ['my-pets', authMode, baseUser?.id, baseUser?.email],
    queryFn: async () => {
      if (isSupabase) {
        if (!supabase || !baseUser?.id) return []
        const { data, error } = await supabase
          .from('pets')
          .select('*')
          .eq('seller_user_id', baseUser.id)
          .order('created_at', { ascending: false })
          .limit(200)
        if (error) return []
        return data || []
      }
      return db.entities.Pet.filter({ created_by: baseUser.email }, '-created_date', 100)
    },
    enabled: !isLocal && (isSupabase ? Boolean(baseUser?.id) : Boolean(baseUser?.email))
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (isSupabase) {
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        const { error } = await supabase.from('pets').delete().eq('id', id)
        if (error) throw new Error('Pet konnte nicht gelöscht werden.')
        return true
      }
      return db.entities.Pet.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] });
      toast.success('Pet gelöscht!');
    }
  });

  const markSoldMutation = useMutation({
    mutationFn: async (id) => {
      if (isSupabase) {
        if (!supabase) throw new Error('Backend ist nicht aktiv.')
        const { error } = await supabase.from('pets').update({ status: 'sold' }).eq('id', id)
        if (error) throw new Error('Pet konnte nicht aktualisiert werden.')
        return true
      }
      return db.entities.Pet.update(id, { status: 'sold' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] });
      toast.success('Pet als verkauft markiert! 🎉');
    }
  });

  const placeholderImg = `https://images.unsplash.com/photo-1535930749574-1399327ce78f?w=200&h=200&fit=crop`;

  if (isLocal) {
    if (!isLoadingAuth && !isAuthenticated) {
      return <LoginPrompt message="Melde dich an, um deine Verkäufe zu sehen! 🐾" />;
    }

    const withdrawRequest = (requestId) => {
      const existing = readJson(SELL_REQUESTS_KEY, []);
      const req = existing.find((r) => r.id === requestId);
      if (!req) {
        toast.error('Anfrage nicht gefunden.');
        return;
      }
      if (req.seller_id !== user?.id) {
        toast.error('Nicht erlaubt.');
        return;
      }
      if (req.status !== 'pending') {
        toast.error('Nur offene Anfragen können zurückgezogen werden.');
        return;
      }
      writeJson(
        SELL_REQUESTS_KEY,
        existing.filter((r) => r.id !== requestId)
      );
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ['sell-requests'] });
      toast.success('Anfrage zurückgezogen.');
    };

    const updateLocalPet = (id, patch) => {
      const existing = readJson(LOCAL_PETS_KEY, []);
      const next = existing.map((p) => (p.id === id ? { ...p, ...patch } : p));
      writeJson(LOCAL_PETS_KEY, next);
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] });
      queryClient.invalidateQueries({ queryKey: ['featured-pets'] });
    };

    const deleteLocalPet = (id) => {
      const existing = readJson(LOCAL_PETS_KEY, []);
      const pet = existing.find((p) => p.id === id);
      if (!pet) {
        toast.error('Pet nicht gefunden.');
        return;
      }
      if (!(pet.seller_id === user?.id || pet.seller_email === user?.email)) {
        toast.error('Nicht erlaubt.');
        return;
      }
      writeJson(
        LOCAL_PETS_KEY,
        existing.filter((p) => p.id !== id)
      );
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ['marketplace-pets'] });
      queryClient.invalidateQueries({ queryKey: ['featured-pets'] });
      toast.success('Pet entfernt.');
    };

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-heading text-4xl text-foreground">🧾 Meine Verkäufe</h1>
          <p className="text-muted-foreground font-semibold mt-1">Anfragen, Genehmigung und deine Listings</p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mb-6">
          <TabsList className="bg-secondary rounded-2xl p-1 grid grid-cols-3 gap-1 w-full">
            <TabsTrigger value="requests" className="rounded-xl font-bold text-xs sm:text-sm">
              📩 Anfragen ({myRequests.length})
            </TabsTrigger>
            <TabsTrigger value="available" className="rounded-xl font-bold text-xs sm:text-sm">
              ✅ Zum Verkauf ({availableCount})
            </TabsTrigger>
            <TabsTrigger value="sold" className="rounded-xl font-bold text-xs sm:text-sm">
              💸 Verkauft ({soldCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'requests' ? (
          myRequests.length === 0 ? (
            <div className="text-center py-20">
              <PackageOpen className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-2xl">Keine Anfragen 😢</h3>
              <p className="text-muted-foreground font-semibold text-sm mt-1">Wenn du etwas einstellst, landet es hier zur Genehmigung.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {myRequests.map((r) => {
                  const status = r.status || 'pending';
                  const badgeClass =
                    status === 'approved'
                      ? 'text-emerald-700 border-emerald-300 font-bold'
                      : status === 'rejected'
                        ? 'text-destructive border-destructive/40 font-bold'
                        : 'text-amber-700 border-amber-300 font-bold';
                  const badgeText =
                    status === 'approved' ? '✅ Genehmigt' : status === 'rejected' ? '⛔ Abgelehnt' : '⏳ Wartet';
                  return (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <Card className="flex items-center gap-4 p-4 border-2 border-border bg-white hover:border-primary/30 hover:shadow-md transition-all rounded-2xl">
                        <img
                          src={r.image_url || placeholderImg}
                          alt={r.name}
                          className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border-2 border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-heading text-lg truncate">{r.name}</h3>
                            <RarityBadge rarity={r.pet_type} />
                            <NeonBadge neon={r.neon || 'normal'} />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-semibold">
                            {r.flyable && <span className="flex items-center gap-1"><Plane className="w-3 h-3 text-sky-500" /> Fly</span>}
                            {r.rideable && <span className="flex items-center gap-1"><Bike className="w-3 h-3 text-emerald-500" /> Ride</span>}
                            <span className="capitalize">{String(r.age || '').replace('_', ' ') || 'Full Grown'}</span>
                            <span>•</span>
                            <span>{formatDate(r.createdAt)}</span>
                          </div>
                          {status === 'approved' ? (
                            <div className="text-xs text-muted-foreground font-semibold mt-1">
                              Freigegeben: {formatDate(r.approvedAt)}
                            </div>
                          ) : null}
                          {status === 'rejected' ? (
                            <div className="text-xs text-muted-foreground font-semibold mt-1">
                              Abgelehnt: {formatDate(r.rejectedAt)}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-heading text-xl text-primary">€{Number(r.price || 0).toFixed(2)}</p>
                          <Badge variant="outline" className={`mt-1 ${badgeClass}`}>{badgeText}</Badge>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {status === 'pending' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs rounded-xl border-2 font-bold"
                              onClick={() => withdrawRequest(r.id)}
                            >
                              Zurückziehen
                            </Button>
                          ) : null}
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        ) : filteredLocalPets.length === 0 ? (
          <div className="text-center py-20">
            <PackageOpen className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading text-2xl">Keine Pets hier 😢</h3>
            <p className="text-muted-foreground font-semibold text-sm mt-1">Sobald ein Admin deine Anfrage genehmigt, erscheint das Pet hier.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredLocalPets.map((pet) => {
                const status = pet.status || 'available';
                return (
                  <motion.div key={pet.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <Card className="flex items-center gap-4 p-4 border-2 border-border bg-white hover:border-primary/30 hover:shadow-md transition-all rounded-2xl">
                      <img
                        src={pet.image_url || placeholderImg}
                        alt={pet.name}
                        className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border-2 border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-heading text-lg truncate">{pet.name}</h3>
                          <RarityBadge rarity={pet.pet_type} />
                          <NeonBadge neon={pet.neon || 'normal'} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-semibold">
                          {pet.flyable && <span className="flex items-center gap-1"><Plane className="w-3 h-3 text-sky-500" /> Fly</span>}
                          {pet.rideable && <span className="flex items-center gap-1"><Bike className="w-3 h-3 text-emerald-500" /> Ride</span>}
                          <span className="capitalize">{String(pet.age || '').replace('_', ' ') || 'Full Grown'}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-heading text-xl text-primary">€{Number(pet.price || 0).toFixed(2)}</p>
                        <Badge
                          variant="outline"
                          className={
                            status === 'sold'
                              ? 'text-destructive border-destructive/40 font-bold mt-1'
                              : 'text-emerald-600 border-emerald-300 font-bold mt-1'
                          }
                        >
                          {status === 'sold' ? '💸 Verkauft' : '✅ Verfügbar'}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {status === 'available' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs rounded-xl border-2 font-bold"
                            onClick={() => updateLocalPet(pet.id, { status: 'sold' })}
                          >
                            Verkauft ✅
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl h-8 w-8"
                          onClick={() => deleteLocalPet(pet.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  if (!userLoading && !baseUser) {
    return <LoginPrompt message="Melde dich an, um deine Pets zu verwalten! 🐾" />;
  }

  const filteredPets = myPets.filter((p) => {
    if (legacyTab === 'available') return p.status === 'available';
    if (legacyTab === 'sold') return p.status === 'sold';
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-heading text-4xl text-foreground">🐾 Meine Pets</h1>
        <p className="text-muted-foreground font-semibold mt-1">Verwalte deine eingestellten Pets</p>
      </div>

      <Tabs value={legacyTab} onValueChange={setLegacyTab} className="mb-6">
        <TabsList className="bg-secondary rounded-2xl p-1">
          <TabsTrigger value="available" className="rounded-xl font-bold">✅ Verfügbar ({myPets.filter((p) => p.status === 'available').length})</TabsTrigger>
          <TabsTrigger value="sold" className="rounded-xl font-bold">💸 Verkauft ({myPets.filter((p) => p.status === 'sold').length})</TabsTrigger>
          <TabsTrigger value="all" className="rounded-xl font-bold">🐾 Alle ({myPets.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {petsLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : filteredPets.length === 0 ? (
        <div className="text-center py-20">
          <PackageOpen className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-heading text-2xl">Keine Pets hier 😢</h3>
          <p className="text-muted-foreground font-semibold text-sm mt-1">Du hast noch keine Pets eingestellt.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredPets.map((pet) => (
              <motion.div key={pet.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="flex items-center gap-4 p-4 border-2 border-border bg-white hover:border-primary/30 hover:shadow-md transition-all rounded-2xl">
                  <img
                    src={pet.image_url || placeholderImg}
                    alt={pet.name}
                    className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border-2 border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading text-lg truncate">{pet.name}</h3>
                      <RarityBadge rarity={pet.pet_type} />
                      <NeonBadge neon={pet.neon || 'normal'} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-semibold">
                      {pet.flyable && <span className="flex items-center gap-1"><Plane className="w-3 h-3 text-sky-500" /> Fly</span>}
                      {pet.rideable && <span className="flex items-center gap-1"><Bike className="w-3 h-3 text-emerald-500" /> Ride</span>}
                      <span className="capitalize">{pet.age?.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-heading text-xl text-primary">€{pet.price?.toFixed(2)}</p>
                    <Badge
                      variant="outline"
                      className={
                        pet.status === 'sold'
                          ? 'text-destructive border-destructive/40 font-bold mt-1'
                          : 'text-emerald-600 border-emerald-300 font-bold mt-1'
                      }
                    >
                      {pet.status === 'sold' ? '💸 Verkauft' : '✅ Verfügbar'}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {pet.status === 'available' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs rounded-xl border-2 font-bold"
                        onClick={() => markSoldMutation.mutate(pet.id)}
                      >
                        Verkauft ✅
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl h-8 w-8"
                      onClick={() => deleteMutation.mutate(pet.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
