import { create } from 'zustand';

export const useStore = create((set, get) => ({
    // Auth
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),
    clearCurrentUser: () => set({ currentUser: null }),

    // UI
    activeView: 'chats', // 'chats' | 'contacts' | 'settings' | 'chat'
    setActiveView: (view) => set({ activeView: view }),

    activeConversation: null,
    setActiveConversation: (conv) => set({ activeConversation: conv, activeView: 'chat' }),
    clearActiveConversation: () => set({ activeConversation: null, activeView: 'chats' }),

    // Conversations
    conversations: [],
    setConversations: (convs) => set({ conversations: convs }),
    updateConversation: (convId, data) =>
        set((state) => ({
            conversations: state.conversations.map((c) =>
                c.id === convId ? { ...c, ...data } : c
            ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
        })),
    addConversation: (conv) =>
        set((state) => {
            const exists = state.conversations.find((c) => c.id === conv.id);
            if (exists) return state;
            return {
                conversations: [conv, ...state.conversations],
            };
        }),

    // Messages (for current conversation)
    messages: [],
    hasMoreMessages: false,
    nextCursor: null,
    setMessages: (msgs, hasMore, cursor) =>
        set({ messages: msgs, hasMoreMessages: hasMore, nextCursor: cursor }),
    prependMessages: (msgs, hasMore, cursor) =>
        set((state) => ({
            messages: [...msgs, ...state.messages],
            hasMoreMessages: hasMore,
            nextCursor: cursor,
        })),
    addMessage: (msg) =>
        set((state) => {
            // De-duplicate by clientMessageId or id
            const exists = state.messages.find(
                (m) => m.id === msg.id || (m.clientMessageId && m.clientMessageId === msg.clientMessageId)
            );
            if (exists) {
                // Update (reconcile optimistic with server)
                return {
                    messages: state.messages.map((m) =>
                        (m.id === msg.id || m.clientMessageId === msg.clientMessageId) ? { ...m, ...msg } : m
                    ),
                };
            }
            return { messages: [...state.messages, msg] };
        }),
    updateMessage: (msg) =>
        set((state) => ({
            messages: state.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
        })),
    clearMessages: () => set({ messages: [], hasMoreMessages: false, nextCursor: null }),

    // Connections
    connections: [],
    pendingRequests: [],
    setConnections: (conns) => set({ connections: conns }),
    setPendingRequests: (reqs) => set({ pendingRequests: reqs }),
    removePendingRequest: (id) =>
        set((state) => ({
            pendingRequests: state.pendingRequests.filter((r) => r.id !== id),
        })),

    // Toast / errors
    toast: null,
    showToast: (message, type = 'info') => {
        set({ toast: { message, type } });
        setTimeout(() => set({ toast: null }), 4000);
    },
}));
