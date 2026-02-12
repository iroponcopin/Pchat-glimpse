import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';

export default function ChatWindow() {
    const { currentConversation, currentUser, messages, setMessages, addMessage } = useStore();
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (currentConversation) {
            const fetchMessages = async () => {
                try {
                    const { data } = await axios.get(`/api/conversations/${currentConversation.id}/messages`);
                    setMessages(data);
                } catch (error) {
                    console.error('Failed to fetch messages', error);
                }
            };
            fetchMessages();
        }
    }, [currentConversation, setMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentConversation) return;

        try {
            const { data } = await axios.post('/api/messages', {
                conversationId: currentConversation.id,
                content: newMessage
            });
            // Optimistic update handled by socket or we add it here?
            // Socket event handles it in store, but for sender we might want immediate feedback or wait for ack.
            // Our store logic adds it on 'message:new' event.
            // If we add it here manually, we might duplicate if socket event comes back.
            // However, socket event usually comes back to sender too.
            // We'll rely on socket for now, or check if socket event covers sender.
            // Typically yes.
            // data is the message object.
            setNewMessage('');
        } catch (error) {
            console.error('Failed to send message', error);
        }
    };

    if (!currentConversation) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-gray-50">
                Select a conversation to start chatting
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-gray-200 shadow-sm flex items-center">
                <img src={currentConversation.otherParticipant?.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full" />
                <h2 className="ml-3 text-lg font-semibold text-gray-800">{currentConversation.otherParticipant?.username}</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map(msg => {
                    const isOwn = msg.senderId === currentUser.id;
                    return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            {!isOwn && (
                                <img src={msg.sender.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full mr-2 self-end mb-1" />
                            )}
                            <div className={`max-w-xs px-4 py-2 rounded-2xl ${isOwn ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                                <p>{msg.content}</p>
                                <div className={`text-xs mt-1 text-right ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                                    {format(new Date(msg.createdAt), 'HH:mm')}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-gray-200 bg-white">
                <form onSubmit={handleSend} className="flex items-center">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-100"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="ml-3 p-2 text-blue-600 hover:bg-blue-50 rounded-full disabled:opacity-50"
                    >
                        <svg className="w-6 h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
