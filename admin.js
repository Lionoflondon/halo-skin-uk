import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  browserLocalPersistence,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = window.HALO_FIREBASE_CONFIG;
const allowedAdminEmails = window.HALO_ADMIN_EMAILS || [];
const deliveryConfig = window.HALO_DELIVERY_CONFIG || {};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
await setPersistence(auth, browserLocalPersistence);
const database = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value) || 0);
const slugify = value => String(value || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const starterProducts = [
  { id: 'lip-peptide-treatment', variantId: 'lip-peptide-treatment-default', slug: 'lip-peptide-treatment', title: 'Lip Peptide Treatment', subtitle: 'Softening clear treatment', type: 'Treatment', price: 18, badge: 'Bestseller', number: '01', image: 'assets/halo-pink-botanical.jpg', alt: 'Halo clear peptide lip treatment among flowers and river stones', available: true, published: true, sortOrder: 1 },
  { id: 'peptide-lip-tint-pink-veil', variantId: 'peptide-lip-tint-pink-veil-default', slug: 'peptide-lip-tint-pink-veil', title: 'Peptide Lip Tint', subtitle: 'Pink veil', type: 'Tint', price: 18, badge: 'New', number: '02', image: 'assets/halo-lifestyle.jpg', alt: 'Halo pink peptide lip tint', available: true, published: true, sortOrder: 2 },
  { id: 'peptide-lip-tint-cocoa-rose', variantId: 'peptide-lip-tint-cocoa-rose-default', slug: 'peptide-lip-tint-cocoa-rose', title: 'Peptide Lip Tint', subtitle: 'Cocoa rose', type: 'Tint', price: 18, badge: '', number: '03', image: 'assets/halo-trio-blue.jpg', alt: 'Halo cocoa rose peptide lip tint', available: true, published: true, sortOrder: 3 },
  { id: 'halo-lip-trio', variantId: 'halo-lip-trio-default', slug: 'halo-lip-trio', title: 'The Halo Lip Trio', subtitle: 'Three everyday shades', type: 'Set', price: 48, badge: 'Save £6', number: '04', image: 'assets/halo-trio-warm.jpg', alt: 'The Halo lip trio in three everyday shades', available: true, published: true, sortOrder: 4 }
];

let catalogue = [];
let unsubscribeProducts = null;
let editingImage = '';

function message(element, text, state = '') {
  element.textContent = text;
  element.className = `form-message ${state}`.trim();
}

function isAllowedAdmin(user) {
  return Boolean(user?.emailVerified && allowedAdminEmails.includes(user.email));
}

function switchTab(name) {
  $$('.admin-tab').forEach(button => button.classList.toggle('active', button.dataset.adminTab === name));
  $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === name));
}

function previewImage(source) {
  const preview = $('#image-preview');
  preview.innerHTML = source
    ? `<img src="${escapeHtml(source)}" alt="Product image preview">`
    : '<span>No image</span>';
}

function resetProductForm() {
  $('#product-form').reset();
  $('#product-id').value = '';
  $('#product-sort').value = String(catalogue.length + 1);
  $('#product-available').checked = true;
  $('#product-published').checked = true;
  $('#product-form-title').textContent = 'Add product';
  $('#save-product').textContent = 'Save product';
  editingImage = '';
  previewImage('');
  message($('#product-message'), '');
}

function fillProductForm(product) {
  $('#product-id').value = product.id;
  $('#product-title').value = product.title || '';
  $('#product-subtitle').value = product.subtitle || '';
  $('#product-type').value = product.type || 'Treatment';
  $('#product-price').value = product.price ?? '';
  $('#product-sort').value = product.sortOrder ?? 0;
  $('#product-badge').value = product.badge || '';
  $('#product-number').value = product.number || '';
  $('#product-slug').value = product.slug || '';
  $('#product-image-url').value = product.image?.startsWith('data:') ? '' : (product.image || '');
  $('#product-alt').value = product.alt || '';
  $('#product-available').checked = product.available !== false;
  $('#product-published').checked = product.published === true;
  $('#product-form-title').textContent = 'Edit product';
  $('#save-product').textContent = 'Update product';
  editingImage = product.image || '';
  previewImage(editingImage);
  $('#product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCatalogue() {
  const list = $('#admin-products');
  const publishedCount = catalogue.filter(product => product.published).length;
  $('#catalogue-summary').textContent = `${catalogue.length} product${catalogue.length === 1 ? '' : 's'} · ${publishedCount} published`;
  if (!catalogue.length) {
    list.innerHTML = '<div class="empty-card">No managed products yet. Import the current storefront products or add your first product.</div>';
    return;
  }

  list.innerHTML = catalogue.map(product => `
    <article class="admin-product">
      ${product.image
        ? `<img src="${escapeHtml(product.image)}" alt="">`
        : '<div class="product-image-placeholder" aria-hidden="true">H</div>'}
      <div>
        <h3>${escapeHtml(product.title)}</h3>
        <p>${escapeHtml(product.type)} · ${money(product.price)} · ${escapeHtml(product.subtitle)}</p>
        <div class="status-row">
          <span class="pill ${product.published ? 'live' : ''}">${product.published ? 'Published' : 'Draft'}</span>
          <span class="pill ${product.available === false ? 'sold' : ''}">${product.available === false ? 'Sold out' : 'Available'}</span>
        </div>
      </div>
      <div class="product-actions">
        <button type="button" data-edit-product="${escapeHtml(product.id)}">Edit</button>
        <button class="delete-product" type="button" data-delete-product="${escapeHtml(product.id)}">Delete</button>
      </div>
    </article>`).join('');
}

async function compressImage(file) {
  if (!file) return '';
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10MB.');
  const bitmap = await createImageBitmap(file);
  const maximum = 1400;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .84));
  if (!blob) throw new Error('This image could not be processed.');
  if (blob.size > 720 * 1024) throw new Error('The processed image is still too large. Use a smaller source image.');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('This image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

async function saveProduct(event) {
  event.preventDefault();
  const saveButton = $('#save-product');
  const productMessage = $('#product-message');
  saveButton.disabled = true;
  message(productMessage, 'Saving product…');

  try {
    const title = $('#product-title').value.trim();
    const slug = slugify($('#product-slug').value || title);
    const existingId = $('#product-id').value;
    const id = existingId || `${slug}-${Date.now().toString(36)}`;
    const selectedFile = $('#product-image-file').files[0];
    const enteredImage = $('#product-image-url').value.trim();
    const image = selectedFile ? await compressImage(selectedFile) : (enteredImage || editingImage);
    if (!image) throw new Error('Add a product image or image URL.');

    const product = {
      variantId: catalogue.find(item => item.id === id)?.variantId || `${id}-default`,
      slug,
      title,
      subtitle: $('#product-subtitle').value.trim(),
      type: $('#product-type').value,
      price: Number($('#product-price').value),
      sortOrder: Number($('#product-sort').value) || 0,
      badge: $('#product-badge').value.trim(),
      number: $('#product-number').value.trim(),
      image,
      alt: $('#product-alt').value.trim(),
      available: $('#product-available').checked,
      published: $('#product-published').checked,
      updatedAt: serverTimestamp()
    };
    if (!existingId) product.createdAt = serverTimestamp();
    await setDoc(doc(database, 'products', id), product, { merge: true });
    message(productMessage, existingId ? 'Product updated.' : 'Product added to Halo.', 'success');
    setTimeout(resetProductForm, 650);
  } catch (error) {
    message(productMessage, error.message || 'Product could not be saved.', 'error');
  } finally {
    saveButton.disabled = false;
  }
}

async function importStarterProducts() {
  const button = $('#import-products');
  button.disabled = true;
  button.textContent = 'Importing…';
  try {
    const batch = writeBatch(database);
    starterProducts.forEach(product => {
      const { id, ...data } = product;
      batch.set(doc(database, 'products', id), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    message($('#product-message'), error.message || 'Products could not be imported.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Import current products';
  }
}

async function removeProduct(id) {
  const product = catalogue.find(item => item.id === id);
  if (!product || !window.confirm(`Delete ${product.title}? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(database, 'products', id));
    if ($('#product-id').value === id) resetProductForm();
  } catch (error) {
    message($('#product-message'), error.message || 'Product could not be deleted.', 'error');
  }
}

function watchProducts() {
  unsubscribeProducts?.();
  unsubscribeProducts = onSnapshot(collection(database, 'products'), snapshot => {
    catalogue = snapshot.docs.map(productDocument => ({ id: productDocument.id, ...productDocument.data() }))
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.title).localeCompare(String(b.title)));
    renderCatalogue();
  }, error => {
    $('#catalogue-summary').textContent = 'Catalogue could not be loaded.';
    message($('#product-message'), error.message || 'Catalogue access failed.', 'error');
  });
}

async function loadOrders() {
  const tbody = $('#orders');
  const notice = $('#admin-notice');
  if (!deliveryConfig.adminOrdersEndpoint) return;
  notice.textContent = 'Loading Halo delivery data…';
  try {
    const response = await fetch(deliveryConfig.adminOrdersEndpoint, { credentials: 'include' });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const { orders = [] } = await response.json();
    tbody.innerHTML = orders.length ? orders.map(order => `<tr>
      <td>${escapeHtml(order.orderNumber || order.id)}</td>
      <td>${escapeHtml(order.customerName || order.customerEmail)}</td>
      <td>${order.deliveryMethod === 'circum' ? '⚡ Circum Same Day' : '📦 Standard Delivery'}</td>
      <td>${escapeHtml(order.circumDeliveryId || '—')}</td>
      <td>${order.deliveryStatus ? `<span class="status">${escapeHtml(order.deliveryStatus)}</span>` : 'Halo fulfilment'}</td>
      <td>${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener">Track ↗</a>` : '—'}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">No orders found.</td></tr>';
    notice.textContent = `${orders.length} Halo order${orders.length === 1 ? '' : 's'} loaded.`;
  } catch (_) {
    notice.textContent = 'Halo delivery data could not be loaded.';
  }
}

onAuthStateChanged(auth, async user => {
  const allowed = isAllowedAdmin(user);
  $('#login-panel').hidden = allowed;
  $('#admin-app').hidden = !allowed;
  $('#sign-out').hidden = !allowed;
  $('#admin-user').textContent = allowed ? user.email : 'Admin';
  if (allowed) {
    $('#account-email').textContent = user.email;
    message($('#login-message'), '');
    watchProducts();
    loadOrders();
    return;
  }
  unsubscribeProducts?.();
  if (user) {
    message($('#login-message'), 'This Google account is not authorised for Halo Admin.', 'error');
    await signOut(auth);
  }
});

$('#password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  const password = $('#new-password').value;
  const confirmation = $('#confirm-password').value;
  const button = $('#save-password');
  const passwordMessage = $('#password-message');

  if (!isAllowedAdmin(user)) {
    message(passwordMessage, 'Sign in with the authorised Halo administrator account first.', 'error');
    return;
  }
  if (password !== confirmation) {
    message(passwordMessage, 'The two passwords do not match.', 'error');
    return;
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(password)) {
    message(passwordMessage, 'Use at least 12 characters with uppercase, lowercase, a number and a symbol.', 'error');
    return;
  }

  button.disabled = true;
  message(passwordMessage, 'Securing your new password…');
  try {
    const hasPasswordProvider = user.providerData.some(providerData => providerData.providerId === 'password');
    if (hasPasswordProvider) {
      await updatePassword(user, password);
    } else {
      await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
    }
    event.currentTarget.reset();
    message(passwordMessage, 'Password saved. You can now sign in with email and password.', 'success');
  } catch (error) {
    const needsRecentLogin = error.code === 'auth/requires-recent-login';
    message(
      passwordMessage,
      needsRecentLogin
        ? 'For security, sign out and sign in with Google again, then set the password immediately.'
        : (error.message || 'The password could not be changed.'),
      'error'
    );
  } finally {
    button.disabled = false;
  }
});

$('#google-sign-in').addEventListener('click', async () => {
  const button = $('#google-sign-in');
  button.disabled = true;
  message($('#login-message'), 'Opening secure Google sign-in…');
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const needsSetup = ['auth/operation-not-allowed', 'auth/configuration-not-found'].includes(error.code);
    message(
      $('#login-message'),
      needsSetup
        ? 'Google sign-in is not available. Use your Halo admin email and password.'
        : (error.message || 'Sign-in was not completed.'),
      'error'
    );
  } finally {
    button.disabled = false;
  }
});

$('#email-sign-in-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#email-sign-in');
  const email = $('#admin-email').value.trim().toLowerCase();
  const password = $('#admin-password').value;
  button.disabled = true;
  message($('#login-message'), 'Signing in securely…');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    $('#admin-password').value = '';
  } catch (error) {
    const friendlyMessage = error.code === 'auth/too-many-requests'
      ? 'Too many attempts. Wait a moment or reset your password.'
      : 'The email or password was not recognised.';
    message($('#login-message'), friendlyMessage, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#password-reset').addEventListener('click', async () => {
  const button = $('#password-reset');
  const email = $('#admin-email').value.trim().toLowerCase();
  if (!allowedAdminEmails.includes(email)) {
    message($('#login-message'), 'Enter the authorised Halo administrator email first.', 'error');
    return;
  }
  button.disabled = true;
  message($('#login-message'), 'Sending a secure password setup email…');
  try {
    await sendPasswordResetEmail(auth, email);
    message($('#login-message'), 'Password email sent. Follow the secure link in your inbox, then return here to sign in.', 'success');
  } catch (error) {
    message($('#login-message'), 'The password email could not be sent. Use Google sign-in or try again shortly.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#sign-out').addEventListener('click', () => signOut(auth));
$('#product-form').addEventListener('submit', saveProduct);
$('#reset-product').addEventListener('click', resetProductForm);
$('#import-products').addEventListener('click', importStarterProducts);
$('#refresh').addEventListener('click', loadOrders);
$('#product-image-url').addEventListener('input', event => previewImage(event.target.value.trim() || editingImage));
$('#product-image-file').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return previewImage($('#product-image-url').value.trim() || editingImage);
  const temporaryUrl = URL.createObjectURL(file);
  previewImage(temporaryUrl);
});
$('#admin-products').addEventListener('click', event => {
  const editButton = event.target.closest('[data-edit-product]');
  const deleteButton = event.target.closest('[data-delete-product]');
  if (editButton) fillProductForm(catalogue.find(product => product.id === editButton.dataset.editProduct));
  if (deleteButton) removeProduct(deleteButton.dataset.deleteProduct);
});
$$('.admin-tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));

resetProductForm();
