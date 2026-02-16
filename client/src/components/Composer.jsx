import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n/index.js';

export default function Composer({ onSend, editingMessage, onCancelEdit, onSaveEdit }) {
    const { t } = useI18n();
    const [text, setText] = useState('');
    const textareaRef = useRef(null);

    // When editing, pre-populate
    useEffect(() => {
        if (editingMessage) {
            setText(editingMessage.body);
            textareaRef.current?.focus();
        } else {
            setText('');
        }
    }, [editingMessage]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        }
    }, [text]);

    const handleSubmit = () => {
        const trimmed = text.trim();
        if (!trimmed) return;

        if (editingMessage) {
            onSaveEdit(editingMessage.id, trimmed);
        } else {
            onSend(trimmed);
        }
        setText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape' && editingMessage) {
            onCancelEdit();
        }
    };

    return (
        <>
            {editingMessage && (
                <div className="edit-header">
                    <span>{t('messages.edit')}</span>
                    <button onClick={onCancelEdit}>{t('messages.cancel')}</button>
                </div>
            )}
            <div className={`composer ${editingMessage ? 'edit-mode' : ''}`}>
                <textarea
                    ref={textareaRef}
                    className="composer-input"
                    placeholder={t('messages.placeholder')}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    aria-label={t('messages.placeholder')}
                />
                <button
                    className="send-button"
                    onClick={handleSubmit}
                    disabled={!text.trim()}
                    aria-label={editingMessage ? t('messages.save') : t('messages.send')}
                >
                    {editingMessage ? (
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                    )}
                </button>
            </div>
        </>
    );
}
