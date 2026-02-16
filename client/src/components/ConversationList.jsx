import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore.js';
import { useI18n } from '../i18n/index.js';

export default function ConversationList() {
    const { t, formatRelativeTime } = useI18n();
    const {
        conversations,
        setConversations,
        activeConversation,
        setActiveConversation,
        currentUser,
        connections,
        setConnections,
        pendingRequests,
        setPendingRequests,
        showToast,
    } = useStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [activeTab, setActiveTab] = useState('chats');

    // Load conversations
    useEffect(() => {
        axios.get('/api/conversations').then((res) => setConversations(res.data)).catch(() => { });
        axios.get('/api/connections').then((res) => setConnections(res.data)).catch(() => { });
        axios.get('/api/connections/pending').then((res) => setPendingRequests(res.data)).catch(() => { });
    }, []);

    // Search
    const handleSearch = useCallback(async (q) => {
        setSearchQuery(q);
        if (q.trim().length < 1) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const { data } = await axios.get(`/api/users/search?q=${encodeURIComponent(q)}`);
            setSearchResults(data);
        } catch {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    }, []);

    const handleSendRequest = async (userId) => {
        try {
            await axios.post('/api/connections/request', { recipientId: userId });
            showToast(t('connections.requestSent'), 'success');
            setSearchResults((prev) => prev.map((u) => u.id === userId ? { ...u, _sent: true } : u));
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            showToast(t(key), 'error');
        }
    };

    const handleAcceptRequest = async (connectionId) => {
        try {
            await axios.post('/api/connections/respond', { connectionId, action: 'accept' });
            // Refresh
            const [conns, pend] = await Promise.all([
                axios.get('/api/connections'),
                axios.get('/api/connections/pending'),
            ]);
            setConnections(conns.data);
            setPendingRequests(pend.data);
            showToast(t('connections.accept'), 'success');
        } catch {
            showToast(t('errors.internal'), 'error');
        }
    };

    const handleRejectRequest = async (connectionId) => {
        try {
            await axios.post('/api/connections/respond', { connectionId, action: 'reject' });
            const pend = await axios.get('/api/connections/pending');
            setPendingRequests(pend.data);
        } catch {
            showToast(t('errors.internal'), 'error');
        }
    };

    const handleStartChat = async (otherUserId) => {
        try {
            const { data } = await axios.post('/api/conversations', { otherUserId });
            // Add to conversation list
            useStore.getState().addConversation(data);
            setActiveConversation(data);
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            showToast(t(key), 'error');
        }
    };

    const getOtherUserFromConnection = (conn) => {
        return conn.requesterId === currentUser.id ? conn.recipient : conn.requester;
    };

    return (
        <div className={`sidebar ${activeConversation ? 'has-active-chat' : ''}`}>
            <div className="sidebar-header">
                <h1>{t('app.title')}</h1>
            </div>

            <div className="sidebar-tabs" role="tablist">
                <button
                    className={`sidebar-tab ${activeTab === 'chats' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'chats'}
                    onClick={() => setActiveTab('chats')}
                >
                    {t('nav.chats')}
                </button>
                <button
                    className={`sidebar-tab ${activeTab === 'contacts' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'contacts'}
                    onClick={() => setActiveTab('contacts')}
                >
                    {t('nav.contacts')}
                    {pendingRequests.length > 0 && <span className="badge">{pendingRequests.length}</span>}
                </button>
                <button
                    className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                >
                    {t('nav.settings')}
                </button>
            </div>

            <div className="sidebar-content">
                {/* Search — shown on chats and contacts tabs */}
                {(activeTab === 'chats' || activeTab === 'contacts') && (
                    <div className="search-bar">
                        <div className="search-input-wrapper">
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                            <input
                                className="search-input"
                                type="text"
                                placeholder={t('search.placeholder')}
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                aria-label={t('search.placeholder')}
                            />
                        </div>
                    </div>
                )}

                {/* Search results overlay */}
                {searchQuery.trim().length > 0 && (
                    <div className="search-results">
                        {searchResults.length === 0 && !searching ? (
                            <div className="empty-state" style={{ height: 'auto', padding: '24px' }}>
                                <p>{t('search.noResults')}</p>
                            </div>
                        ) : (
                            <ul className="contacts-list">
                                {searchResults.map((user) => (
                                    <li key={user.id} className="contact-item">
                                        <img className="avatar" src={user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}`} alt="" />
                                        <div className="contact-item-info">
                                            <div className="contact-item-name">{user.displayName}</div>
                                            <div className="contact-item-email">{user.email}</div>
                                        </div>
                                        <div className="contact-actions">
                                            {user._sent ? (
                                                <span className="btn-sm btn-secondary" style={{ cursor: 'default' }}>{t('connections.requestSent')}</span>
                                            ) : (
                                                <button className="btn-sm btn-primary" onClick={() => handleSendRequest(user.id)}>
                                                    {t('connections.sendRequest')}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Chats tab */}
                {activeTab === 'chats' && searchQuery.trim().length === 0 && (
                    conversations.length === 0 ? (
                        <div className="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                            </svg>
                            <p>{t('conversations.empty')}</p>
                        </div>
                    ) : (
                        <ul className="conversation-list" role="list">
                            {conversations.map((conv) => (
                                <li
                                    key={conv.id}
                                    className={`conversation-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                                    onClick={() => setActiveConversation(conv)}
                                    role="listitem"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && setActiveConversation(conv)}
                                >
                                    <img
                                        className="avatar"
                                        src={conv.otherUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.otherUser?.displayName || '?')}`}
                                        alt={conv.otherUser?.displayName}
                                    />
                                    <div className="conversation-item-info">
                                        <div className="conversation-item-header">
                                            <span className="conversation-item-name">{conv.otherUser?.displayName}</span>
                                            <span className="conversation-item-time">
                                                {conv.lastMessage ? formatRelativeTime(conv.lastMessage.createdAt || conv.lastMessageAt) : ''}
                                            </span>
                                        </div>
                                        <div className="conversation-item-preview">
                                            {conv.lastMessage?.isDeleted
                                                ? t('conversations.messageRemoved')
                                                : conv.lastMessage?.body || ''}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                )}

                {/* Contacts tab */}
                {activeTab === 'contacts' && searchQuery.trim().length === 0 && (
                    <div>
                        {/* Pending requests */}
                        {pendingRequests.length > 0 && (
                            <>
                                <div className="section-header">{t('connections.pending')}</div>
                                <ul className="contacts-list">
                                    {pendingRequests.map((req) => (
                                        <li key={req.id} className="contact-item">
                                            <img className="avatar" src={req.requester?.avatarUrl} alt="" />
                                            <div className="contact-item-info">
                                                <div className="contact-item-name">{req.requester?.displayName}</div>
                                            </div>
                                            <div className="contact-actions">
                                                <button className="btn-sm btn-primary" onClick={() => handleAcceptRequest(req.id)}>
                                                    {t('connections.accept')}
                                                </button>
                                                <button className="btn-sm btn-secondary" onClick={() => handleRejectRequest(req.id)}>
                                                    {t('connections.reject')}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {/* Accepted connections */}
                        <div className="section-header">{t('nav.contacts')}</div>
                        {connections.length === 0 ? (
                            <div className="empty-state" style={{ height: 'auto', padding: '24px' }}>
                                <p>{t('connections.noConnections')}</p>
                            </div>
                        ) : (
                            <ul className="contacts-list">
                                {connections.map((conn) => {
                                    const other = getOtherUserFromConnection(conn);
                                    return (
                                        <li key={conn.id} className="contact-item">
                                            <img className="avatar" src={other?.avatarUrl} alt="" />
                                            <div className="contact-item-info">
                                                <div className="contact-item-name">{other?.displayName}</div>
                                            </div>
                                            <div className="contact-actions">
                                                <button className="btn-sm btn-chat" onClick={() => handleStartChat(other.id)}>
                                                    {t('nav.chats')}
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                {/* Settings tab */}
                {activeTab === 'settings' && (
                    <SettingsPanel />
                )}
            </div>
        </div>
    );
}

// Settings inline
function SettingsPanel() {
    const { t, locale, setLocale, getSupportedLocales } = useI18n();
    const { currentUser, clearCurrentUser } = useStore();

    const handleLogout = async () => {
        try {
            await axios.post('/api/auth/logout');
            clearCurrentUser();
        } catch {
            // force clear anyway
            clearCurrentUser();
        }
    };

    const localeLabels = {
        'en-GB': 'English (UK)',
        'ja-JP': '日本語',
    };

    return (
        <div className="settings-panel">
            <div className="settings-group">
                <div className="settings-group-title">{t('settings.profile')}</div>
                <div className="settings-item">
                    <label>{t('auth.displayName')}</label>
                    <span>{currentUser?.displayName}</span>
                </div>
                <div className="settings-item">
                    <label>{t('auth.email')}</label>
                    <span>{currentUser?.email}</span>
                </div>
            </div>

            <div className="settings-group">
                <div className="settings-group-title">{t('settings.language')}</div>
                <div className="settings-item">
                    <label>{t('settings.language')}</label>
                    <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        aria-label={t('settings.language')}
                    >
                        {getSupportedLocales().map((loc) => (
                            <option key={loc} value={loc}>{localeLabels[loc] || loc}</option>
                        ))}
                    </select>
                </div>
            </div>

            <button className="logout-button" onClick={handleLogout}>
                {t('settings.logout')}
            </button>
        </div>
    );
}
