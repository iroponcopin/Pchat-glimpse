import { useEffect, useState } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';

export default function Sidebar() {
    const { currentUser, conversations, setConversations, setCurrentConversation, logout } = useStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    useEffect(() => {
        const fetchConversations = async () => {
            try {
                const { data } = await axios.get('/api/conversations');
                setConversations(data);
            } catch (error) {
                console.error('Failed to fetch conversations', error);
            }
        };
        fetchConversations();
    }, [setConversations]);

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.length > 2) {
            try {
                const { data } = await axios.get(`/api/auth/search?q=${query}`);
                setSearchResults(data);
            } catch (error) {
                console.error('Search failed', error);
            }
        } else {
            setSearchResults([]);
        }
    };

    const startChat = async (userId) => {
        try {
            const { data } = await axios.post('/api/conversations', { recipientId: userId });
            // Refresh conversations or append
            const { data: convs } = await axios.get('/api/conversations');
            setConversations(convs);
            const newConv = convs.find(c => c.id === data.id);
            setCurrentConversation(newConv);
            setSearchQuery('');
            setSearchResults([]);
        } catch (error) {
            console.error('Failed to start chat', error);
        }
    };

    return (
        <div className="flex flex-col h-full border-r border-gray-200 bg-white w-80">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <img src={currentUser.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full" />
                    <span className="font-semibold">{currentUser.username}</span>
                </div>
                <button onClick={async () => {
                    await axios.post('/api/auth/logout');
                    logout();
                }} className="text-sm text-red-500 hover:text-red-700">Logout</button>
            </div>
            <div className="p-2">
                <input
                    type="text"
                    placeholder="Search users..."
                    className="w-full px-3 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={handleSearch}
                />
            </div>
            <div className="flex-1 overflow-y-auto">
                {searchQuery ? (
                    <div>
                        <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Search Results</h3>
                        {searchResults.map(user => (
                            <div key={user.id} onClick={() => startChat(user.id)} className="flex items-center p-3 hover:bg-gray-100 cursor-pointer">
                                <img src={user.avatarUrl} alt={user.username} className="w-10 h-10 rounded-full" />
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-gray-900">{user.username}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    conversations.map(conv => (
                        <div key={conv.id} onClick={() => setCurrentConversation(conv)} className="flex items-center p-3 hover:bg-gray-100 cursor-pointer">
                            <img src={conv.otherParticipant?.avatarUrl} alt={conv.otherParticipant?.username} className="w-12 h-12 rounded-full" />
                            <div className="ml-3 flex-1 overflow-hidden">
                                <div className="flex justify-between">
                                    <p className="text-sm font-medium text-gray-900 truncate">{conv.otherParticipant?.username}</p>
                                    {conv.lastMessage && (
                                        <span className="text-xs text-gray-500">{format(new Date(conv.lastMessage.createdAt), 'HH:mm')}</span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 truncate">{conv.lastMessage?.content || 'No messages yet'}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
