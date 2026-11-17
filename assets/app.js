/* 🐱 Наши хотелки — статичный вишлист для двоих.
   Данные хранятся в приватном репозитории GitHub через API.
   Ключ доступа вводится один раз и лежит только в localStorage устройства. */

const CFG = {
  owner: "roman-ttrn",
  repo: "nashi-hotelski-data",
  path: "data.json",
  branch: "main",
};

/* Пользователи и хеши паролей (пароли в код не попадают). */
const USERS = {
  roma:      { login: "roma",      name: "Рома",     emoji: "🐱",
               hash: "4afb0be72b98f3f3d3465c3f0d3798c8d42fb6b3a27153102652c448fc9ded17" },
  nastyulik: { login: "nastyulik", name: "Настюлик", emoji: "🐈",
               hash: "6e39c5404d275e111bca09f680a961846f246ac9b5cf3e240dbe160e2d994501" },
};

const PRIORITIES = {
  dream: { label: "💖 Мечта",      order: 0 },
  high:  { label: "✨ Очень хочу", order: 1 },
  nice:  { label: "🌸 Приятно",    order: 2 },
};

const LS_TOKEN = "nh_token";
const SS_USER  = "nh_user";

let state = {
  me: null,        // логин
  token: null,
  sha: null,       // sha файла данных (для записи)
  data: { gifts: [] },
  busy: false,
};

/* ---------- утилиты ---------- */
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2600);
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function apiUrl() {
  return `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.path}`;
}

function apiHeaders() {
  const h = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (state.token) h["Authorization"] = `Bearer ${state.token}`;
  return h;
}

/* ---------- GitHub ---------- */
async function ghRead() {
  const r = await fetch(apiUrl() + "?ref=" + CFG.branch, { headers: apiHeaders() });
  if (r.status === 404) return null;              // файла ещё нет — не страшно
  if (r.status === 401 || r.status === 403) throw new Error("auth");
  if (!r.ok) throw new Error("read:" + r.status);
  const j = await r.json();
  return { sha: j.sha, data: JSON.parse(b64decode(j.content) || '{"gifts":[]}') };
}

async function ghWrite(obj, message) {
  const body = {
    message,
    content: b64encode(JSON.stringify(obj, null, 2)),
    branch: CFG.branch,
  };
  if (state.sha) body.sha = state.sha;
  const r = await fetch(apiUrl(), {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401 || r.status === 403) throw new Error("auth");
  if (r.status === 409) throw new Error("conflict");
  if (!r.ok) throw new Error("write:" + r.status);
  const j = await r.json();
  state.sha = j.content.sha;
}

/* ---------- загрузка/сохранение ---------- */
async function loadData(silent) {
  try {
    const res = await ghRead();
    if (res) { state.data = res.data; state.sha = res.sha; }
    else { state.data = { gifts: [] }; state.sha = null; }
    $("banner").hidden = true;
    render();
  } catch (e) {
    if (!silent) console.warn(e);
    $("banner").hidden = false;
  }
}

async function saveData(message) {
  if (state.busy) return;
  state.busy = true;
  try {
    await ghWrite(state.data, message);
    toast("Сохранено 💾");
  } catch (e) {
    if (e.message === "auth") { $("banner").hidden = false; openSync(); }
    else if (e.message === "conflict") { toast("Кто-то сохранил раньше — обновляю"); await loadData(true); }
    else toast("Не получилось сохранить 😿");
    console.warn(e);
  } finally {
    state.busy = false;
  }
}

/* ---------- отрисовка ---------- */
function giftCard(g, editable) {
  const p = PRIORITIES[g.priority] || PRIORITIES.high;
  const cls = ["gift"];
  if (g.priority === "dream") cls.push("gift--dream");
  if (g.done) cls.push("gift--done");

  const link = g.link
    ? `<a class="gift__link" href="${esc(g.link)}" target="_blank" rel="noopener">🔗 ссылка</a>`
    : "";
  const price = g.price ? `<span class="gift__price">${esc(g.price)}</span>` : "";
  const desc = g.desc ? `<p class="gift__desc">${esc(g.desc)}</p>` : "";

  const actions = editable
    ? `<div class="gift__actions">
         <button class="btn btn--ghost" data-act="edit" data-id="${esc(g.id)}">✏️</button>
         <button class="btn btn--ghost" data-act="done" data-id="${esc(g.id)}">${g.done ? "↩️" : "🎁"}</button>
         <button class="btn btn--ghost" data-act="del" data-id="${esc(g.id)}">🗑️</button>
       </div>`
    : "";

  return `<article class="${cls.join(" ")}">
    <div class="gift__head">
      <h3 class="gift__title">${esc(g.title)}</h3>
      <span class="gift__badge" title="${esc(p.label)}">${p.label.split(" ")[0]}</span>
    </div>
    ${desc}
    <div class="gift__meta">${price} ${link}</div>
    ${actions}
  </article>`;
}

function render() {
  const me = state.me;
  const other = me === "roma" ? "nastyulik" : "roma";
  const mine = [], theirs = [];

  for (const g of state.data.gifts || []) {
    (g.owner === me ? mine : theirs).push(g);
  }
  const byPriority = (a, b) =>
    (PRIORITIES[a.priority]?.order ?? 9) - (PRIORITIES[b.priority]?.order ?? 9) ||
    (b.createdAt || 0) - (a.createdAt || 0);
  mine.sort(byPriority); theirs.sort(byPriority);

  const myName = USERS[me].name;
  const theirName = USERS[other].name;

  $("who").textContent = `${USERS[me].emoji} ${myName}`;
  $("title-mine").textContent = `Хотелки ${myName} 💗`;
  $("title-theirs").textContent = `Хотелки ${theirName} 💞`;

  $("list-mine").innerHTML = mine.length
    ? mine.map((g) => giftCard(g, true)).join("")
    : `<div class="empty"><span>🐈</span>Пока пусто. Добавь первую хотелку!</div>`;
  $("list-theirs").innerHTML = theirs.length
    ? theirs.map((g) => giftCard(g, false)).join("")
    : `<div class="empty"><span>🐾</span>${esc(theirName)} ещё ничего не загадал(а)</div>`;
}

/* ---------- логин ---------- */
async function doLogin(ev) {
  ev.preventDefault();
  const login = $("login-user").value;
  const pass = $("login-pass").value;
  const hash = await sha256hex(pass);
  if (!USERS[login] || hash !== USERS[login].hash) {
    $("login-error").textContent = "Пароль не подошёл 😿 попробуй ещё раз";
    return;
  }
  $("login-error").textContent = "";
  state.me = login;
  state.token = localStorage.getItem(LS_TOKEN) || null;
  sessionStorage.setItem(SS_USER, login);
  enterApp();
  await loadData();
  if (!state.token) openSync();
}

function enterApp() {
  $("view-login").hidden = true;
  $("view-app").hidden = false;
}

function doLogout() {
  sessionStorage.removeItem(SS_USER);
  state.me = null;
  $("view-app").hidden = true;
  $("view-login").hidden = false;
  $("login-pass").value = "";
}

/* ---------- модалки ---------- */
function openForm(gift) {
  $("form-title").textContent = gift ? "Правим хотелку" : "Новая хотелка";
  $("gift-id").value = gift?.id || "";
  $("gift-title").value = gift?.title || "";
  $("gift-desc").value = gift?.desc || "";
  $("gift-link").value = gift?.link || "";
  $("gift-price").value = gift?.price || "";
  $("gift-priority").value = gift?.priority || "high";
  $("form-error").textContent = "";
  $("modal-form").hidden = false;
  setTimeout(() => $("gift-title").focus(), 50);
}

function closeModals() {
  $("modal-form").hidden = true;
  $("modal-sync").hidden = true;
}

function openSync() {
  $("sync-token").value = "";
  $("sync-error").textContent = "";
  $("modal-sync").hidden = false;
}

async function saveGift(ev) {
  ev.preventDefault();
  const id = $("gift-id").value;
  const title = $("gift-title").value.trim();
  if (!title) { $("form-error").textContent = "Напиши, что хочется 🙂"; return; }

  state.data.gifts = state.data.gifts || [];
  if (id) {
    const g = state.data.gifts.find((x) => x.id === id && x.owner === state.me);
    if (g) {
      g.title = title;
      g.desc = $("gift-desc").value.trim();
      g.link = $("gift-link").value.trim();
      g.price = $("gift-price").value.trim();
      g.priority = $("gift-priority").value;
    }
  } else {
    state.data.gifts.push({
      id: crypto.randomUUID(),
      owner: state.me,
      title,
      desc: $("gift-desc").value.trim(),
      link: $("gift-link").value.trim(),
      price: $("gift-price").value.trim(),
      priority: $("gift-priority").value,
      done: false,
      createdAt: Date.now(),
    });
  }
  closeModals();
  render();
  await saveData(id ? "Обновил(а) хотелку" : "Добавил(а) хотелку");
}

async function onListClick(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  const gifts = state.data.gifts || [];
  const g = gifts.find((x) => x.id === id && x.owner === state.me);
  if (!g) return;

  if (act === "edit") { openForm(g); return; }
  if (act === "done") { g.done = !g.done; render(); await saveData(g.done ? "Подарено 🎁" : "Вернул(а) в хотелки"); return; }
  if (act === "del") {
    if (!confirm("Удалить хотелку?")) return;
    state.data.gifts = gifts.filter((x) => x.id !== id);
    render();
    await saveData("Удалил(а) хотелку");
  }
}

async function saveToken() {
  const t = $("sync-token").value.trim();
  if (!t) { $("sync-error").textContent = "Вставь ключ 🙂"; return; }
  state.token = t;
  try {
    const res = await ghRead();
    localStorage.setItem(LS_TOKEN, t);
    if (res) { state.data = res.data; state.sha = res.sha; }
    closeModals();
    $("banner").hidden = true;
    render();
    toast("Ключ сохранён 🔑");
  } catch (e) {
    state.token = null;
    $("sync-error").textContent = "Ключ не подошёл или нет прав 😿";
    console.warn(e);
  }
}

/* ---------- запуск ---------- */
function bind() {
  $("login-form").addEventListener("submit", doLogin);
  $("btn-logout").addEventListener("click", doLogout);
  $("btn-add").addEventListener("click", () => openForm(null));
  $("btn-cancel").addEventListener("click", closeModals);
  $("gift-form").addEventListener("submit", saveGift);
  $("list-mine").addEventListener("click", onListClick);
  $("btn-token").addEventListener("click", openSync);
  $("banner-token").addEventListener("click", openSync);
  $("btn-sync-save").addEventListener("click", saveToken);
  $("btn-sync-later").addEventListener("click", closeModals);
  $("modal-form").addEventListener("click", (e) => { if (e.target.id === "modal-form") closeModals(); });
  $("modal-sync").addEventListener("click", (e) => { if (e.target.id === "modal-sync") closeModals(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });
}

function boot() {
  bind();
  const logged = sessionStorage.getItem(SS_USER);
  if (logged && USERS[logged]) {
    state.me = logged;
    state.token = localStorage.getItem(LS_TOKEN) || null;
    enterApp();
    loadData(true).then(() => { if (!state.token) openSync(); });
  }
}

boot();
