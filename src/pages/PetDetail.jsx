import React from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingCart, Plane, Bike, Clock, Check } from 'lucide-react';
import { useCart } from '@/lib/useCart';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import RarityBadge from '@/components/pets/RarityBadge';
import NeonBadge from '@/components/pets/NeonBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient'

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

export default function PetDetail() {
  const { authMode, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { id: petId } = useParams();

  const { addToCart, removeFromCart, isInCart } = useCart();

  const { data: pet, isLoading } = useQuery({
    queryKey: ['pet', petId],
    queryFn: async () => {
      if (authMode === 'local') {
        const localPets = readJson(LOCAL_PETS_KEY, []);
        return localPets.find((p) => p.id === petId) || null;
      }
      if (authMode === 'supabase') {
        if (!supabase) return null
        const { data, error } = await supabase.from('pets').select('*').eq('id', petId).maybeSingle()
        if (error) return null
        return data || null
      }
      const results = await db.entities.Pet.filter({ id: petId });
      return results?.[0] || null;
    },
    enabled: !!petId,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-8" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="font-heading text-2xl font-bold">Pet nicht gefunden</h2>
        <Link to="/marketplace">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> Zurück zum Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  const placeholderImg = `https://images.unsplash.com/photo-1535930749574-1399327ce78f?w=600&h=600&fit=crop`;

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.info('Bitte zuerst anmelden, um etwas in den Warenkorb zu legen.');
      navigate(`/login?redirect=${encodeURIComponent(`/pet/${pet.id}`)}`);
      return;
    }
    addToCart(pet);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/marketplace">
        <Button variant="ghost" className="gap-2 text-muted-foreground mb-6 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Button>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid md:grid-cols-2 gap-8"
      >
        {/* Image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-secondary/50 border border-border/50">
          <img
            src={pet.image_url || placeholderImg}
            alt={pet.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            <RarityBadge rarity={pet.pet_type} />
            <NeonBadge neon={pet.neon || 'normal'} />
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <h1 className="font-heading text-3xl font-bold">{pet.name}</h1>

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {pet.flyable && (
              <Badge variant="outline" className="gap-1.5 text-sky-400 border-sky-500/30">
                <Plane className="w-3.5 h-3.5" /> Fly
              </Badge>
            )}
            {pet.rideable && (
              <Badge variant="outline" className="gap-1.5 text-emerald-400 border-emerald-500/30">
                <Bike className="w-3.5 h-3.5" /> Ride
              </Badge>
            )}
            <Badge variant="outline" className="gap-1.5 text-muted-foreground capitalize">
              <Clock className="w-3.5 h-3.5" /> {pet.age?.replace('_', ' ') || 'Full Grown'}
            </Badge>
          </div>

          {pet.description && (
            <p className="mt-6 text-muted-foreground leading-relaxed">{pet.description}</p>
          )}

          <Card className="mt-6 p-5 bg-secondary/30 border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Preis</p>
                <p className="font-heading text-3xl font-bold text-primary mt-1">
                  €{pet.price?.toFixed(2)}
                </p>
              </div>
              {pet.status === 'available' ? (
                isInCart(pet.id) ? (
                  <Button size="lg" className="gap-2 font-bold rounded-xl px-8" onClick={() => removeFromCart(pet.id)}>
                    <Check className="w-5 h-5" />
                    Im Warenkorb ✅
                  </Button>
                ) : (
                  <Button size="lg" className="gap-2 font-bold rounded-xl px-8" onClick={handleAddToCart}>
                    <ShoppingCart className="w-5 h-5" />
                    In den Warenkorb
                  </Button>
                )
              ) : (
                <Badge variant="destructive" className="text-base px-4 py-2 font-bold">Verkauft!</Badge>
              )}
            </div>
          </Card>

          {pet.created_date && (
            <p className="mt-2 text-xs text-muted-foreground">
              Eingestellt am {format(new Date(pet.created_date), 'dd.MM.yyyy')}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
