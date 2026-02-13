import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

// The 'store' folder exists on your GitHub, so we keep this path
// 'store' フォルダはGitHubに存在するので、このパスは維持します
import { useAuthStore } from "./store/useAuthStore"; 

// All other files are in the 'src' folder directly, so we use "./Filename"
// 他のファイルはすべて 'src' フォルダ直下にあるため、"./ファイル名" とします
import Navbar from "./Navbar";
import HomePage from "./HomePage";
import SignUpPage from "./SignUpPage";
import LoginPage from "./LoginPage";
import SettingsPage from "./SettingsPage";
import ProfilePage from "./ProfilePage";

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="size-10 animate-spin" />
      </div>
    );

  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={authUser ? <HomePage /> : <Navigate to="/login" />} />
        <Route path="/signup" element={!authUser ? <SignUpPage /> : <Navigate to="/" />} />
        <Route path="/login" element={!authUser ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={authUser ? <ProfilePage /> : <Navigate to="/login" />} />
      </Routes>
      <Toaster />
    </div>
  );
};

export default App;
