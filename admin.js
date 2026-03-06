/* ══════════════════════════════════════════════
   FIREBASE INIT  (no Storage – images stored as base64 in Firestore)
══════════════════════════════════════════════ */
let fbAuth, fbDb;
const ADMIN_MENU_CACHE_KEY = 'adminMenuCacheV1';

if (typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED) {
  try { firebase.initializeApp(FIREBASE_CONFIG); } catch {}
  fbAuth = firebase.auth();
  fbDb   = firebase.firestore();
}

/* ══════════════════════════════════════════════
   IMAGE COMPRESSION  (canvas → base64 JPEG, ≈ 30-60 KB per image)
══════════════════════════════════════════════ */
function compressImage(file, maxPx = 200, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload  = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width);  width  = maxPx; }
          else                 { width  = Math.round(width  * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const S = {
  menu:        { categories: [], items: [] },
  activeCatId: null,
  editingItem: null,
  pendingImage: null,
  currentEmoji: '🍽️',
  confirmCallback: null,
};

const EMOJI_LIST = [
  '🍱','🥘','🍽️','🍲','🥣','🍳','🥞','🥗','🫒','🥦','🍖','🍗','🐟',
  '🫑','🥟','🥔','🍝','🌾','🍚','🥬','🫙','🫐','🥐','🍒','🧁','🍞',
  '🧈','🍅','🥛','🍵','☕','💧','🧃','📦','🧻','🔪','🥄','🍴','🍬',
  '🧆','🌮','🌯','🥙','🫔','🥚','🧀','🥩','🍔','🍟','🌭',
];

/* helper: prefer base64 stored in Firestore, fall back to legacy URL */
function itemImg(item) { return item?.imageBase64 || item?.imageUrl || null; }

function isPermissionError(err) {
  return err?.code === 'permission-denied' || err?.code === 'unauthenticated';
}

function explainError(err, fallback = 'Ошибка операции') {
  if (isPermissionError(err)) {
    return 'Нет доступа к Firestore. Проверьте Firestore Rules и авторизацию.';
  }
  return err?.message || fallback;
}

function saveMenuCache() {
  try { localStorage.setItem(ADMIN_MENU_CACHE_KEY, JSON.stringify(S.menu)); } catch {}
}

function loadMenuCache() {
  try {
    const raw = localStorage.getItem(ADMIN_MENU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function toast(msg, type = 'default') {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className   = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ══════════════════════════════════════════════
   CONFIRM
══════════════════════════════════════════════ */
function showConfirm(text, cb) {
  S.confirmCallback = cb;
  document.getElementById('confirmText').textContent = text;
  openModal('confirmModal');
}
document.getElementById('confirmOk').addEventListener('click',        () => { closeModal('confirmModal'); S.confirmCallback?.(); });
document.getElementById('confirmCancel').addEventListener('click',    () => closeModal('confirmModal'));
document.getElementById('confirmModalClose').addEventListener('click',() => closeModal('confirmModal'));

/* ══════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    }
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
});

/* ══════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════ */
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.textContent = 'Вход...';
  btn.disabled    = true;
  err.textContent = '';

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    if (!FIREBASE_ENABLED) throw new Error('Firebase не настроен — заполните firebase-config.js');
    await fbAuth.signInWithEmailAndPassword(email, password);
  } catch (ex) {
    const msgs = {
      'auth/user-not-found':    'Пользователь не найден',
      'auth/wrong-password':    'Неверный пароль',
      'auth/invalid-email':     'Неверный email',
      'auth/too-many-requests': 'Слишком много попыток, подождите',
      'auth/invalid-credential':'Неверный email или пароль',
    };
    err.textContent = msgs[ex.code] || ex.message;
    btn.disabled    = false;
    btn.textContent = 'Войти';
  }
});

/* ══════════════════════════════════════════════
   AUTH STATE
══════════════════════════════════════════════ */
if (FIREBASE_ENABLED) {
  fbAuth.onAuthStateChanged(user => {
    if (user) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminApp').classList.remove('hidden');
      loadMenu();
    } else {
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('adminApp').classList.add('hidden');
    }
  });
} else {
  document.getElementById('loginError').textContent =
    'Заполните firebase-config.js (см. инструкцию внутри файла)';
}

document.getElementById('logoutBtn').addEventListener('click', () => fbAuth.signOut());

/* ══════════════════════════════════════════════
   LOAD MENU FROM FIRESTORE  (initial load only)
   After initial load, all mutations update S.menu
   locally — no extra round-trips to Firestore.
══════════════════════════════════════════════ */
async function loadMenu() {
  try {
    const [catsSnap, itemsSnap] = await Promise.all([
      fbDb.collection('categories').orderBy('order').get(),
      fbDb.collection('items').orderBy('order').get(),
    ]);
    S.menu.categories = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    S.menu.items      = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveMenuCache();

    renderSidebar();
    if (S.activeCatId) renderItems(S.activeCatId);
    if (S.menu.categories.length === 0) showInitPrompt();
  } catch (e) {
    const cached = loadMenuCache();
    if (cached) {
      S.menu = cached;
      renderSidebar();
      if (!S.activeCatId && S.menu.categories.length) S.activeCatId = S.menu.categories[0].id;
      if (S.activeCatId) renderItems(S.activeCatId);
    }
    toast('Ошибка загрузки: ' + explainError(e, 'Не удалось загрузить меню'), 'error');
  }
}

/* Fast local re-render — no Firestore round-trip */
function refreshUI() {
  saveMenuCache();
  renderSidebar();
  if (S.activeCatId) renderItems(S.activeCatId);
}

/* ══════════════════════════════════════════════
   INIT DEFAULT MENU
══════════════════════════════════════════════ */
function showInitPrompt() {
  const banner = document.getElementById('initBanner');
  if (banner) banner.style.display = 'flex';
}

document.getElementById('initMenuBtn')?.addEventListener('click', async () => {
  document.getElementById('initBanner').style.display = 'none';
  await uploadInitialMenu();
});

async function uploadInitialMenu() {
  toast('Загрузка стартового меню...', 'default');
  try {
    const batch = fbDb.batch();
    let catOrder = 0;
    for (const cat of INITIAL_CATEGORIES) {
      const ref = fbDb.collection('categories').doc(cat.id);
      batch.set(ref, { name: cat.name, active: cat.active, order: catOrder++ });
    }
    let itemOrder = 0;
    for (const item of INITIAL_ITEMS) {
      const ref = fbDb.collection('items').doc(item.id);
      batch.set(ref, {
        categoryId: item.categoryId, name: item.name, price: item.price,
        weight: item.weight, emoji: item.emoji, imageBase64: null,
        active: item.active, order: itemOrder++,
      });
    }
    await batch.commit();
    toast('Стартовое меню загружено ✓', 'success');
    await loadMenu();
  } catch (e) {
    toast('Ошибка: ' + explainError(e), 'error');
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const items  = S.menu.items.filter(i => i.categoryId === cat.id);
    const active = items.filter(i => i.active).length;
    const li     = document.createElement('div');
    li.className  = 'sidebar-cat-item' + (S.activeCatId === cat.id ? ' active' : '');
    li.dataset.catId = cat.id;
    li.innerHTML = `
      <span class="sidebar-cat-dot ${cat.active ? 'on' : 'off'}"></span>
      <span class="sidebar-cat-name">${cat.name}</span>
      <span class="sidebar-cat-count">${active}/${items.length}</span>
      <div class="sidebar-cat-actions">
        <button class="sidebar-icon-btn red" data-action="del-cat" data-id="${cat.id}" title="Удалить">🗑</button>
      </div>`;
    li.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      selectCategory(cat.id);
    });
    li.querySelector('[data-action="del-cat"]').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Удалить категорию «${cat.name}» и все её позиции?`, () => deleteCategory(cat.id));
    });
    nav.appendChild(li);
  });
}

function selectCategory(catId) {
  S.activeCatId = catId;
  renderSidebar();
  renderItems(catId);
  document.getElementById('welcomeState').classList.add('hidden');
  closeSidebarMobile();
}

/* ══════════════════════════════════════════════
   ITEMS RENDER
══════════════════════════════════════════════ */
function renderItems(catId) {
  const cat   = S.menu.categories.find(c => c.id === catId);
  const items = S.menu.items.filter(i => i.categoryId === catId);
  const grid  = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('topbarTitle').textContent = cat ? cat.name : '';
  document.getElementById('statTotal').textContent   = items.length;
  document.getElementById('statActive').textContent  = items.filter(i => i.active).length;
  document.getElementById('statHidden').textContent  = items.filter(i => !i.active).length;

  grid.innerHTML = '';
  if (!items.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  items.forEach(item => grid.appendChild(createItemCard(item)));
}

function createItemCard(item) {
  const card     = document.createElement('div');
  card.className = 'item-card' + (item.active ? '' : ' inactive');
  card.id        = 'card-' + item.id;

  const src       = itemImg(item);
  const mediaPart = src
    ? `<img class="item-card-img" src="${src}" alt="${item.name}" loading="lazy" />`
    : `<span class="item-card-emoji-big">${item.emoji}</span>`;

  const badgeClass = item.active ? 'active' : 'inactive';
  const badgeText  = item.active ? 'Активно' : 'Скрыто';
  const toggleText = item.active ? '🙈 Скрыть' : '👁 Показать';

  card.innerHTML = `
    <div class="item-card-media">
      ${mediaPart}
      <span class="item-card-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="item-card-body">
      <div class="item-card-name">${item.name}</div>
      <div class="item-card-meta">
        <span class="item-card-price">${item.price} ₽</span>
        <span class="item-card-weight">${item.weight || ''}</span>
      </div>
      <div class="item-card-actions">
        <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${item.id}">✏️ Изменить</button>
        <button class="card-btn card-btn-toggle" data-action="toggle" data-id="${item.id}">${toggleText}</button>
        <button class="card-btn card-btn-delete" data-action="delete" data-id="${item.id}">🗑</button>
      </div>
    </div>`;

  card.querySelector('[data-action="edit"]').addEventListener('click',   () => openItemEdit(item.id));
  card.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleItem(item.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    showConfirm(`Удалить «${item.name}»?`, () => deleteItem(item.id));
  });
  return card;
}

/* ══════════════════════════════════════════════
   ITEM MODAL
══════════════════════════════════════════════ */
document.getElementById('addItemBtn').addEventListener('click', () => {
  if (!S.activeCatId) { toast('Сначала выберите категорию', 'error'); return; }
  openItemModal(null);
});

function openItemModal(item) {
  S.editingItem  = item;
  S.pendingImage = null;
  S.currentEmoji = item?.emoji || '🍽️';

  document.getElementById('itemModalTitle').textContent = item ? 'Редактировать' : 'Добавить позицию';
  document.getElementById('editItemId').value           = item?.id          || '';
  document.getElementById('itemName').value             = item?.name        || '';
  document.getElementById('itemPrice').value            = item?.price       || '';
  document.getElementById('itemWeight').value           = item?.weight      || '';
  document.getElementById('itemDescription').value      = item?.description || '';
  document.getElementById('emojiCustom').value          = item?.emoji       || '🍽️';
  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');
  document.getElementById('imageInput').value           = '';

  populateCategorySelect(item?.categoryId || S.activeCatId);
  renderEmojiGrid();
  updatePhotoPreview(itemImg(item));
  openModal('itemModal');
}

function openItemEdit(id) {
  const item = S.menu.items.find(i => i.id === id);
  if (item) openItemModal(item);
}

function populateCategorySelect(selectedId) {
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const opt       = document.createElement('option');
    opt.value       = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  EMOJI_LIST.forEach(em => {
    const btn       = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'emoji-btn' + (em === S.currentEmoji ? ' active' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      S.currentEmoji = em;
      document.getElementById('emojiCustom').value        = em;
      document.getElementById('previewEmoji').textContent = em;
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

function updatePhotoPreview(src) {
  const emoji = document.getElementById('previewEmoji');
  const img   = document.getElementById('previewImg');
  const rmBtn = document.getElementById('removePhotoBtn');
  if (src) {
    emoji.classList.add('hidden');
    img.src = src;
    img.classList.remove('hidden');
    rmBtn.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.src = '';
    emoji.classList.remove('hidden');
    emoji.textContent = S.currentEmoji;
    rmBtn.classList.add('hidden');
  }
}

document.getElementById('imageInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate size before compressing
  if (file.size > 20 * 1024 * 1024) {
    toast('Файл слишком большой (максимум 20 МБ)', 'error');
    e.target.value = '';
    return;
  }

  const btn = document.getElementById('itemFormSubmit');
  const originalText = btn.textContent;
  btn.textContent = 'Сжимаем фото...';
  btn.disabled    = true;

  try {
    const base64 = await compressImage(file);
    S.pendingImage = base64;          // store compressed base64, not the File
    updatePhotoPreview(base64);
    const kb = Math.round(base64.length * 0.75 / 1024);
    toast(`Фото готово (${kb} КБ) ✓`, 'success');
  } catch {
    toast('Не удалось обработать фото', 'error');
    e.target.value = '';
  } finally {
    btn.textContent = originalText;
    btn.disabled    = false;
  }
});

document.getElementById('removePhotoBtn').addEventListener('click', () => {
  S.pendingImage = null;
  document.getElementById('imageInput').value = '';
  if (S.editingItem) S.editingItem._removeImage = true;
  updatePhotoPreview(null);
});

document.getElementById('emojiCustom').addEventListener('input', e => {
  const v = e.target.value;
  if (v) {
    S.currentEmoji = v;
    document.getElementById('previewEmoji').textContent = v;
  }
});

document.getElementById('itemModalClose').addEventListener('click',  () => closeModal('itemModal'));
document.getElementById('itemModalCancel').addEventListener('click', () => closeModal('itemModal'));

document.getElementById('itemForm').addEventListener('submit', async e => {
  e.preventDefault();

  const name  = document.getElementById('itemName').value.trim();
  const price = document.getElementById('itemPrice').value;
  let valid   = true;
  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');
  if (!name)  { document.getElementById('itemName').classList.add('error');  valid = false; }
  if (!price) { document.getElementById('itemPrice').classList.add('error'); valid = false; }
  if (!valid) return;

  const editId     = document.getElementById('editItemId').value;
  const categoryId = document.getElementById('itemCategory').value;
  const emoji      = document.getElementById('emojiCustom').value.trim() || S.currentEmoji;

  let imageBase64 = S.editingItem?.imageBase64 || null;
  if (S.editingItem?._removeImage) imageBase64 = null;
  if (S.pendingImage !== null)     imageBase64 = S.pendingImage;

  const data = {
    name,
    price:       parseInt(price, 10),
    weight:      document.getElementById('itemWeight').value.trim(),
    emoji,
    categoryId,
    description: document.getElementById('itemDescription').value.trim(),
  };
  // Only include imageBase64 if it changed — avoids sending huge field unnecessarily
  if (imageBase64 !== undefined) data.imageBase64 = imageBase64;

  if (editId) {
    // Optimistic update: patch local state immediately
    const idx = S.menu.items.findIndex(i => i.id === editId);
    if (idx !== -1) S.menu.items[idx] = { ...S.menu.items[idx], ...data };
    closeModal('itemModal');
    refreshUI();
    toast('Позиция обновлена ✓', 'success');
    // Write to Firestore in background
    fbDb.collection('items').doc(editId).update(data).catch(err => {
      toast('Ошибка сохранения: ' + explainError(err), 'error');
      loadMenu(); // reload to restore correct state on error
    });
  } else {
    // Optimistic add: generate temp id, add locally, then confirm with real Firestore id
    const tempId   = 'tmp-' + Date.now();
    const newItem  = { id: tempId, ...data, imageBase64: imageBase64 ?? null, active: true, order: S.menu.items.length };
    S.menu.items.push(newItem);
    closeModal('itemModal');
    refreshUI();
    toast('Позиция добавлена ✓', 'success');
    // Write to Firestore in background, then swap temp id with real id
    fbDb.collection('items').add({ ...data, imageBase64: imageBase64 ?? null, active: true, order: S.menu.items.length - 1 })
      .then(docRef => {
        const idx = S.menu.items.findIndex(i => i.id === tempId);
        if (idx !== -1) S.menu.items[idx].id = docRef.id;
        saveMenuCache();
      })
      .catch(err => {
        toast('Ошибка сохранения: ' + explainError(err), 'error');
        S.menu.items = S.menu.items.filter(i => i.id !== tempId); // rollback
        refreshUI();
      });
  }
});

/* ══════════════════════════════════════════════
   TOGGLE / DELETE ITEM
══════════════════════════════════════════════ */
async function toggleItem(id) {
  try {
    const item = S.menu.items.find(i => i.id === id);
    if (!item) return;
    const newActive = !item.active;
    // Optimistic local update — instant UI response
    item.active = newActive;
    refreshUI();
    await fbDb.collection('items').doc(id).update({ active: newActive });
    toast(newActive ? 'Показано' : 'Скрыто', 'success');
  } catch (e) {
    // Rollback on error
    const item = S.menu.items.find(i => i.id === id);
    if (item) item.active = !item.active;
    refreshUI();
    toast('Ошибка: ' + explainError(e), 'error');
  }
}

async function deleteItem(id) {
  try {
    // Remove from local state instantly
    S.menu.items = S.menu.items.filter(i => i.id !== id);
    refreshUI();
    await fbDb.collection('items').doc(id).delete();
    toast('Позиция удалена', 'success');
  } catch (e) {
    toast('Ошибка: ' + explainError(e), 'error');
    await loadMenu(); // reload on error to restore correct state
  }
}

/* ══════════════════════════════════════════════
   CATEGORY CRUD
══════════════════════════════════════════════ */
document.getElementById('addCategoryBtn').addEventListener('click', () => {
  document.getElementById('catName').value = '';
  openModal('catModal');
});
document.getElementById('catModalClose').addEventListener('click',  () => closeModal('catModal'));
document.getElementById('catModalCancel').addEventListener('click', () => closeModal('catModal'));

document.getElementById('catForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('catName').value.trim();
  if (!name) return;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const id    = 'cat-' + Date.now();
    const order = S.menu.categories.length;
    // Add to local state instantly
    S.menu.categories.push({ id, name, active: true, order });
    refreshUI();
    closeModal('catModal');
    selectCategory(id);
    toast('Категория «' + name + '» создана ✓', 'success');
    await fbDb.collection('categories').doc(id).set({ name, active: true, order });
  } catch (err) {
    toast('Ошибка: ' + explainError(err), 'error');
    await loadMenu(); // reload on error
  } finally {
    btn.disabled = false;
  }
});

async function deleteCategory(id) {
  try {
    const itemsInCat = S.menu.items.filter(i => i.categoryId === id);
    // Remove from local state instantly
    S.menu.categories = S.menu.categories.filter(c => c.id !== id);
    S.menu.items      = S.menu.items.filter(i => i.categoryId !== id);
    if (S.activeCatId === id) {
      S.activeCatId = S.menu.categories[0]?.id || null;
      if (!S.activeCatId) {
        document.getElementById('topbarTitle').textContent = 'Выберите категорию';
        document.getElementById('itemsGrid').innerHTML     = '';
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('welcomeState').classList.remove('hidden');
      }
    }
    refreshUI();
    toast('Категория удалена', 'success');
    // Write to Firestore in background
    const batch = fbDb.batch();
    itemsInCat.forEach(item => batch.delete(fbDb.collection('items').doc(item.id)));
    batch.delete(fbDb.collection('categories').doc(id));
    await batch.commit();
  } catch (e) {
    toast('Ошибка: ' + explainError(e), 'error');
    await loadMenu(); // reload on error
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR MOBILE
══════════════════════════════════════════════ */
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  sidebarOverlay.style.display =
    document.getElementById('sidebar').classList.contains('open') ? 'block' : 'none';
});
sidebarOverlay.addEventListener('click', closeSidebarMobile);
function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  sidebarOverlay.style.display = 'none';
}

/* ══════════════════════════════════════════════
   INITIAL DATA
══════════════════════════════════════════════ */
const INITIAL_CATEGORIES = [
  { id:'lunches',   name:'Комплексные обеды',         active:true },
  { id:'breakfast', name:'Завтраки',                   active:true },
  { id:'soups',     name:'Супы',                       active:true },
  { id:'salads',    name:'Салаты',                     active:true },
  { id:'hot',       name:'Горячее',                    active:true },
  { id:'garnish',   name:'Гарниры',                    active:true },
  { id:'pancakes',  name:'Блинчики',                   active:true },
  { id:'sweet',     name:'Сладкие добавки',            active:true },
  { id:'additions', name:'Добавки',                    active:true },
  { id:'frozen',    name:'Замороженные полуфабрикаты', active:true },
  { id:'drinks',    name:'Напитки',                    active:true },
  { id:'sugar',     name:'Сахар и приборы',            active:true },
];

const INITIAL_ITEMS = [
  {id:'l1', categoryId:'lunches',   name:'Комплексный обед №1 (суп+горячее+салат+компот)', price:320, weight:'600г', emoji:'🍱', active:true},
  {id:'l2', categoryId:'lunches',   name:'Комплексный обед №2 (суп+горячее+хлеб)',         price:270, weight:'500г', emoji:'🥘', active:true},
  {id:'l3', categoryId:'lunches',   name:'Комплексный обед №3 (горячее+гарнир+салат)',     price:290, weight:'550г', emoji:'🍽️',active:true},
  {id:'l4', categoryId:'lunches',   name:'Бизнес-ланч (суп+горячее+гарнир+напиток)',       price:350, weight:'650г', emoji:'🍱', active:true},
  {id:'b1', categoryId:'breakfast', name:'Каша овсяная с маслом',   price:90,  weight:'250г', emoji:'🥣', active:true},
  {id:'b2', categoryId:'breakfast', name:'Омлет с сыром',           price:130, weight:'200г', emoji:'🍳', active:true},
  {id:'b3', categoryId:'breakfast', name:'Сырники со сметаной',     price:150, weight:'250г', emoji:'🥞', active:true},
  {id:'b4', categoryId:'breakfast', name:'Каша гречневая с маслом', price:90,  weight:'250г', emoji:'🥣', active:true},
  {id:'b5', categoryId:'breakfast', name:'Творог со сметаной',      price:120, weight:'200г', emoji:'🥛', active:true},
  {id:'b6', categoryId:'breakfast', name:'Яйца вареные (2 шт)',     price:60,  weight:'120г', emoji:'🥚', active:true},
  {id:'s1', categoryId:'soups',     name:'Борщ со сметаной',             price:140, weight:'300г', emoji:'🍲', active:true},
  {id:'s2', categoryId:'soups',     name:'Щи из свежей капусты',         price:120, weight:'300г', emoji:'🥣', active:true},
  {id:'s3', categoryId:'soups',     name:'Куриный суп с лапшой',         price:130, weight:'300г', emoji:'🍜', active:true},
  {id:'s4', categoryId:'soups',     name:'Солянка мясная',               price:160, weight:'300г', emoji:'🍲', active:true},
  {id:'s5', categoryId:'soups',     name:'Уха рыбная',                   price:150, weight:'300г', emoji:'🐟', active:true},
  {id:'s6', categoryId:'soups',     name:'Гороховый суп с копчёностями', price:135, weight:'300г', emoji:'🫛', active:true},
  {id:'sa1',categoryId:'salads',    name:'Салат «Оливье»',           price:120, weight:'200г', emoji:'🥗', active:true},
  {id:'sa2',categoryId:'salads',    name:'Салат «Цезарь» с курицей', price:180, weight:'220г', emoji:'🥗', active:true},
  {id:'sa3',categoryId:'salads',    name:'Салат «Греческий»',        price:160, weight:'200г', emoji:'🫒', active:true},
  {id:'sa4',categoryId:'salads',    name:'Салат из свежих овощей',   price:100, weight:'200г', emoji:'🥦', active:true},
  {id:'sa5',categoryId:'salads',    name:'Свекольный с чесноком',    price:90,  weight:'180г', emoji:'🥗', active:true},
  {id:'sa6',categoryId:'salads',    name:'Салат «Мимоза»',           price:130, weight:'200г', emoji:'🥗', active:true},
  {id:'h1', categoryId:'hot',       name:'Котлета мясная (2 шт)',         price:160, weight:'180г', emoji:'🍖', active:true},
  {id:'h2', categoryId:'hot',       name:'Куриная грудка запечённая',     price:190, weight:'200г', emoji:'🍗', active:true},
  {id:'h3', categoryId:'hot',       name:'Рыба минтай жареная',           price:170, weight:'200г', emoji:'🐟', active:true},
  {id:'h4', categoryId:'hot',       name:'Голубцы с мясом (2 шт)',        price:200, weight:'300г', emoji:'🫑', active:true},
  {id:'h5', categoryId:'hot',       name:'Пельмени домашние',             price:180, weight:'300г', emoji:'🥟', active:true},
  {id:'h6', categoryId:'hot',       name:'Картофельные зразы с мясом',   price:150, weight:'250г', emoji:'🥔', active:true},
  {id:'h7', categoryId:'hot',       name:'Тефтели в томатном соусе',      price:175, weight:'280г', emoji:'🍝', active:true},
  {id:'g1', categoryId:'garnish',   name:'Картофельное пюре', price:80, weight:'200г', emoji:'🥔', active:true},
  {id:'g2', categoryId:'garnish',   name:'Гречка отварная',   price:70, weight:'200г', emoji:'🌾', active:true},
  {id:'g3', categoryId:'garnish',   name:'Рис отварной',      price:70, weight:'200г', emoji:'🍚', active:true},
  {id:'g4', categoryId:'garnish',   name:'Макароны отварные', price:70, weight:'200г', emoji:'🍝', active:true},
  {id:'g5', categoryId:'garnish',   name:'Капуста тушёная',   price:80, weight:'200г', emoji:'🥬', active:true},
  {id:'g6', categoryId:'garnish',   name:'Перловка с маслом', price:65, weight:'200г', emoji:'🌾', active:true},
  {id:'p1', categoryId:'pancakes',  name:'Блинчики с творогом (3 шт)', price:130, weight:'250г', emoji:'🥞', active:true},
  {id:'p2', categoryId:'pancakes',  name:'Блинчики с мясом (3 шт)',    price:150, weight:'270г', emoji:'🥞', active:true},
  {id:'p3', categoryId:'pancakes',  name:'Блинчики с вареньем (3 шт)', price:110, weight:'230г', emoji:'🫐', active:true},
  {id:'p4', categoryId:'pancakes',  name:'Блинчики с капустой (3 шт)', price:120, weight:'250г', emoji:'🥞', active:true},
  {id:'sw1',categoryId:'sweet',     name:'Компот домашний',   price:60, weight:'200мл',emoji:'🫙', active:true},
  {id:'sw2',categoryId:'sweet',     name:'Кисель ягодный',    price:55, weight:'200мл',emoji:'🫐', active:true},
  {id:'sw3',categoryId:'sweet',     name:'Пирожок с яблоком', price:65, weight:'100г', emoji:'🥐', active:true},
  {id:'sw4',categoryId:'sweet',     name:'Пирожок с вишней',  price:65, weight:'100г', emoji:'🍒', active:true},
  {id:'sw5',categoryId:'sweet',     name:'Кекс шоколадный',   price:80, weight:'120г', emoji:'🧁', active:true},
  {id:'ad1',categoryId:'additions', name:'Хлеб белый (2 куска)',    price:20, weight:'60г', emoji:'🍞', active:true},
  {id:'ad2',categoryId:'additions', name:'Хлеб чёрный (2 куска)',   price:20, weight:'60г', emoji:'🍞', active:true},
  {id:'ad3',categoryId:'additions', name:'Сметана (порция)',         price:40, weight:'50г', emoji:'🥛', active:true},
  {id:'ad4',categoryId:'additions', name:'Масло сливочное (порция)', price:30, weight:'20г', emoji:'🧈', active:true},
  {id:'fr1',categoryId:'frozen',    name:'Пельмени замороженные 0.5 кг',         price:250, weight:'500г', emoji:'🥟', active:true},
  {id:'fr2',categoryId:'frozen',    name:'Голубцы замороженные 1 кг',            price:380, weight:'1кг',  emoji:'🫑', active:true},
  {id:'fr3',categoryId:'frozen',    name:'Котлеты замороженные 0.5 кг',          price:290, weight:'500г', emoji:'🍖', active:true},
  {id:'fr4',categoryId:'frozen',    name:'Блинчики с мясом замороженные 0.5 кг', price:280, weight:'500г', emoji:'🥞', active:true},
  {id:'d1', categoryId:'drinks',    name:'Чай чёрный',             price:50, weight:'200мл',emoji:'🍵', active:true},
  {id:'d2', categoryId:'drinks',    name:'Кофе чёрный',            price:70, weight:'150мл',emoji:'☕', active:true},
  {id:'d3', categoryId:'drinks',    name:'Морс ягодный',           price:60, weight:'200мл',emoji:'🫐', active:true},
  {id:'d4', categoryId:'drinks',    name:'Вода питьевая 0.5л',     price:45, weight:'500мл',emoji:'💧', active:true},
  {id:'d5', categoryId:'drinks',    name:'Сок в ассортименте 0.2л',price:55, weight:'200мл',emoji:'🧃', active:true},
  {id:'su1',categoryId:'sugar',     name:'Сахар порционный (2 пак.)', price:9,  weight:'10г', emoji:'🍬', active:true},
  {id:'su2',categoryId:'sugar',     name:'Вилка одноразовая',         price:5,  weight:'',    emoji:'🍴', active:true},
  {id:'su3',categoryId:'sugar',     name:'Ложка одноразовая',         price:5,  weight:'',    emoji:'🥄', active:true},
  {id:'su4',categoryId:'sugar',     name:'Нож одноразовый',           price:5,  weight:'',    emoji:'🔪', active:true},
  {id:'su5',categoryId:'sugar',     name:'Салфетки (5 шт)',           price:10, weight:'',    emoji:'🧻', active:true},
  {id:'su6',categoryId:'sugar',     name:'Контейнер',                 price:9,  weight:'',    emoji:'📦', active:true},
];
