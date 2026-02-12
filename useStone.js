import { create } from 'zustand';
import { io } from 'socket.io-client';

export const useStore = create((set, get) => ({
    currentUser: null,
    socket: null,
    conversations: [],
    currentConversation: null,
    messages: [],

    setCurrentUser: (user) => {
        set({ currentUser: user });
        if (user && !get().socket) {
            const socket = io('/', { withCredentials: true }); // Proxy handles URL
            set({ socket });

            socket.on('connect', () => {
                console.log('Connected to socket');
            });

            socket.on('message:new', (message) => {
                const { currentConversation, messages, conversations } = get();

                // Update messages if in current conversation
                if (currentConversation?.id === message.conversationId) {
                    set({ messages: [...messages, message] });
                }

                // Update conversation last message
                const updatedConversations = conversations.map(c => {
                    if (c.id === message.conversationId) {
                        return { ...c, lastMessage: message };
                    }
                    return c;
                });

                // Move to top
                const targetConv = updatedConversations.find(c => c.id === message.conversationId);
                if (targetConv) {
                    const others = updatedConversations.filter(c => c.id !== message.conversationId);
                    set({ conversations: [targetConv, ...others] });
                } else {
                    // Handle new conversation (fetch or ignore)
                    // Ideally we should refetch conversations or add it if we have details
                }
            });
        }
    },

    logout: () => {
        const { socket } = get();
        if (socket) socket.disconnect();
        set({ currentUser: null, socket: null, currentConversation: null, conversations: [], messages: [] });
    },

    setConversations: (conversations) => set({ conversations }),
    setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
    setMessages: (messages) => set({ messages }),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
}));
