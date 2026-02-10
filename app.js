const els = (id) => document.getElementById(id);

let me = null;
let socket = null;

let currentConversationId = null;
let currentFriend = null;
let lastRenderedMessageId = null;

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
  els("auth").classList.remove("hidden");
  els("main").classList.add("hidden");
}

function showMain() {
  els("auth").classList.add("hidden");
  els("main").classList.remove("hidden");
}

function setMsg(id, text) {
  els(id).textContent = text || "";
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.senderUserId === me.id ? "mine" : "theirs");
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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshFriends() {
  const data = await api("/api/friends");
  renderIncoming(data.incoming);
  renderFriends(data.friends);
}

function renderIncoming(list) {
  const box = els("incoming");
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<p class="hint">No incoming requests.</p>`;
    return;
  }
  list.forEach(r => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>
        <div><b>${escapeHtml(r.displayName)}</b></div>
        <small>${escapeHtml(r.loginId)}</small>
      </div>
      <div class="actions">
        <button data-a="accept">Accept</button>
        <button data-a="reject">Reject</button>
      </div>
    `;
    row.querySelector('[data-a="accept"]').onclick = async () => {
      await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ requestId: r.requestId, accept: true }) });
      await refreshFriends();
    };
    row.querySelector('[data-a="reject"]').onclick = async () => {
      await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ requestId: r.requestId, accept: false }) });
      await refreshFriends();
    };
    box.appendChild(row);
  });
}

const presenceCache = new Map(); // userId -> { online, lastSeenAt }

function renderFriends(list) {
  const box = els("friends");
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<p class="hint">No friends yet. Search and add.</p>`;
    return;
  }

  list.forEach(f => {
    const p = presenceCache.get(f.id) || { online: false, lastSeenAt: null };
    const dot = `<span class="onlineDot ${p.online ? "online" : ""}"></span>`;
    const status = p.online ? "Online" : (p.lastSeenAt ? `Last seen ${new Date(p.lastSeenAt).toLocaleString()}` : "Offline");

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>
        <div>${dot}<b>${escapeHtml(f.displayName)}</b></div>
        <small>${escapeHtml(f.loginId)} • ${escapeHtml(status)}</small>
      </div>
      <div class="actions">
        <button>Chat</button>
      </div>
    `;
    row.querySelector("button").onclick = () => openChatWithFriend(f);
    box.appendChild(row);
  });
}

async function searchUsers() {
  const q = els("search_q").value.trim();
  if (!q) return;
  const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  const box = els("results");
  box.innerHTML = "";
  if (!data.users.length) {
    box.innerHTML = `<p class="hint">No results.</p>`;
    return;
  }

  data.users.forEach(u => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>
        <div><b>${escapeHtml(u.displayName)}</b></div>
        <small>${escapeHtml(u.loginId)}</small>
      </div>
      <div class="actions">
        <button>Add</button>
      </div>
    `;
    row.querySelector("button").onclick = async () => {
      await api("/api/friends/request", { method: "POST", body: JSON.stringify({ toUserId: u.id }) });
      setMsg("l_msg", "");
      setMsg("r_msg", "");
      alert("Friend request sent.");
    };
    box.appendChild(row);
  });
}

async function openChatWithFriend(friend) {
  currentFriend = friend;
  els("chat_title").textContent = `Chat with ${friend.displayName}`;
  els("typing").textContent = "";

  const conv = await api("/api/conversations/open", { method: "POST", body: JSON.stringify({ friendUserId: friend.id }) });
  currentConversationId = conv.conversationId;
  lastRenderedMessageId = null;
  await loadMessages();
}

async function loadMessages() {
  if (!currentConversationId) return;
  const data = await api(`/api/messages?conversationId=${currentConversationId}&limit=50`);
  const box = els("messages");
  box.innerHTML = "";

  data.messages.forEach(m => {
    box.appendChild(renderMessage(m));
    lastRenderedMessageId = m.id;
  });

  box.scrollTop = box.scrollHeight;

  // Mark read up to last message (if any)
  if (lastRenderedMessageId) {
    socket.emit("mark_read", { conversationId: currentConversationId, upToMessageId: lastRenderedMessageId });
  }
}

function connectSocket() {
  socket = io({
    // cookies carry the session automatically
  });

  socket.on("connect", () => {
    // ok
  });

  socket.on("presence_update", (p) => {
    presenceCache.set(p.userId, { online: p.online, lastSeenAt: p.lastSeenAt });
    refreshFriends().catch(() => {});
    if (currentFriend && currentFriend.id === p.userId) {
      els("chat_status").textContent = p.online ? "Online" : "Offline";
    }
  });

  socket.on("friend_request_update", () => {
    refreshFriends().catch(() => {});
  });

  socket.on("typing_update", (t) => {
    if (!currentFriend || !currentConversationId) return;
    if (t.conversationId !== currentConversationId) return;
    if (t.userId !== currentFriend.id) return;
    els("typing").textContent = t.isTyping ? `${currentFriend.displayName} is typing…` : "";
  });

  socket.on("message_received", (m) => {
    // Only render if it's the currently open conversation
    if (m.conversationId !== currentConversationId) return;

    const box = els("messages");
    box.appendChild(renderMessage(m));
    box.scrollTop = box.scrollHeight;
    lastRenderedMessageId = m.id;

    // If I am viewing, mark read
    if (m.senderUserId !== me.id) {
      socket.emit("mark_read", { conversationId: currentConversationId, upToMessageId: m.id });
    }
  });

  socket.on("read_receipt_update", (r) => {
    if (r.conversationId !== currentConversationId) return;
    // simplest approach: reload messages (MVP)
    loadMessages().catch(() => {});
  });
}

let typingTimer = null;
function emitTyping(isTyping) {
  if (!socket || !currentConversationId) return;
  socket.emit("typing", { conversationId: currentConversationId, isTyping });
}

async function sendMessage() {
  const text = els("msg_input").value.trim();
  if (!text || !currentConversationId) return;
  els("msg_input").value = "";
  emitTyping(false);

  socket.emit("send_message", { conversationId: currentConversationId, text });
}

async function boot() {
  try {
    const data = await api("/api/me");
    if (!data.user) return showAuth();

    me = data.user;
    els("me").textContent = `Logged in as: ${me.displayName} (${me.loginId})`;
    showMain();
    await refreshFriends();
    connectSocket();
  } catch {
    showAuth();
  }
}

// --- UI bindings ---
els("btn_register").onclick = async () => {
  try {
    setMsg("r_msg", "");
    const loginId = els("r_login").value.trim();
    const password = els("r_pass").value;
    const displayName = els("r_name").value.trim();

    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ loginId, password, displayName })
    });

    me = data.user;
    els("me").textContent = `Logged in as: ${me.displayName} (${me.loginId})`;
    showMain();
    await refreshFriends();
    connectSocket();
  } catch (e) {
    setMsg("r_msg", e.message);
  }
};

els("btn_login").onclick = async () => {
  try {
    setMsg("l_msg", "");
    const loginId = els("l_login").value.trim();
    const password = els("l_pass").value;

    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password })
    });

    me = data.user;
    els("me").textContent = `Logged in as: ${me.displayName} (${me.loginId})`;
    showMain();
    await refreshFriends();
    connectSocket();
  } catch (e) {
    setMsg("l_msg", e.message);
  }
};

els("btn_logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
};

els("btn_search").onclick = () => searchUsers().catch(err => alert(err.message));
els("search_q").addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchUsers().catch(err => alert(err.message));
});

els("btn_send").onclick = () => sendMessage().catch(err => alert(err.message));

els("msg_input").addEventListener("input", () => {
  if (!currentConversationId) return;
  emitTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => emitTyping(false), 1200);
});

els("msg_input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage().catch(err => alert(err.message));
});

boot();
