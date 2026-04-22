import React from 'react';
import { Card } from '@/components/ui/card';
import { Plane, Bike, ShoppingCart, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import RarityBadge from './RarityBadge';
import NeonBadge from './NeonBadge';
import { useCart } from '@/lib/useCart';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

export default function PetCard({ pet }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { addToCart, removeFromCart, isInCart } = useCart();
  const inCart = isInCart(pet.id);
  const placeholderImg = `https://images.unsplash.com/photo-1535930749574-1399327ce78f?w=400&h=400&fit=crop`;

  const handleCartClick = (e) => {
    e.preventDefault();
    if (inCart) {
      removeFromCart(pet.id);
    } else {
      if (!isAuthenticated) {
        toast.info('Bitte zuerst anmelden, um etwas in den Warenkorb zu legen.');
        navigate(`/login?redirect=${encodeURIComponent(`/pet/${pet.id}`)}`);
        return;
      }
      addToCart(pet);
    }
  };

  return (
    <Link to={`/pet/${pet.id}`}>
      <motion.div
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Card className="overflow-hidden border-2 border-border bg-white hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all group cursor-pointer rounded-2xl">
          <div className="relative aspect-square bg-gradient-to-br from-violet-50 to-blue-50 overflow-hidden">
            <img
              src={pet.image_url || placeholderImg}
              alt={pet.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

            <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
              <RarityBadge rarity={pet.pet_type} />
              <NeonBadge neon={pet.neon || 'normal'} />
            </div>

            <div className="absolute top-2.5 right-2.5 flex gap-1">
              {pet.flyable && (
                <div className="w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center" title="Fly">
                  <Plane className="w-3.5 h-3.5 text-sky-500" />
                </div>
              )}
              {pet.rideable && (
                <div className="w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center" title="Ride">
                  <Bike className="w-3.5 h-3.5 text-emerald-500" />
                </div>
              )}
            </div>

            {pet.status === 'sold' && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <span className="font-heading text-xl text-destructive rotate-[-10deg] border-4 border-destructive px-3 py-1 rounded-xl">Verkauft!</span>
              </div>
            )}
          </div>

          <div className="p-3">
            <h3 className="font-heading text-base truncate text-foreground">{pet.name}</h3>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5 capitalize">{pet.age?.replace('_', ' ') || 'Full Grown'}</p>
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="font-heading text-xl text-primary">
                €{pet.price?.toFixed(2)}
              </span>
              {pet.status !== 'sold' && (
                <Button
                  size="sm"
                  variant={inCart ? 'default' : 'outline'}
                  className={`rounded-xl border-2 font-bold text-xs px-3 gap-1 ${inCart ? 'bg-primary text-white' : ''}`}
                  onClick={handleCartClick}
                >
                  {inCart ? <><Check className="w-3.5 h-3.5" /> Im Korb</> : <><ShoppingCart className="w-3.5 h-3.5" /> Kaufen</>}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </Link>
  );
}
