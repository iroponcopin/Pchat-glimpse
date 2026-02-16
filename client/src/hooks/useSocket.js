import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useStore } from '../store/useStore.js';
import { t } from '../i18n/index.js';
import axios from 'axios';

let socket = null;

export function useSocket() {
    const {
        currentUser,
        activeConversation,
        addMessage,
        updateMessage,
        updateConversation,
        addConversation,
        showToast,
    } = useStore();
    const activeConvRef = useRef(activeConversation);

    useEffect(() => {
        activeConvRef.current = activeConversation;
    }, [activeConversation]);

    useEffect(() => {
        if (!currentUser) {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            return;
        }

        if (socket?.connected) return;

        socket = io('/', {
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
            console.log('Socket connected');
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason !== 'io client disconnect') {
                showToast(t('errors.connectionFailed'), 'error');
            }
        });

        socket.on('connect_error', () => {
            showToast(t('errors.connectionFailed'), 'error');
        });

        socket.on('message:new', (msg) => {
            // Only add if it's for the currently active conversation, else just update the list
            if (activeConvRef.current?.id === msg.conversationId) {
                addMessage(msg);
            }
        });

        socket.on('message:updated', (msg) => {
            if (activeConvRef.current?.id === msg.conversationId) {
                updateMessage(msg);
            }
        });

        socket.on('conversation:updated', (data) => {
            updateConversation(data.conversationId, {
                lastMessage: data.lastMessage,
                lastMessageAt: data.lastMessageAt,
            });
        });

        socket.on('connection:request', () => {
            // Refresh pending requests
            axios.get('/api/connections/pending').then((res) => {
                useStore.getState().setPendingRequests(res.data);
            });
        });

        socket.on('connection:response', () => {
            // Refresh connections list
            axios.get('/api/connections').then((res) => {
                useStore.getState().setConnections(res.data);
            });
        });

        return () => {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        };
    }, [currentUser]);

    const joinConversation = useCallback((conversationId) => {
        if (socket?.connected) {
            socket.emit('conversation:join', conversationId);
        }
    }, []);

    const resync = useCallback(async (conversationId) => {
        try {
            const res = await axios.get(`/api/conversations/${conversationId}/messages?limit=20`);
            useStore.getState().setMessages(res.data.messages, res.data.hasMore, res.data.nextCursor);
        } catch {
            // silent
        }
    }, []);

    return { socket, joinConversation, resync };
}
