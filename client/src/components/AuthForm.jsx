import { useState } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore.js';
import { useI18n } from '../i18n/index.js';

export default function AuthForm() {
    const { t } = useI18n();
    const setCurrentUser = useStore((s) => s.setCurrentUser);
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegister) {
                const { data } = await axios.post('/api/auth/register', { email, password, displayName });
                setCurrentUser(data);
            } else {
                const { data } = await axios.post('/api/auth/login', { email, password });
                setCurrentUser(data);
            }
        } catch (err) {
            const key = err.response?.data?.error || 'errors.internal';
            setError(t(key));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h1>{t('app.title')}</h1>
                <p className="subtitle">{isRegister ? t('auth.register') : t('auth.login')}</p>

                {error && <div className="auth-error" role="alert">{error}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className="form-field">
                            <label htmlFor="displayName">{t('auth.displayName')}</label>
                            <input
                                id="displayName"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                autoComplete="name"
                                required
                            />
                        </div>
                    )}
                    <div className="form-field">
                        <label htmlFor="email">{t('auth.email')}</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="password">{t('auth.password')}</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            required
                            minLength={6}
                        />
                    </div>
                    <button className="auth-button" type="submit" disabled={loading}>
                        {loading ? '…' : isRegister ? t('auth.register') : t('auth.login')}
                    </button>
                </form>

                <div className="auth-switch">
                    <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
                        {isRegister ? t('auth.switchToLogin') : t('auth.switchToRegister')}
                    </button>
                </div>
            </div>
        </div>
    );
}
