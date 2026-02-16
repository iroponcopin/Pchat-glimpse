import axios from 'axios';
import { useStore } from '../store/useStore.js';
import { useI18n } from '../i18n/index.js';

export default function ConnectionsPanel({ onStartChat }) {
    const { t } = useI18n();
    const {
        currentUser,
        connections,
        setConnections,
        pendingRequests,
        setPendingRequests,
        showToast
    } = useStore();

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

    const getOtherUserFromConnection = (conn) => {
        return conn.requesterId === currentUser.id ? conn.recipient : conn.requester;
    };

    return (
        <div className="height-100-scroll">
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
                                    <button className="btn-sm btn-chat" onClick={() => onStartChat(other.id)}>
                                        {t('nav.chats')}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
