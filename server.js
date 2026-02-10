const socket = io();
let currentUser = null;
let currentChatFriendId = null;
let typingTimeout = null;

// --- 認証画面の処理 ---
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');

// タブ切り替え処理
document.getElementById('tab-login').onclick = (e) => {
    e.target.classList.add('active');
    document.getElementById('tab-register').classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    authError.textContent = '';
};
document.getElementById('tab-register').onclick = (e) => {
    e.target.classList.add('active');
    document.getElementById('tab-login').classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    authError.textContent = '';
};

// ログイン処理
loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const loginId = document.getElementById('login-id').value;
    const password = document.getElementById('login-pass').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ loginId, password })
    });
    const data = await res.json();
    if(data.success) {
        initApp(data.user);
    } else {
        authError.textContent = 'IDまたはパスワードが間違っています。';
    }
};

// 新規登録処理
registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const loginId = document.getElementById('reg-id').value;
    const displayName = document.getElementById('reg-name').value;
    const password = document.getElementById('reg-pass').value;

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ loginId, displayName, password })
    });
    const data = await res.json();
    if(data.success) {
        alert('登録が完了しました！ログインしてください。');
        document.getElementById('tab-login').click();
    } else {
        authError.textContent = 'このIDは既に使用されています。';
    }
};

function initApp(user) {
    currentUser = user;
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    document.getElementById('my-display-name').textContent = user.displayName;
    
    // ソケット接続
    socket.emit('join', user.id);
    loadFriends();
}

// --- 友達システム ---
const friendList = document.getElementById('friend-list');
const addFriendBtn = document.getElementById('add-friend-btn');
const searchContainer = document.getElementById('search-bar-container');
const searchInput = document.getElementById('user-search-input');
const searchResults = document.getElementById('search-results');

addFriendBtn.onclick = () => {
    searchContainer.style.display = searchContainer.style.display === 'none' ? 'block' : 'none';
};

searchInput.oninput = async (e) => {
    if(e.target.value.length < 1) return;
    const res = await fetch(`/api/users/search?q=${e.target.value}&userId=${currentUser.id}`);
    const users = await res.json();
    searchResults.innerHTML = users.map(u => `
        <div class="list-item" onclick="sendRequest('${u.loginId}')">
            <span>${u.displayName} (@${u.loginId})</span>
            <button class="cta-button" style="padding:4px 8px; font-size:12px;">追加</button>
        </div>
    `).join('');
};

function sendRequest(targetLoginId) {
    socket.emit('friend_request_send', { fromId: currentUser.id, toLoginId: targetLoginId });
    alert('友達リクエストを送信しました');
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchContainer.style.display = 'none';
}

async function loadFriends() {
    const res = await fetch(`/api/friends?userId=${currentUser.id}`);
    const friends = await res.json();
    
    // 表示タブによるフィルタリング（今回は簡易的にすべて表示し、HTML側で分ける想定だが、ここではリスト一括生成）
    // 実装を簡単にするため、リクエストと友達を区別して表示
    friendList.innerHTML = friends.map(f => {
        if(f.friendStatus === 'pending' && f.requesterId !== currentUser.id) {
            // 受信したリクエスト
            return `
                <li class="list-item" style="background: rgba(255,200,0,0.1);">
                    <div>
                        <span style="font-weight:bold;">${f.displayName}</span> からのリクエスト
                    </div>
                    <div>
                        <button class="cta-button" style="padding:5px 10px; font-size:12px;" onclick="respondFriend('${f.id}', '${f.requesterId}', 'accept')">承認</button>
                    </div>
                </li>
            `;
        } else if (f.friendStatus === 'accepted') {
            // 友達リスト
            const isOnline = f.status === 'online';
            return `
                <li class="list-item" onclick="openChat('${f.id}', '${f.displayName}')">
                    <div class="user-profile">
                        <div class="avatar-circle">${f.displayName[0]}</div>
                        <div>
                            <div>${f.displayName}</div>
                            <div style="font-size:11px; color:${isOnline ? '#34c759' : 'gray'};">
                                ${isOnline ? 'オンライン' : 'オフライン'}
                            </div>
                        </div>
                    </div>
                    <div class="status-dot ${isOnline ? 'online' : ''}"></div>
                </li>
            `;
        }
        return '';
    }).join('');
}

window.respondFriend = (requestId, friendId, action) => {
    socket.emit('friend_request_respond', { requestId, action, userId: currentUser.id, friendId });
};

// --- チャットシステム ---
const chatInterface = document.getElementById('chat-interface');
const noChatMsg = document.getElementById('no-chat-selected');
const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const typingIndicator = document.getElementById('typing-indicator');

window.openChat = async (friendId, friendName) => {
    currentChatFriendId = friendId;
    document.getElementById('chat-with-name').textContent = friendName;
    noChatMsg.style.display = 'none';
    chatInterface.style.display = 'flex';
    messageContainer.innerHTML = ''; // 前のチャットをクリア
    
    // 履歴の読み込み
    const res = await fetch(`/api/messages?userId=${currentUser.id}&friendId=${friendId}`);
    const messages = await res.json();
    messages.forEach(appendMessage);
    scrollToBottom();
};

messageForm.onsubmit = (e) => {
    e.preventDefault();
    const text = messageInput.value;
    if(!text) return;
    
    socket.emit('message_send', { fromId: currentUser.id, toId: currentChatFriendId, content: text });
    messageInput.value = '';
    socket.emit('typing', { fromId: currentUser.id, toId: currentChatFriendId, isTyping: false });
};

// 入力中インジケーターのロジック
messageInput.oninput = () => {
    socket.emit('typing', { fromId: currentUser.id, toId: currentChatFriendId, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { fromId: currentUser.id, toId: currentChatFriendId, isTyping: false });
    }, 1200);
};

function appendMessage(msg) {
    const div = document.createElement('div');
    const isMine = msg.senderId === currentUser.id;
    div.className = `message-bubble ${isMine ? 'sent' : 'received'}`;
    div.textContent = msg.content;
    messageContainer.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// --- Socket イベント受信 ---
socket.on('message_received', (msg) => {
    if (msg.senderId === currentChatFriendId || msg.senderId === currentUser.id) {
        appendMessage(msg);
    }
});

socket.on('message_sent', (msg) => {
    appendMessage(msg);
});

socket.on('friend_list_update', () => {
    loadFriends();
});

socket.on('friend_request_received', () => {
    loadFriends(); // リクエストを表示するためにリロード
});

socket.on('presence_update', ({ userId, status }) => {
    // 今チャットしている相手ならステータス表示を更新
    if(userId === currentChatFriendId) {
        document.getElementById('chat-presence').textContent = status === 'online' ? 'オンライン' : 'オフライン';
    }
    loadFriends(); // リストの●の色を更新
});

socket.on('typing_update', ({ userId, isTyping }) => {
    if (userId === currentChatFriendId) {
        typingIndicator.style.display = isTyping ? 'block' : 'none';
    }
});
