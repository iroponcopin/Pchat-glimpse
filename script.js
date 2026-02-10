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

// タブ切り替え
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
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ loginId, password })
        });
        const data = await res.json();
        if(data.success) {
            console.log("Login success:", data.user);
            initApp(data.user);
        } else {
            authError.textContent = data.error || 'ログインに失敗しました。';
        }
    } catch (err) {
        console.error(err);
        authError.textContent = 'サーバーエラーが発生しました。';
    }
};

// 新規登録処理
registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const loginId = document.getElementById('reg-id').value;
    const displayName = document.getElementById('reg-name').value;
    const password = document.getElementById('reg-pass').value;

    try {
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
            authError.textContent = data.error || '登録に失敗しました。';
        }
    } catch (err) {
        console.error(err);
        authError.textContent = 'サーバーエラーが発生しました。';
    }
};

function initApp(user) {
    currentUser = user;
    
    // 画面切り替え（ここが重要）
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    document.getElementById('my-display-name').textContent = user.displayName;
    
    // ソケット接続
    socket.emit('join', user.id);
    
    // 友達リスト読み込み (完了後に自動チャット判定を行う)
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
    try {
        const res = await fetch(`/api/users/search?q=${e.target.value}&userId=${currentUser.id}`);
        const users = await res.json();
        searchResults.innerHTML = users.map(u => `
            <div class="list-item" onclick="sendRequest('${u.loginId}')">
                <span>${u.displayName} (@${u.loginId})</span>
                <button class="cta-button" style="padding:4px 8px; font-size:12px;">追加</button>
            </div>
        `).join('');
    } catch (err) {
        console.error("Search error", err);
    }
};

function sendRequest(targetLoginId) {
    socket.emit('friend_request_send', { fromId: currentUser.id, toLoginId: targetLoginId });
    alert('友達リクエストを送信しました');
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchContainer.style.display = 'none';
}

async function loadFriends() {
    try {
        const res = await fetch(`/api/friends?userId=${currentUser.id}`);
        const friends = await res.json();
        
        // リスト描画
        friendList.innerHTML = friends.map(f => {
            if(f.friendStatus === 'pending' && f.requesterId !== currentUser.id) {
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
                const isOnline = f.status === 'online';
                const activeClass = (f.id === currentChatFriendId) ? 'active' : '';
                return `
                    <li class="list-item ${activeClass}" onclick="openChat('${f.id}', '${f.displayName}')">
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

        // ★ 自動チャット開始ロジック (リストロード後に実行)
        checkAutoOpenChat(friends);

    } catch (err) {
        console.error("Load friends error", err);
    }
}

// 自動的に特定の相手とのチャットを開く
function checkAutoOpenChat(friends) {
    if (currentChatFriendId) return; // 既に開いている場合は何もしない

    let targetFriend = null;

    // Aruでログインしている場合、Mimiを探す
    if (currentUser.loginId === 'aru1011') {
        targetFriend = friends.find(f => f.loginId === 'mimi1011' && f.friendStatus === 'accepted');
    } 
    // Mimiでログインしている場合、Aruを探す
    else if (currentUser.loginId === 'mimi1011') {
        targetFriend = friends.find(f => f.loginId === 'aru1011' && f.friendStatus === 'accepted');
    }

    if (targetFriend) {
        console.log("Auto opening chat with:", targetFriend.displayName);
        openChat(targetFriend.id, targetFriend.displayName);
    }
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
    messageContainer.innerHTML = ''; 
    
    // リストの選択状態を更新（再描画）
    // 注意: 無限ループを防ぐため loadFriends を直接呼ばず、DOM操作だけでactiveクラスを付け替えるのがベストだが
    // 簡易実装として再取得する。ただし checkAutoOpenChat は currentChatFriendId があるので発動しない。
    const res = await fetch(`/api/friends?userId=${currentUser.id}`);
    const friends = await res.json();
    // ここでリスト再描画
    friendList.innerHTML = friends.map(f => {
        if (f.friendStatus === 'accepted') {
            const isOnline = f.status === 'online';
            const activeClass = (f.id === currentChatFriendId) ? 'active' : '';
            return `
                <li class="list-item ${activeClass}" onclick="openChat('${f.id}', '${f.displayName}')">
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

    // 履歴読み込み
    try {
        const msgRes = await fetch(`/api/messages?userId=${currentUser.id}&friendId=${friendId}`);
        const messages = await msgRes.json();
        messages.forEach(appendMessage);
        scrollToBottom();
    } catch(err) {
        console.error("Load messages error", err);
    }
};

messageForm.onsubmit = (e) => {
    e.preventDefault();
    const text = messageInput.value;
    if(!text) return;
    
    socket.emit('message_send', { fromId: currentUser.id, toId: currentChatFriendId, content: text });
    messageInput.value = '';
    socket.emit('typing', { fromId: currentUser.id, toId: currentChatFriendId, isTyping: false });
};

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

// --- Socket イベント ---
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
    loadFriends(); 
});

socket.on('presence_update', ({ userId, status }) => {
    if(userId === currentChatFriendId) {
        document.getElementById('chat-presence').textContent = status === 'online' ? 'オンライン' : 'オフライン';
    }
    // 画面全体をリロードすると入力中などに邪魔になるため、
    // 本来はDOM操作でステータスだけ変えるべきだが、簡易的にリロードする
    loadFriends();
});

socket.on('typing_update', ({ userId, isTyping }) => {
    if (userId === currentChatFriendId) {
        typingIndicator.style.display = isTyping ? 'block' : 'none';
    }
});
