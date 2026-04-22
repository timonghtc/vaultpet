// Simple module-level store with listeners

let cart = [];
let listeners = [];

function notify() {
  listeners.forEach(fn => fn([...cart]));
}

export const cartStore = {
  getCart: () => [...cart],
  addToCart: (pet) => {
    if (!cart.find(p => p.id === pet.id)) {
      cart = [...cart, pet];
      notify();
    }
  },
  removeFromCart: (petId) => {
    cart = cart.filter(p => p.id !== petId);
    notify();
  },
  clearCart: () => {
    cart = [];
    notify();
  },
  subscribe: (fn) => {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  }
};