import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/useCart';
import { motion, AnimatePresence } from 'framer-motion';

export default function CartIcon() {
  const { count } = useCart();

  return (
    <Link to="/checkout" className="relative inline-flex items-center">
      <div className="relative w-12 h-12 rounded-2xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors cursor-pointer">
        <ShoppingCart className="w-6 h-6 text-primary" />
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center shadow"
            >
              {count}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Link>
  );
}
