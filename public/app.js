// public/app.js
const el = (id) => document.getElementById(id);

let me = null;
let socket = null;

let currentConversationId = null;
let currentFriend = null;
let lastRenderedMessageId = null;

const presenceCache = new Map(); // userId -> { online, lastSeenAt }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

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

async function refreshFriends() {
  const data = await api("/api/friends");
  renderIncoming(data.incoming || []);
  renderFriends(data.friends || []);
}

function renderIncoming(list) {
  const box = el("incoming");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">No incoming requests.</div>`;
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
        <button class="miniBtn" data-a="accept">Accept</button>
        <button class="miniBtn" data-a="reject">Reject</button>
      </div>
    `;

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
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">No friends yet. Search and add.</div>`;
    return;
  }

  list.forEach(f => {
    const p = presenceCache.get(f.id) || { online: false, lastSeenAt: null };
    const dotClass = p.online ? "dot online" : "dot";
    const status = p.online ? "Online" : (p.lastSeenAt ? `Last seen ${new Date(p.lastSeenAt).toLocaleString()}` : "Offline");

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName"><span class="${dotClass}"></span>${escapeHtml(f.displayName)}</div>
        <div class="itemMeta">${escapeHtml(f.loginId)} • ${escapeHtml(status)}</div>
      </div>
      <div class="itemBtns">
        <button class="miniBtn" data-a="chat">Chat</button>
      </div>
    `;

    row.querySelector('[data-a="chat"]').onclick = () => openChatWithFriend(f);
    box.appendChild(row);
  });
}

async function searchUsers() {
  const q = el("search_q").value.trim();
  if (!q) return;

  const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  const box = el("results");
  box.innerHTML = "";

  if (!data.users?.length) {
    box.innerHTML = `<div style="color:rgba(255,255,255,.55); font-size:13px;">No results.</div>`;
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
        <button class="miniBtn" data-a="add">Add</button>
      </div>
    `;

    row.querySelector('[data-a="add"]').onclick = async () => {
      await api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ toUserId: u.id })
      });
      alert("Friend request sent.");
    };

    box.appendChild(row);
  });
}

async function openChatWithFriend(friend) {
  currentFriend = friend;
  el("chatTitle").textContent = `Chat with ${friend.displayName}`;
  el("typing").textContent = "";

  const conv = await api("/api/conversations/open", {
    method: "POST",
    body: JSON.stringify({ friendUserId: friend.id })
  });

  currentConversationId = conv.conversationId;
  lastRenderedMessageId = null;

  await loadMessages();

  const p = presenceCache.get(friend.id);
  el("chatStatus").textContent = p?.online ? "Online" : "Offline";
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

function connectSocket() {
  socket = io();

  socket.on("presence_update", (p) => {
    presenceCache.set(p.userId, { online: p.online, lastSeenAt: p.lastSeenAt });
    refreshFriends().catch(() => {});
    if (currentFriend && currentFriend.id === p.userId) {
      el("chatStatus").textContent = p.online ? "Online" : "Offline";
    }
  });

  socket.on("friend_request_update", () => {
    refreshFriends().catch(() => {});
  });

  socket.on("typing_update", (t) => {
    if (!currentFriend || !currentConversationId) return;
    if (t.conversationId !== currentConversationId) return;
    if (t.userId !== currentFriend.id) return;
    el("typing").textContent = t.isTyping ? `${currentFriend.displayName} is typing…` : "";
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

let typingTimer = null;
function emitTyping(isTyping) {
  if (!socket || !currentConversationId) return;
  socket.emit("typing", { conversationId: currentConversationId, isTyping });
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

async function sendMessage() {
  if (!currentConversationId) return alert("Select a friend first.");
  const input = el("msg_input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  emitTyping(false);

  socket.emit("send_message", { conversationId: currentConversationId, text });
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

function fillMe() {
  el("meName").textContent = me?.displayName || "—";
  el("meId").textContent = me ? `@${me.loginId}` : "—";
}

async function boot() {
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
