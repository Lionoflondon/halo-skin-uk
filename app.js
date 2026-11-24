const demoProducts = [
  {
    id: 'demo-1',
    variantId: 'demo-v1',
    slug: 'lip-peptide-treatment',
    title: 'Lip Peptide Treatment',
    subtitle: 'Softening clear treatment',
    type: 'Treatment',
    price: 18,
    badge: 'Bestseller',
    number: '01',
    image: 'assets/halo-pink-botanical-clean-v2.jpg',
    alt: 'Halo clear peptide lip treatment among flowers and river stones'
  },
  {
    id: 'demo-2',
    variantId: 'demo-v2',
    slug: 'peptide-lip-tint-pink-veil',
    title: 'Peptide Lip Tint',
    subtitle: 'Pink veil',
    type: 'Tint',
    price: 18,
    badge: 'New',
    number: '02',
    image: 'assets/halo-lifestyle-clean-v2.jpg',
    alt: 'Halo pink peptide lip tint'
  },
  {
    id: 'demo-3',
    variantId: 'demo-v3',
    slug: 'peptide-lip-tint-cocoa-rose',
    title: 'Peptide Lip Tint',
    subtitle: 'Cocoa rose',
    type: 'Tint',
    price: 18,
    badge: '',
    number: '03',
    image: 'assets/halo-trio-blue-clean-v2.jpg',
    alt: 'Halo cocoa rose peptide lip tint'
  },
  {
    id: 'demo-4',
    variantId: 'demo-v4',
    slug: 'halo-lip-trio',
    title: 'The Halo Lip Trio',
    subtitle: 'Three everyday shades',
    type: 'Set',
    price: 48,
    badge: 'Save £6',
    number: '04',
    image: 'assets/halo-trio-warm-clean-v2.jpg',
    alt: 'The Halo lip trio in three everyday shades'
  }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
}[character]));

function updatedImageUrl(url) {
  return String(url || '').replace(/(halo-(?:pink-botanical|lifestyle|trio-blue|trio-warm|model-blue))\.jpg(?=$|[?#])/, '$1-clean-v2.jpg');
}

function savedCart() {
  try {
    const value = JSON.parse(localStorage.getItem('halo_cart') || '[]');
    return Array.isArray(value) ? value.map(item => ({ ...item, image: updatedImageUrl(item.image) })) : [];
  } catch (_) {
    return [];
  }
}

let products = [];
let cart = savedCart();
let appliedDiscount = '';
let checkoutSubtotal = 0;
let checkoutDiscount = 0;
let activeFilter = 'all';
let activeOverlayOpener = null;

function productCard(product) {
  const soldOut = product.available === false;
  return `<article class="product-card" data-product-id="${escapeHtml(product.id)}" data-product-type="${escapeHtml(product.type)}">
    <div class="product-image">
      ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
      ${product.image
        ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.alt || product.title)}" loading="lazy">`
        : `<div class="product-bottle" data-number="${escapeHtml(product.number)}" aria-label="${escapeHtml(product.title)}">HALO</div>`}
      <button class="quick-add" type="button" data-add="${escapeHtml(product.variantId)}" ${soldOut ? 'disabled' : ''} aria-label="${soldOut ? `${escapeHtml(product.title)} is sold out` : `Add ${escapeHtml(product.title)} to bag`}">
        ${soldOut ? 'Sold out' : `Quick add ${money(product.price)}`}
      </button>
    </div>
    <div class="product-meta">
      <p class="product-kicker">${escapeHtml(product.type)}</p>
      <h3>${escapeHtml(product.title)}</h3>
      <p>${escapeHtml(product.subtitle)}</p>
      <span class="product-price">${money(product.price)}</span>
    </div>
  </article>`;
}

function normaliseManagedProduct(id, data) {
  return {
    id,
    variantId: data.variantId || `${id}-default`,
    slug: data.slug || id,
    title: data.title || 'Halo product',
    subtitle: data.subtitle || '',
    type: data.type || 'Treatment',
    price: Number(data.price) || 0,
    badge: data.badge || '',
    number: data.number || '',
    image: updatedImageUrl(data.image),
    alt: data.alt || data.title || 'Halo product',
    available: data.available !== false,
    published: data.published === true,
    sortOrder: Number(data.sortOrder) || 0
  };
}

async function loadProducts() {
  products = demoProducts;
  renderProducts(activeFilter);

  const firebaseConfig = window.HALO_FIREBASE_CONFIG;
  if (!firebaseConfig?.projectId) return;

  try {
    const [{ initializeApp, getApps }, { collection, getDocs, getFirestore, query, where }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const database = getFirestore(firebaseApp);
    const catalogueQuery = query(collection(database, 'products'), where('published', '==', true));
    const snapshot = await getDocs(catalogueQuery);
    const managedProducts = snapshot.docs
      .map(document => normaliseManagedProduct(document.id, document.data()))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

    if (managedProducts.length) {
      products = managedProducts;
      renderProducts(activeFilter);
      renderCart();
    }
  } catch (error) {
    console.info('Halo managed catalogue is unavailable; using the built-in catalogue.', error?.code || error?.message || error);
  }
}

function renderProducts(filter = 'all') {
  const grid = $('#product-grid');
  if (!grid) return;
  activeFilter = filter || 'all';
  const list = products.filter(product => activeFilter === 'all' || product.type === activeFilter);
  grid.innerHTML = list.length
    ? list.map(productCard).join('')
    : '<p class="product-grid-empty">No Halo essentials match this category yet.</p>';
}

function addToCart(variantId) {
  const product = products.find(item => item.variantId === variantId);
  if (!product || product.available === false) return;
  const cartItem = cart.find(item => item.variantId === variantId);
  if (cartItem) cartItem.quantity += 1;
  else cart.push({ ...product, quantity: 1 });
  saveCart();
  toast(`${product.title} added to your bag`);
  const drawer = $('.cart-drawer');
  if (drawer) openDrawer(drawer);
}

function saveCart() {
  localStorage.setItem('halo_cart', JSON.stringify(cart));
  renderCart();
}

function changeQty(variantId, delta) {
  const item = cart.find(entry => entry.variantId === variantId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(entry => entry.variantId !== variantId);
  saveCart();
}

function renderCart() {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  $$('.cart-count').forEach(element => {
    element.textContent = `(${count})`;
    element.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'} in bag`);
  });

  const items = $('#cart-items');
  if (items) {
    items.innerHTML = cart.map(item => `<div class="cart-item">
      <div class="cart-thumb">${item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt || item.title)}">`
        : `<div class="product-bottle" data-number="${escapeHtml(item.number)}" aria-hidden="true">H</div>`}</div>
      <div class="cart-item-copy">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.subtitle)}</p>
        <div class="quantity" aria-label="Quantity for ${escapeHtml(item.title)}">
          <button type="button" data-qty="${escapeHtml(item.variantId)}" data-delta="-1" aria-label="Decrease quantity">−</button>
          <span aria-live="polite">${item.quantity}</span>
          <button type="button" data-qty="${escapeHtml(item.variantId)}" data-delta="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div class="cart-item-price"><b>${money(item.price * item.quantity)}</b><br><button type="button" class="remove" data-remove="${escapeHtml(item.variantId)}">Remove</button></div>
    </div>`).join('');
  }

  $$('.cart-subtotal, #cart-subtotal').forEach(element => { element.textContent = money(total); });
  const remaining = $('#delivery-remaining');
  if (remaining) remaining.textContent = money(Math.max(0, 45 - total));
  const progress = $('.cart-progress span');
  if (progress) progress.style.width = `${Math.min(100, total / 45 * 100)}%`;
  const empty = $('#cart-empty');
  const footer = $('#cart-footer');
  if (empty) empty.style.display = cart.length ? 'none' : 'block';
  if (footer) footer.style.display = cart.length ? 'block' : 'none';
  const checkoutButton = $('#checkout-button');
  if (checkoutButton) checkoutButton.disabled = !cart.length;
}

function openDrawer(element) {
  if (!element) return;
  activeOverlayOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $$('.drawer,.search-panel').forEach(panel => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
  $$('[aria-controls="cart-drawer"],[aria-controls="menu-drawer"],[aria-controls="search-panel"]').forEach(control => {
    control.setAttribute('aria-expanded', String(control.getAttribute('aria-controls') === element.id));
  });
  element.classList.add('open');
  element.setAttribute('aria-hidden', 'false');
  $$('header, main, footer').forEach(region => {
    region.inert = true;
    region.setAttribute('inert', '');
    region.setAttribute('aria-hidden', 'true');
  });
  const overlay = $('[data-overlay]');
  if (overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  const closeButton = $('[data-drawer-close], [data-search-close]', element);
  if (closeButton) closeButton.focus({ preventScroll: true });
}

function closeAll({ restoreFocus = true } = {}) {
  $$('.drawer,.search-panel').forEach(panel => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
  $$('[aria-controls="cart-drawer"],[aria-controls="menu-drawer"],[aria-controls="search-panel"]').forEach(control => control.setAttribute('aria-expanded', 'false'));
  $$('header, main, footer').forEach(region => {
    region.inert = false;
    region.removeAttribute('inert');
    region.removeAttribute('aria-hidden');
  });
  const overlay = $('[data-overlay]');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  if (restoreFocus && activeOverlayOpener?.isConnected) activeOverlayOpener.focus({ preventScroll: true });
  activeOverlayOpener = null;
}

let toastTimer;
function toast(message) {
  const element = $('.toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

function selectCategory(category, shouldScroll = true) {
  const filter = category || 'all';
  $$('.filter').forEach(button => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderProducts(filter);
  if (shouldScroll) $('#shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSearch(term) {
  const results = $('#search-results');
  if (!results) return;
  const query = term.trim().toLowerCase();
  if (!query) {
    results.innerHTML = '';
    return;
  }
  const hits = products.filter(product => [product.title, product.subtitle, product.type]
    .some(value => value.toLowerCase().includes(query)));
  results.innerHTML = hits.length
    ? hits.map(product => `<button type="button" class="search-result" data-search-product="${escapeHtml(product.id)}">
        <img src="${escapeHtml(product.image)}" alt="">
        <span><b>${escapeHtml(product.title)}</b><small>${escapeHtml(product.subtitle)}</small></span>
        <strong>${money(product.price)}</strong>
      </button>`).join('')
    : '<p>No products found. Try treatment, tint or set.</p>';
}

function selectedDeliveryMethod() {
  return $('input[name="deliveryMethod"]:checked')?.value || 'standard';
}

function renderCheckoutTotals() {
  if (!window.HaloDelivery?.METHODS) return;
  const method = window.HaloDelivery.METHODS[selectedDeliveryMethod()];
  if (!method) return;
  const subtotal = checkoutSubtotal - checkoutDiscount;
  const delivery = method.price;
  const subtotalElement = $('#checkout-subtotal');
  const deliveryElement = $('#checkout-delivery');
  const totalElement = $('#checkout-total');
  if (subtotalElement) subtotalElement.textContent = money(subtotal);
  if (deliveryElement) deliveryElement.textContent = money(delivery);
  if (totalElement) totalElement.textContent = money(subtotal + delivery);
}

function checkoutAddress() {
  const form = $('#checkout-form');
  if (!form) return {};
  return {
    address: form.elements.address?.value.trim() || '',
    city: form.elements.city?.value.trim() || '',
    postcode: form.elements.postcode?.value.trim().toUpperCase() || '',
    country: form.elements.country?.value || ''
  };
}

let areaCheckTimer;
let areaCheckSequence = 0;
async function refreshCircumEligibility() {
  const address = checkoutAddress();
  const circum = $('input[value="circum"]');
  const standard = $('input[value="standard"]');
  const message = $('#service-area-message');
  if (!circum || !standard || !message || !window.HaloDelivery) return;
  const sequence = ++areaCheckSequence;
  message.className = 'service-area-message';
  if (window.HALO_DELIVERY_CONFIG?.circumCheckoutEnabled !== true) {
    circum.disabled = true;
    message.textContent = 'Circum Same Day is not available at secure checkout yet. Choose Standard Delivery.';
    if (circum.checked) standard.checked = true;
    renderCheckoutTotals();
    return;
  }
  if (!address.address || !address.city || !address.postcode) {
    circum.disabled = true;
    message.textContent = 'Enter your address, city and postcode to check Circum Same Day availability.';
    if (circum.checked) standard.checked = true;
    renderCheckoutTotals();
    return;
  }
  message.textContent = 'Checking Circum Same Day availability…';
  try {
    const result = await window.HaloDelivery.checkServiceArea(address);
    if (sequence !== areaCheckSequence) return;
    circum.disabled = !result.eligible;
    if (result.eligible) {
      message.classList.add('available');
      message.textContent = '✓ Circum Same Day is available for this address.';
    } else {
      message.classList.add('unavailable');
      message.textContent = '⚡ Circum Same Day is currently available only within London and surrounding service areas.';
      if (circum.checked) standard.checked = true;
    }
  } catch (_) {
    if (sequence !== areaCheckSequence) return;
    circum.disabled = true;
    message.classList.add('unavailable');
    message.textContent = 'Circum availability could not be confirmed. Standard Delivery remains available.';
    if (circum.checked) standard.checked = true;
  }
  renderCheckoutTotals();
}

function openCheckout() {
  if (!cart.length) {
    toast('Your bag is as light as air. Add an essential first.');
    return;
  }
  checkoutSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  checkoutDiscount = appliedDiscount === 'HALO10' ? checkoutSubtotal * 0.1 : 0;
  const standard = $('input[value="standard"]');
  if (standard) standard.checked = true;
  const items = $('#checkout-items');
  if (items) {
    items.innerHTML = cart.map(item => `<div class="checkout-summary-item">
      <img src="${escapeHtml(item.image)}" alt="">
      <span>${escapeHtml(item.title)}<br><small>${escapeHtml(item.subtitle)} × ${item.quantity}</small></span>
      <b>${money(item.price * item.quantity)}</b>
    </div>`).join('');
  }
  renderCheckoutTotals();
  closeAll({ restoreFocus: false });
  const modal = $('#checkout-modal');
  if (modal?.showModal) modal.showModal();
  refreshCircumEligibility();
}

function bindInteractions() {
  $('[data-cart-open]')?.addEventListener('click', () => openDrawer($('.cart-drawer')));
  $('[data-menu-open]')?.addEventListener('click', () => openDrawer($('.menu-drawer')));
  $$('[data-drawer-close],[data-overlay]').forEach(button => button.addEventListener('click', closeAll));
  $('[data-search-open]')?.addEventListener('click', () => {
    openDrawer($('.search-panel'));
    setTimeout(() => $('#search-input')?.focus(), 300);
  });
  $('[data-search-close]')?.addEventListener('click', closeAll);

  $$('.filter').forEach(button => button.addEventListener('click', () => selectCategory(button.dataset.filter, false)));
  $$('[data-category]').forEach(card => card.addEventListener('click', event => {
    event.preventDefault();
    selectCategory(card.dataset.category);
  }));

  $('#product-grid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-add]');
    if (button) addToCart(button.dataset.add);
  });
  $('#cart-items')?.addEventListener('click', event => {
    const quantityButton = event.target.closest('[data-qty]');
    if (quantityButton) changeQty(quantityButton.dataset.qty, Number(quantityButton.dataset.delta));
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      const item = cart.find(entry => entry.variantId === removeButton.dataset.remove);
      if (item) changeQty(item.variantId, -item.quantity);
    }
  });

  $('#search-input')?.addEventListener('input', event => renderSearch(event.target.value));
  $('#search-results')?.addEventListener('click', event => {
    const result = event.target.closest('[data-search-product]');
    if (!result) return;
    const product = products.find(item => item.id === result.dataset.searchProduct);
    closeAll();
    if (product) selectCategory(product.type);
  });

  $('#newsletter-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const message = $('.form-message', event.currentTarget);
    if (message) message.textContent = 'Welcome to our orbit. Check your inbox soon.';
    event.currentTarget.reset();
  });

  $('#apply-discount')?.addEventListener('click', () => {
    const input = $('#discount-code');
    const code = input?.value.trim().toUpperCase();
    if (!code) return;
    if (code === 'HALO10') {
      appliedDiscount = code;
      toast('HALO10 applied: 10% off');
    } else toast('That discount code is not recognised');
  });

  $$('input[name="deliveryMethod"]').forEach(input => input.addEventListener('change', renderCheckoutTotals));
  ['address', 'city', 'postcode'].forEach(name => {
    $(`#checkout-form [name="${name}"]`)?.addEventListener('input', () => {
      clearTimeout(areaCheckTimer);
      areaCheckTimer = setTimeout(refreshCircumEligibility, 250);
    });
  });
  $('#checkout-form [name="country"]')?.addEventListener('change', refreshCircumEligibility);
  $('#checkout-button')?.addEventListener('click', openCheckout);
  $('#checkout-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const message = $('#checkout-payment-message');
    const endpoint = window.HALO_DELIVERY_CONFIG?.checkoutSessionEndpoint;
    if (!endpoint) {
      if (message) message.textContent = 'Secure checkout is not available yet. No order or payment has been taken.';
      return;
    }
    const button = $('#checkout-submit');
    if (button) button.disabled = true;
    if (message) message.textContent = 'Opening secure Stripe checkout…';
    try {
      const payload = JSON.stringify({
        items: cart.map(item => ({ id: item.id, variantId: item.variantId, quantity: item.quantity })),
        email: $('#checkout-form [name="email"]')?.value.trim(),
        deliveryMethod: selectedDeliveryMethod()
      });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const storageKey = `halo_checkout_request:${fingerprint}`;
      const requestKey = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestKey);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
        body: payload
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/')) {
        throw new Error(result.message || 'Secure checkout is temporarily unavailable. Please try again.');
      }
      window.location.assign(result.url);
    } catch (error) {
      if (message) message.textContent = error.message || 'Secure checkout is temporarily unavailable. Please try again.';
      if (button) button.disabled = false;
    }
  });
  $('[data-checkout-close]')?.addEventListener('click', () => $('#checkout-modal')?.close());

  document.addEventListener('keydown', event => {
    const openPanel = $('.drawer.open,.search-panel.open');
    if (event.key === 'Escape' && openPanel) {
      event.preventDefault();
      closeAll();
      return;
    }
    if (event.key !== 'Tab' || !openPanel) return;
    const focusable = $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', openPanel)
      .filter(element => element.getClientRects().length > 0 && !element.closest('[inert],[aria-hidden="true"]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

async function showStripeReturnStatus() {
  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get('session_id');
  const payment = query.get('payment');
  if (payment !== 'processing' || !sessionId) {
    if (payment === 'cancelled') toast('Checkout was cancelled. You have not been charged.');
    return;
  }
  const endpoint = window.HALO_DELIVERY_CONFIG?.checkoutStatusEndpoint;
  if (!endpoint) return;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    const status = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(status.message || 'Payment status is still being confirmed.');
    if (status.paymentStatus === 'paid') {
      cart = [];
      localStorage.removeItem('halo_cart');
      renderCart();
      toast('Payment confirmed. HALO has received your order.');
    } else if (status.paymentStatus === 'abandoned') {
      toast('Checkout expired before payment completed.');
    } else {
      toast('Payment is still being confirmed. Your order will update shortly.');
    }
  } catch (_) {
    toast('Payment is still being confirmed. Please check again shortly.');
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }
}

bindInteractions();
renderCart();
showStripeReturnStatus();
loadProducts();
