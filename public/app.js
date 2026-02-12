const el = (id) => document.getElementById(id);
let me = null;
let socket = null;
let currentConversationId = null;
let currentFriend = null;

// Scroll & Pagination / スクロールとページネーション
let isLoadingHistory = false;
let earliestMessageTime = null;

// WebRTC
let localStream = null;
let peerConnection = null;
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- Boot ---
async function boot() {
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
}

function initSocket() {
  socket = io();

  // Receive Message / メッセージ受信
  socket.on("message_received", (msg) => {
    if (msg.conversationId === currentConversationId) {
      appendMessage(msg, true); // true = auto-scroll if at bottom
    }
  });

  // Call Signaling / 通話シグナリング
  socket.on("incoming_call", async ({ fromUserId, offer }) => {
    if (confirm("Incoming Call / 着信があります。応答しますか？")) {
      await startCall(false, fromUserId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("call_answer", { toUserId: fromUserId, answer });
    }
  });

  socket.on("call_answered", async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("remote_ice_candidate", async ({ candidate }) => {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });

  socket.on("call_ended", endCallCleanup);
}

// --- UI Actions ---
function showMain() {
  el('auth').classList.add('hidden');
  el('main').classList.remove('hidden');
  el('meName').textContent = me.displayName;
  el('meId').textContent = `@${me.loginId}`;

  el('btn_logout').onclick = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.reload();
  };

  // Search
  el('btn_search').onclick = async () => {
    const q = el('search_q').value;
    const res = await fetch(`/api/users/search?q=${q}`);
    const data = await res.json();
    el('searchResults').innerHTML = data.users.map(u => `
      <div style="padding:5px; border-bottom:1px solid #333; display:flex; justify-content:space-between;">
        <span>${u.displayName}</span>
        <button onclick="addFriend('${u.id}')" class="chipBtn" style="padding:2px 8px;">Add</button>
      </div>
    `).join('');
  };
}

window.addFriend = async (id) => {
  await fetch("/api/friends/request", {
    method: "POST", headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ toUserId: id })
  });
  alert("Request sent / 送信しました");
};

async function loadFriends() {
  const res = await fetch("/api/friends");
  const data = await res.json();
  
  // Pending Requests
  if(data.incoming.length > 0) {
    data.incoming.forEach(r => {
      if(confirm(`Accept friend request from ${r.displayName}?`)) {
        fetch("/api/friends/respond", {
          method:"POST", headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ requestId: r.requestId, accept: true })
        }).then(loadFriends);
      }
    });
  }

  // Active Friends
  el('friends').innerHTML = data.friends.map(f => `
    <div onclick="openChat('${f.id}', '${f.displayName}')" 
         style="padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer; margin-bottom:5px;">
      ${f.displayName}
    </div>
  `).join('');
}

// --- Chat Logic ---
window.openChat = async (friendId, name) => {
  currentFriend = { id: parseInt(friendId), name };
  el('chatTitle').textContent = name;
  el('btn_start_call').classList.remove('hidden');
  
  const res = await fetch("/api/conversations/open", {
    method: "POST", headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ friendUserId: friendId })
  });
  const data = await res.json();
  currentConversationId = data.conversationId;
  
  el('messages').innerHTML = '';
  earliestMessageTime = null;
  await loadMessages(currentConversationId);
  
  // Setup Scroll Listener for History
  el('messages').onscroll = () => {
    if (el('messages').scrollTop === 0 && !isLoadingHistory) {
      loadMessages(currentConversationId, earliestMessageTime);
    }
  };
};

// Messaging & Smart Scroll
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
    // Update cursor for next fetch
    earliestMessageTime = data.messages[data.messages.length - 1].sentAt; 

    // Create bubbles (reverse because API returns newest first, but we want oldest at top of this batch)
    // APIは新しい順で返しますが、このバッチ内では古いものを上にしたいので逆順にします
    const frag = document.createDocumentFragment();
    // Use standard loop to prepend correctly
    for (let i = data.messages.length - 1; i >= 0; i--) {
      frag.appendChild(createBubble(data.messages[i]));
    }

    if (beforeTime) {
      // Prepend to top (Loading History)
      box.insertBefore(frag, box.firstChild);
      // Maintain scroll position / スクロール位置を維持
      box.scrollTop = box.scrollHeight - oldHeight + oldTop;
    } else {
      // First Load
      box.appendChild(frag);
      box.scrollTop = box.scrollHeight;
    }
  }
  isLoadingHistory = false;
}

function createBubble(msg) {
  const div = document.createElement('div');
  const isMine = msg.senderUserId === me.id;
  div.className = `bubble ${isMine ? 'mine' : 'theirs'}`;
  
  if (msg.msgType === 'image') {
    div.innerHTML = `<img src="${msg.mediaUrl}" onclick="window.open(this.src)" />`;
  } else {
    div.textContent = msg.body;
  }
  return div;
}

function appendMessage(msg, autoScroll) {
  const box = el('messages');
  const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
  box.appendChild(createBubble(msg));
  if (autoScroll && (isNearBottom || msg.senderUserId === me.id)) {
    box.scrollTop = box.scrollHeight;
  }
}

// Send Actions
el('btn_send').onclick = () => {
  const txt = el('msg_input').value;
  if (!txt) return;
  socket.emit("send_message", { conversationId: currentConversationId, text: txt });
  el('msg_input').value = '';
};

el('btn_photo').onclick = () => el('file_input').click();
el('file_input').onchange = async () => {
  const file = el('file_input').files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append("photo", file);
  
  const res = await fetch("/api/upload", { method:"POST", body:formData });
  const data = await res.json();
  if(data.url) {
    socket.emit("send_message", { conversationId: currentConversationId, msgType: 'image', mediaUrl: data.url });
  }
  el('file_input').value = '';
};

// --- WebRTC Implementation ---
el('btn_start_call').onclick = () => startCall(true, currentFriend.id);
el('btn_end_call').onclick = () => {
  socket.emit("end_call", { toUserId: currentFriend.id });
  endCallCleanup();
};

async function startCall(isCaller, friendId) {
  el('callOverlay').classList.remove('hidden');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    el('localVideo').srcObject = localStream;
  } catch(e) {
    alert("Camera/Mic error: " + e.message);
    return;
  }

  peerConnection = new RTCPeerConnection(RTC_CONFIG);
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  peerConnection.ontrack = (e) => {
    el('remoteVideo').srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) socket.emit("ice_candidate", { toUserId: friendId, candidate: e.candidate });
  };

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
  peerConnection = null;
  localStream = null;
}

// Login/Register bindings omitted for brevity, logic same as before but using the API routes.
el('btn_login').onclick = async () => {
  const res = await fetch("/api/login", { 
    method: "POST", headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ loginId: el('l_login').value, password: el('l_pass').value })
  });
  const data = await res.json();
  if(data.user) { me = data.user; initSocket(); showMain(); loadFriends(); }
  else alert(data.error);
};

el('btn_register').onclick = async () => {
  const res = await fetch("/api/register", { 
    method: "POST", headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ loginId: el('r_login').value, displayName: el('r_name').value, password: el('r_pass').value })
  });
  const data = await res.json();
  if(data.user) { me = data.user; initSocket(); showMain(); loadFriends(); }
  else alert(data.error);
};

// Start
boot();
