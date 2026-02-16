import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore.js';
import { useI18n } from '../i18n/index.js';
import { useSocket } from '../hooks/useSocket.js';
import MessageBubble from './MessageBubble.jsx';
import Composer from './Composer.jsx';

export default function ChatView() {
    const { t } = useI18n();
    const {
        currentUser,
        activeConversation,
        clearActiveConversation,
        messages,
        setMessages,
        prependMessages,
        addMessage,
        updateMessage,
        hasMoreMessages,
        nextCursor,
        showToast,
    } = useStore();
    const { joinConversation } = useSocket();

    const [loading, setLoading] = useState(false);
    const [editingMessage, setEditingMessage] = useState(null);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const prevConvId = useRef(null);

    // Load messages when conversation changes
    useEffect(() => {
        if (!activeConversation?.id) return;
        if (prevConvId.current === activeConversation.id) return;
        prevConvId.current = activeConversation.id;

        setLoading(true);
        axios
            .get(`/api/conversations/${activeConversation.id}/messages?limit=20`)
            .then((res) => {
                setMessages(res.data.messages, res.data.hasMore, res.data.nextCursor);
                joinConversation(activeConversation.id);
            })
            .catch(() => showToast(t('errors.internal'), 'error'))
            .finally(() => setLoading(false));
    }, [activeConversation?.id]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // Load older
    const loadOlder = useCallback(async () => {
        if (!hasMoreMessages || !nextCursor || loading) return;
        setLoading(true);
        try {
            const res = await axios.get(
                `/api/conversations/${activeConversation.id}/messages?cursor=${nextCursor}&limit=20`
            );
            const container = messagesContainerRef.current;
            const scrollHeightBefore = container?.scrollHeight || 0;
            prependMessages(res.data.messages, res.data.hasMore, res.data.nextCursor);
            // Preserve scroll position
            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight - scrollHeightBefore;
                }
            });
        } catch {
            showToast(t('errors.internal'), 'error');
        } finally {
            setLoading(false);
        }
    }, [activeConversation?.id, hasMoreMessages, nextCursor, loading]);

    // Send message (optimistic)
    const handleSend = useCallback(async (body) => {
        const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optimistic = {
            id: `temp-${clientMessageId}`,
            conversationId: activeConversation.id,
            senderId: currentUser.id,
            sender: { id: currentUser.id, displayName: currentUser.displayName, avatarUrl: currentUser.avatarUrl },
            body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            clientMessageId,
            isEdited: false,
            isDeleted: false,
            _optimistic: true,
        };
        addMessage(optimistic);

        try {
            const { data } = await axios.post('/api/messages', {
                conversationId: activeConversation.id,
                body,
                clientMessageId,
            });
            // Reconcile
            addMessage(data);
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            showToast(t(key), 'error');
        }
    }, [activeConversation?.id, currentUser]);

    // Edit message
    const handleSaveEdit = useCallback(async (messageId, newBody) => {
        try {
            const { data } = await axios.patch(`/api/messages/${messageId}`, { body: newBody });
            updateMessage(data);
            setEditingMessage(null);
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            showToast(t(key), 'error');
        }
    }, []);

    // Undo send
    const handleUndo = useCallback(async (messageId) => {
        try {
            const { data } = await axios.post(`/api/messages/${messageId}/undo`);
            updateMessage(data);
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            showToast(t(key), 'error');
        }
    }, []);

    if (!activeConversation) {
        return (
            <div className="chat-panel">
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                    <p>{t('conversations.selectOrStart')}</p>
                </div>
            </div>
        );
    }

    const otherUser = activeConversation.otherUser;

    return (
        <div className="chat-panel active">
            {/* Header */}
            <div className="chat-header">
                <button
                    className="back-button"
                    onClick={clearActiveConversation}
                    aria-label="Back"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <img
                    className="avatar"
                    src={otherUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser?.displayName || '?')}`}
                    alt={otherUser?.displayName}
                />
                <span className="chat-header-name">{otherUser?.displayName}</span>
            </div>

            {/* Messages */}
            <div className="messages-container" ref={messagesContainerRef}>
                {hasMoreMessages && (
                    <div className="load-more-bar">
                        <button className="load-more-btn" onClick={loadOlder} disabled={loading}>
                            {loading ? '…' : '↑ Load more'}
                        </button>
                    </div>
                )}
                {messages.map((msg) => (
                    <MessageBubble
                        key={msg.id}
                        message={msg}
                        isOwn={msg.senderId === currentUser?.id}
                        onEdit={(m) => setEditingMessage(m)}
                        onUndo={handleUndo}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <Composer
                onSend={handleSend}
                editingMessage={editingMessage}
                onCancelEdit={() => setEditingMessage(null)}
                onSaveEdit={handleSaveEdit}
            />
        </div>
    );
}
