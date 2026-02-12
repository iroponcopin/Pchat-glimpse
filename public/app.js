const el = (id) => document.getElementById(id);

// --- GLOBAL STATE ---
let me = null;
let socket = null;
let currentConversationId = null;
let currentFriend = null;
let isLoadingHistory = false;
let earliestMessageTime = null;

let localStream = null;
let peerConnection = null;
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- LOCALIZATION ---
const langDict = {
  en: {
    login_title: "pChat Login", login_btn: "Sign In", or: "or", register_btn: "Create Account",
    login_id_ph: "Login ID", password_ph: "Password", new_id_ph: "New ID", display_name_ph: "Display Name",
    edit: "Edit", messages_title: "Messages", search_ph: "Search",
    back: "Back", empty_chat: "iMessage", imessage_ph: "iMessage",
    new_message: "New Message", cancel: "Cancel", to: "To:",
    incoming_call: "FaceTime Video", decline: "Decline", accept: "Accept"
  },
  ja: {
    login_title: "pChatログイン", login_btn: "サインイン", or: "または", register_btn: "アカウント作成",
    login_id_ph: "ログインID", password_ph: "パスワード", new_id_ph: "新規ID", display_name_ph: "表示名",
    edit: "編集", messages_title: "メッセージ", search_ph: "検索",
    back: "戻る", empty_chat: "メッセージなし", imessage_ph: "iMessage",
    new_message: "新規メッセージ", cancel: "キャンセル", to: "宛先:",
    incoming_call: "FaceTimeビデオ", decline: "拒否", accept: "応答"
  }
};

function updateLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  const langKey = browserLang.startsWith('ja') ? 'ja' : 'en';
  const dict = langDict[langKey];
  document.querySelectorAll('[data-lang]').forEach(elem => {
    const key = elem.getAttribute('data-lang');
    if (dict[key]) elem.textContent = dict[key];
  });
  document.querySelectorAll('[data-placeholder]').forEach(elem => {
    const key = elem.getAttribute('data-placeholder');
    if (dict[key]) elem.placeholder = dict[key];
  });
}

// --- BOOT ---
async function boot() {
  updateLanguage();
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.user) {
      me = data.user;
      initSocket();
      showMain();
      loadFriends();
    } else {
      el('auth').classList.remove('hidden');
    }
  } catch(e) { console.error(e); }
}

function initSocket() {
  socket = io();
  socket.on("message_received", (msg) => {
    if (msg.conversationId === currentConversationId) {
      appendMessage(msg, true);
    } else {
      loadFriends(); 
    }
  });
  socket.on("incoming_call", async ({ fromUserId, offer }) => {
    el('incomingCallModal').classList.remove('hidden');
    window.pendingOffer = offer;
    window.pendingCallerId = fromUserId;
  });
  socket.on("call_answered", async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on("remote_ice_candidate", async ({ candidate }) => {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
  socket.on("call_ended", endCallCleanup);
}

// --- UI ---
function showMain() {
  el('auth').classList.add('hidden');
  el('main').classList.remove('hidden');
  el('meName').textContent = me.displayName;
  el('meId').textContent = `@${me.loginId}`;

  // SEARCH: Filter existing friends
  el('filter_friends').onkeyup = (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.friend-row').forEach(row => {
      row.style.display = row.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
    });
  };

  // NEW MESSAGE: Search for new users
  el('btn_compose').onclick = () => {
    el('searchModal').classList.remove('hidden');
    el('search_q').value = '';
    el('searchResults').innerHTML = '';
    el('search_q').focus();
  };
  el('btn_close_search').onclick = () => el('searchModal').classList.add('hidden');

  el('search_q').onkeyup = async (e) => {
    const q = e.target.value;
    if (q.length < 1) { el('searchResults').innerHTML = ''; return; }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    el('searchResults').innerHTML = data.users.length === 0 ? 
      '<div style="padding:15px; color:#888;">No users found</div>' :
      data.users.map(u => `
        <div class="result-item">
          <span>${u.displayName} <small style="color:#888">@${u.loginId}</small></span>
          <button onclick="addFriend('${u.id}')" style="color:var(--blue); font-weight:bold;">Add</button>
        </div>
      `).join('');
  };

  el('btn_back').onclick = () => {
    el('main').classList.remove('chat-active');
    currentConversationId = null;
  };
  el('btn_send').onclick = sendMessage;
  el('msg_input').onkeydown = (e) => { if(e.key === 'Enter') sendMessage(); };
  el('btn_photo').onclick = () => el('file_input').click();
  el('file_input').onchange = uploadPhoto;
}

window.addFriend = async (id) => {
  await fetch("/api/friends/request", { method: "POST", headers: {'Content-Type':'application/json'}, body: JSON.stringify({ toUserId: id }) });
  el('searchModal').classList.add('hidden');
  alert("Request Sent");
};

async function loadFriends() {
  const res = await fetch("/api/friends");
  const data = await res.json();
  if(data.incoming.length > 0) {
    data.incoming.forEach(r => {
       if(confirm(`Accept friend request from ${r.displayName}?`)) {
          fetch("/api/friends/respond", { method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requestId: r.requestId, accept: true }) }).then(loadFriends);
       }
    });
  }
  el('friends').innerHTML = data.friends.map(f => {
    const initials = f.displayName.substring(0,2).toUpperCase();
    return `
    <div class="friend-row" onclick="openChat('${f.id}', '${f.displayName}')">
      <div class="avatar">${initials}</div>
      <div class="friend-info">
        <div class="top-line"><span class="friend-name">${f.displayName}</span></div>
        <span class="friend-msg">Tap to chat</span>
      </div>
    </div>`;
  }).join('');
}

window.openChat = async (friendId, name) => {
  currentFriend = { id: parseInt(friendId), name };
  el('main').classList.add('chat-active');
  document.querySelectorAll('.friend-row').forEach(r => r.classList.remove('active'));
  el('chatTitle').textContent = name;
  el('headerAvatar').textContent = name.substring(0,2).toUpperCase();
  el('btn_start_call').classList.remove('hidden');
  
  const res = await fetch("/api/conversations/open", { method: "POST", headers: {'Content-Type':'application/json'}, body: JSON.stringify({ friendUserId: friendId }) });
  const data = await res.json();
  currentConversationId = data.conversationId;
  el('messages').innerHTML = '';
  earliestMessageTime = null;
  await loadMessages(currentConversationId);
  el('messages').onscroll = () => {
    if (el('messages').scrollTop === 0 && !isLoadingHistory) loadMessages(currentConversationId, earliestMessageTime);
  };
};

async function loadMessages(convId, beforeTime = null) {
  if (isLoadingHistory) return;
  isLoadingHistory = true;
  const url = `/api/messages?conversationId=${convId}` + (beforeTime ? `&before=${beforeTime}` : '');
  const res = await fetch(url);
  const data = await res.json();
  const box = el('messages');
  const oldHeight = box.scrollHeight;
  const oldTop = box.scrollTop;

  if (data.messages.length > 0) {
    earliestMessageTime = data.messages[data.messages.length - 1].sentAt; 
    const frag = document.createDocumentFragment();
    for (let i = data.messages.length - 1; i >= 0; i--) frag.appendChild(createBubble(data.messages[i]));
    
    if (beforeTime) {
      box.insertBefore(frag, box.firstChild);
      box.scrollTop = box.scrollHeight - oldHeight + oldTop;
    } else {
      box.appendChild(frag);
      box.scrollTop = box.scrollHeight;
      const empty = box.querySelector('.empty-state');
      if(empty) empty.remove();
    }
  }
  isLoadingHistory = false;
}

function createBubble(msg) {
  const wrap = document.createElement('div');
  const isMine = msg.senderUserId === me.id;
  wrap.className = `bubble-wrap ${isMine ? 'mine' : 'theirs'}`;
  let content = msg.msgType === 'image' ? `<img src="${msg.mediaUrl}" onclick="window.open(this.src)" />` : msg.body;
  wrap.innerHTML = `<div class="bubble">${content}</div>`;
  return wrap;
}

function appendMessage(msg, autoScroll) {
  const box = el('messages');
  const empty = box.querySelector('.empty-state');
  if(empty) empty.remove();
  const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
  box.appendChild(createBubble(msg));
  if (autoScroll && (isNearBottom || msg.senderUserId === me.id)) box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const input = el('msg_input');
  if(!input.value) return;
  socket.emit("send_message", { conversationId: currentConversationId, text: input.value });
  input.value = '';
}

async function uploadPhoto() {
  const file = el('file_input').files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetch("/api/upload", { method:"POST", body:formData });
  const data = await res.json();
  if(data.url) socket.emit("send_message", { conversationId: currentConversationId, msgType: 'image', mediaUrl: data.url });
  el('file_input').value = '';
}

// Call Logic
el('btn_start_call').onclick = () => startCall(true, currentFriend.id);
el('btn_answer').onclick = async () => {
    el('incomingCallModal').classList.add('hidden');
    await startCall(false, window.pendingCallerId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(window.pendingOffer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("call_answer", { toUserId: window.pendingCallerId, answer });
};
el('btn_decline').onclick = () => el('incomingCallModal').classList.add('hidden');
el('btn_end_call').onclick = () => {
  const targetId = currentFriend ? currentFriend.id : window.pendingCallerId;
  socket.emit("end_call", { toUserId: targetId });
  endCallCleanup();
};

async function startCall(isCaller, friendId) {
  el('callOverlay').classList.remove('hidden');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    el('localVideo').srcObject = localStream;
  } catch(e) { alert("Camera/Mic error: " + e.message); return; }
  peerConnection = new RTCPeerConnection(RTC_CONFIG);
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  peerConnection.ontrack = (e) => el('remoteVideo').srcObject = e.streams[0];
  peerConnection.onicecandidate = (e) => { if (e.candidate) socket.emit("ice_candidate", { toUserId: friendId, candidate: e.candidate }); };
  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("call_user", { toUserId: friendId, offer });
  }
}

function endCallCleanup() {
  el('callOverlay').classList.add('hidden');
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  peerConnection = null; localStream = null;
}

el('btn_login').onclick = async () => {
  const res = await fetch("/api/login", { method: "POST", headers: {'Content-Type':'application/json'}, body: JSON.stringify({ loginId: el('l_login').value, password: el('l_pass').value }) });
  const data = await res.json();
  if(data.user) { me = data.user; initSocket(); showMain(); loadFriends(); } else alert(data.error);
};
el('btn_register').onclick = async () => {
  const res = await fetch("/api/register", { method: "POST", headers: {'Content-Type':'application/json'}, body: JSON.stringify({ loginId: el('r_login').value, displayName: el('r_name').value, password: el('r_pass').value }) });
  const data = await res.json();
  if(data.user) { me = data.user; initSocket(); showMain(); loadFriends(); } else alert(data.error);
};

boot();
