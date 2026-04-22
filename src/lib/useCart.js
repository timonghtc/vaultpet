import { useState, useEffect } from 'react';
import { cartStore } from './cartStore';

export function useCart() {
  const [cart, setCart] = useState(cartStore.getCart());

  useEffect(() => {
    return cartStore.subscribe(setCart);
  }, []);

  return {
    cart,
    addToCart: cartStore.addToCart,
    removeFromCart: cartStore.removeFromCart,
    clearCart: cartStore.clearCart,
    isInCart: (id) => cart.some(p => p.id === id),
    total: cart.reduce((sum, p) => sum + (p.price || 0), 0),
    count: cart.length,
  };
}