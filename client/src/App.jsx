import { useEffect, useState } from 'react';
import axios from 'axios';
import { useStore } from './store/useStore';
import AuthForm from './components/AuthForm';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';

function App() {
  const { currentUser, setCurrentUser } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await axios.get('/api/auth/me');
        setCurrentUser(data);
      } catch (err) {
        // Not authenticated
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [setCurrentUser]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!currentUser) {
    return <AuthForm />;
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full">
        <ChatWindow />
      </div>
    </div>
  );
}

export default App;
