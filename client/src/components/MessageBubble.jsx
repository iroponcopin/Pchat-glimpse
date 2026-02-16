import { useState } from 'react';
import { useI18n } from '../i18n/index.js';

export default function MessageBubble({ message, isOwn, onEdit, onUndo }) {
    const { t, formatDate } = useI18n();
    const [showActions, setShowActions] = useState(false);

    const EDIT_WINDOW_MS = 15 * 60 * 1000;
    const UNDO_WINDOW_MS = 2 * 60 * 1000;
    const now = Date.now();
    const createdAt = new Date(message.createdAt).getTime();
    const canEdit = isOwn && !message.isDeleted && (now - createdAt) < EDIT_WINDOW_MS;
    const canUndo = isOwn && !message.isDeleted && (now - createdAt) < UNDO_WINDOW_MS;

    if (message.isDeleted) {
        return (
            <div className={`message-row ${isOwn ? 'outgoing' : 'incoming'}`}>
                <div className="message-bubble deleted" aria-label={t('messages.removed')}>
                    <span>{t('messages.removed')}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`message-row ${isOwn ? 'outgoing' : 'incoming'}`}
            onMouseEnter={() => isOwn && setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            <div>
                <div className="message-bubble">
                    <span>{message.body}</span>
                    <div className="message-meta">
                        <span className="message-time">
                            {formatDate(message.createdAt, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {message.isEdited && (
                            <span className="message-edited-badge">{t('messages.edited')}</span>
                        )}
                    </div>
                </div>

                {isOwn && (canEdit || canUndo) && (
                    <div className="message-actions" style={{ opacity: showActions ? 1 : undefined }}>
                        {canEdit && (
                            <button
                                className="message-action-btn"
                                onClick={() => onEdit(message)}
                                aria-label={t('messages.edit')}
                            >
                                {t('messages.edit')}
                            </button>
                        )}
                        {canUndo && (
                            <button
                                className="message-action-btn destructive"
                                onClick={() => onUndo(message.id)}
                                aria-label={t('messages.undoSend')}
                            >
                                {t('messages.undoSend')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
