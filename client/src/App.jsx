import { useEffect, useState } from 'react';
import axios from 'axios';
import { useStore } from './store/useStore.js';
import { useI18n } from './i18n/index.js';
import { useSocket } from './hooks/useSocket.js';
import AuthForm from './components/AuthForm.jsx';
import ConversationList from './components/ConversationList.jsx';
import ChatView from './components/ChatView.jsx';

function App() {
    const { currentUser, setCurrentUser, toast } = useStore();
    const [loading, setLoading] = useState(true);
    useI18n(); // subscribe to locale changes
    useSocket(); // establish socket connection

    useEffect(() => {
        axios
            .get('/api/auth/me')
            .then(({ data }) => setCurrentUser(data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [setCurrentUser]);

    if (loading) {
        return (
            <div className="auth-container" style={{ flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>Glimpse pChat</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Loading…</div>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <>
                <AuthForm />
                {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
            </>
        );
    }

    return (
        <>
            <div className="app-layout">
                <ConversationList />
                <ChatView />
            </div>
            {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
        </>
    );
}

export default App;
