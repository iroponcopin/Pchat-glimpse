// public/app.js
const el = (id) => document.getElementById(id);

// -------------------------
// i18n (browser language + localStorage override)
// -------------------------
const I18N = {
  en: {
    app_name: "pChat",
    tagline: "iMessage-style UI • 1:1 DM • friends • receipts",
    register: "Register",
    create_account: "Create account",
    login: "Login",
    login_btn: "Login",
    logout: "Logout",
    search_btn: "Search",
    incoming: "Incoming Requests",
    friends: "Friends",
    results: "Search Results",
    select_friend: "Select a friend",
    send: "Send",

    // placeholders
    login_id_ph: "Login ID (username/email)",
    login_id_ph2: "Login ID",
    display_name_ph: "Display name (optional)",
    password_new_ph: "Password (min 8 chars)",
    password_ph: "Password",
    search_ph: "Search users…",
    message_ph: "Type a message…",

    // runtime strings
    no_incoming: "No incoming requests.",
    no_friends: "No friends yet. Search and add.",
    no_results: "No results.",
    friend_request_sent: "Friend request sent.",
    select_friend_first: "Select a friend first.",
    typing: (name) => `${name} is typing…`,
    chat_with: (name) => `Chat with ${name}`,
    online: "Online",
    offline: "Offline",
    last_seen: (dt) => `Last seen ${dt}`
  },
  ja: {
    app_name: "pChat",
    tagline: "iMessage風UI • 1:1 DM • フレンド • 既読",
    register: "登録",
    create_account: "アカウント作成",
    login: "ログイン",
    login_btn: "ログイン",
    logout: "ログアウト",
    search_btn: "検索",
    incoming: "受信リクエスト",
    friends: "フレンド",
    results: "検索結果",
    select_friend: "相手を選択してください",
    send: "送信",

    // placeholders
    login_id_ph: "ログインID（ユーザー名/メール）",
    login_id_ph2: "ログインID",
    display_name_ph: "表示名（任意）",
    password_new_ph: "パスワード（8文字以上）",
    password_ph: "パスワード",
    search_ph: "ユーザー検索…",
    message_ph: "メッセージを入力…",

    // runtime strings
    no_incoming: "受信リクエストはありません。",
    no_friends: "フレンドがいません。検索して追加してください。",
    no_results: "該当なし。",
    friend_request_sent: "フレンド申請を送信しました。",
    select_friend_first: "先に相手を選択してください。",
    typing: (name) => `${name} が入力中…`,
    chat_with: (name) => `${name} とチャット`,
    online: "オンライン",
    offline: "オフライン",
    last_seen: (dt) => `最終オンライン: ${dt}`
  }
};

function detectLang() {
  const saved = localStorage.getItem("ui_lang");
  if (saved && I18N[saved]) return saved;

  const langs = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || "en"];

  const primary = (langs[0] || "en").toLowerCase();
  if (primary.startsWith("ja")) return "ja";
  return "en";
}

let LANG = detectLang();

function t(key, ...args) {
  const dict = I18N[LANG] || I18N.en;
  const v = dict[key] ?? I18N.en[key] ?? key;
  return (typeof v === "function") ? v(...args) : v;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(n => {
    n.textContent = t(n.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(n => {
    n.setAttribute("placeholder", t(n.getAttribute("data-i18n-ph")));
  });
}

function toggleLang() {
  LANG = (LANG === "ja") ? "en" : "ja";
  localStorage.setItem("ui_lang", LANG);
  applyI18n();

  // re-render dynamic sections with translated runtime strings
  refreshFriends().catch(() => {});
  refreshChatHeaderStatus();
}

// -------------------------
// App state
// -------------------------
let me = null;
let socket = null;

let currentConversationId = null;
let currentFriend = null;
let lastRenderedMessageId = null;

const presenceCache = new Map(); // userId -> { online, lastSeenAt }

// -------------------------
// API helper
// -------------------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// -------------------------
// View helpers
// -------------------------
function showAuth() {
  el("auth").style.display = "flex";
  el("main").style.display = "none";
}

function showMain() {
  el("auth").style.display = "none";
  el("main").style.display = "flex";
}

function setMsg(id, text) {
  el(id).textContent = text || "";
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bubbleNode(m) {
  const div = document.createElement("div");
  div.className = "bubble " + (m.senderUserId === me.id ? "out" : "in");

  const body = m.deleted ? "<i>(deleted)</i>" : escapeHtml(m.body);
  const seen = (m.senderUserId === me.id && m.readAt) ? `Seen ${fmtTime(m.readAt)}` : "";

  div.innerHTML = `
    <div>${body}</div>
    <div class="meta">
      <span>${fmtTime(m.sentAt)}</span>
      <span>${seen}</span>
    </div>
  `;
  return div;
}

// -------------------------
// Friends UI
// -------------------------
async function refreshFriends() {
  const data = await api("/api/friends");
  renderIncoming(data.incoming || []);
  renderFriends(data.friends || []);
}

function renderIncoming(list) {
  const box = el("incoming");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">${escapeHtml(t("no_incoming"))}</div>`;
    return;
  }

  list.forEach(r => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName">${escapeHtml(r.displayName)}</div>
        <div class="itemMeta">${escapeHtml(r.loginId)}</div>
      </div>
      <div class="itemBtns">
        <button class="miniBtn" data-a="accept" type="button">Accept</button>
        <button class="miniBtn" data-a="reject" type="button">Reject</button>
      </div>
    `;

    // localise button labels
    row.querySelector('[data-a="accept"]').textContent = (LANG === "ja") ? "承認" : "Accept";
    row.querySelector('[data-a="reject"]').textContent = (LANG === "ja") ? "拒否" : "Reject";

    row.querySelector('[data-a="accept"]').onclick = async () => {
      await api("/api/friends/respond", {
        method: "POST",
        body: JSON.stringify({ requestId: r.requestId, accept: true })
      });
      await refreshFriends();
    };

    row.querySelector('[data-a="reject"]').onclick = async () => {
      await api("/api/friends/respond", {
        method: "POST",
        body: JSON.stringify({ requestId: r.requestId, accept: false })
      });
      await refreshFriends();
    };

    box.appendChild(row);
  });
}

function renderFriends(list) {
  const box = el("friends");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">${escapeHtml(t("no_friends"))}</div>`;
    return;
  }

  list.forEach(f => {
    const p = presenceCache.get(f.id) || { online: false, lastSeenAt: null };
    const dotClass = p.online ? "dot online" : "dot";

    const status = p.online
      ? t("online")
      : (p.lastSeenAt ? t("last_seen", new Date(p.lastSeenAt).toLocaleString()) : t("offline"));

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName"><span class="${dotClass}"></span>${escapeHtml(f.displayName)}</div>
        <div class="itemMeta">${escapeHtml(f.loginId)} • ${escapeHtml(status)}</div>
      </div>
      <div class="itemBtns">
        <button class="miniBtn" data-a="chat" type="button">Chat</button>
      </div>
    `;

    row.querySelector('[data-a="chat"]').textContent = (LANG === "ja") ? "チャット" : "Chat";
    row.querySelector('[data-a="chat"]').onclick = () => openChatWithFriend(f);

    box.appendChild(row);
  });
}

// -------------------------
// Search users UI
// -------------------------
async function searchUsers() {
  const q = el("search_q").value.trim();
  if (!q) return;

  const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  const box = el("results");
  box.innerHTML = "";

  if (!data.users?.length) {
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">${escapeHtml(t("no_results"))}</div>`;
    return;
  }

  data.users.forEach(u => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName">${escapeHtml(u.displayName)}</div>
        <div class="itemMeta">${escapeHtml(u.loginId)}</div>
      </div>
      <div class="itemBtns">
        <button class="miniBtn" data-a="add" type="button">Add</button>
      </div>
    `;

    row.querySelector('[data-a="add"]').textContent = (LANG === "ja") ? "追加" : "Add";
    row.querySelector('[data-a="add"]').onclick = async () => {
      await api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ toUserId: u.id })
      });
      alert(t("friend_request_sent"));
    };

    box.appendChild(row);
  });
}

// -------------------------
// Chat
// -------------------------
function refreshChatHeaderStatus() {
  if (!currentFriend) return;
  const p = presenceCache.get(currentFriend.id);
  el("chatStatus").textContent = p?.online ? t("online") : t("offline");
}

async function openChatWithFriend(friend) {
  currentFriend = friend;
  el("chatTitle").textContent = t("chat_with", friend.displayName);
  el("typing").textContent = "";

  const conv = await api("/api/conversations/open", {
    method: "POST",
    body: JSON.stringify({ friendUserId: friend.id })
  });

  currentConversationId = conv.conversationId;
  lastRenderedMessageId = null;

  await loadMessages();
  refreshChatHeaderStatus();
}

async function loadMessages() {
  if (!currentConversationId) return;

  const data = await api(`/api/messages?conversationId=${currentConversationId}&limit=60`);
  const box = el("messages");
  box.innerHTML = "";

  (data.messages || []).forEach(m => {
    box.appendChild(bubbleNode(m));
    lastRenderedMessageId = m.id;
  });

  box.scrollTop = box.scrollHeight;

  if (lastRenderedMessageId && socket) {
    socket.emit("mark_read", { conversationId: currentConversationId, upToMessageId: lastRenderedMessageId });
  }
}

// -------------------------
// Socket.io
// -------------------------
function connectSocket() {
  socket = io();

  socket.on("presence_update", (p) => {
    presenceCache.set(p.userId, { online: p.online, lastSeenAt: p.lastSeenAt });
    refreshFriends().catch(() => {});
    if (currentFriend && currentFriend.id === p.userId) {
      refreshChatHeaderStatus();
    }
  });

  socket.on("friend_request_update", () => {
    refreshFriends().catch(() => {});
  });

  socket.on("typing_update", (tEvt) => {
    if (!currentFriend || !currentConversationId) return;
    if (tEvt.conversationId !== currentConversationId) return;
    if (tEvt.userId !== currentFriend.id) return;
    el("typing").textContent = tEvt.isTyping ? t("typing", currentFriend.displayName) : "";
  });

  socket.on("message_received", (m) => {
    if (m.conversationId !== currentConversationId) return;

    const box = el("messages");
    box.appendChild(bubbleNode(m));
    box.scrollTop = box.scrollHeight;
    lastRenderedMessageId = m.id;

    if (m.senderUserId !== me.id) {
      socket.emit("mark_read", { conversationId: currentConversationId, upToMessageId: m.id });
    }
  });

  socket.on("read_receipt_update", (r) => {
    if (r.conversationId !== currentConversationId) return;
    loadMessages().catch(() => {});
  });
}

// -------------------------
// Composer
// -------------------------
let typingTimer = null;

function emitTyping(isTyping) {
  if (!socket || !currentConversationId) return;
  socket.emit("typing", { conversationId: currentConversationId, isTyping });
}

async function sendMessage() {
  if (!currentConversationId) return alert(t("select_friend_first"));
  const input = el("msg_input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  emitTyping(false);

  socket.emit("send_message", { conversationId: currentConversationId, text });
}

function bindComposer() {
  const input = el("msg_input");

  el("btn_send").onclick = () => sendMessage().catch(e => alert(e.message));

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage().catch(err => alert(err.message));
  });

  input.addEventListener("input", () => {
    if (!currentConversationId) return;
    emitTyping(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => emitTyping(false), 1200);
  });
}

// -------------------------
// Auth / navbar
// -------------------------
function fillMe() {
  el("meName").textContent = me?.displayName || "—";
  el("meId").textContent = me ? `@${me.loginId}` : "—";
}

function bindAuth() {
  el("btn_register").onclick = async () => {
    try {
      setMsg("r_msg", "");
      const loginId = el("r_login").value.trim();
      const password = el("r_pass").value;
      const displayName = el("r_name").value.trim();

      const data = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ loginId, password, displayName })
      });

      me = data.user;
      showMain();
      fillMe();
      await refreshFriends();
      connectSocket();
    } catch (e) {
      setMsg("r_msg", e.message);
    }
  };

  el("btn_login").onclick = async () => {
    try {
      setMsg("l_msg", "");
      const loginId = el("l_login").value.trim();
      const password = el("l_pass").value;

      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ loginId, password })
      });

      me = data.user;
      showMain();
      fillMe();
      await refreshFriends();
      connectSocket();
    } catch (e) {
      setMsg("l_msg", e.message);
    }
  };

  el("btn_logout").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    location.reload();
  };

  el("btn_search").onclick = () => searchUsers().catch(e => alert(e.message));
  el("search_q").addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchUsers().catch(err => alert(err.message));
  });
}

// -------------------------
// Language toggle buttons
// -------------------------
function bindLangToggle() {
  const b1 = el("btn_lang");
  const b2 = el("btn_lang_main");
  if (b1) b1.onclick = toggleLang;
  if (b2) b2.onclick = toggleLang;
}

// -------------------------
// Boot
// -------------------------
async function boot() {
  applyI18n();
  bindLangToggle();
  bindAuth();
  bindComposer();

  try {
    const data = await api("/api/me");
    if (!data.user) {
      showAuth();
      return;
    }
    me = data.user;
    showMain();
    fillMe();
    await refreshFriends();
    connectSocket();
  } catch {
    showAuth();
  }
}

boot();
