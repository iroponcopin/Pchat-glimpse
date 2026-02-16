import { useI18n } from '../i18n/index.js';
import { useStore } from '../store/useStore.js';
import axios from 'axios';

export default function Settings() {
    const { t, locale, setLocale, getSupportedLocales } = useI18n();
    const { currentUser, clearCurrentUser } = useStore();

    const handleLogout = async () => {
        try {
            await axios.post('/api/auth/logout');
            clearCurrentUser();
        } catch {
            clearCurrentUser();
        }
    };

    const localeLabels = {
        'en-GB': 'English (UK)',
        'ja-JP': '日本語',
    };

    return (
        <div className="settings-panel">
            <div className="settings-group">
                <div className="settings-group-title">{t('settings.profile')}</div>
                <div className="settings-item">
                    <label>{t('auth.displayName')}</label>
                    <span>{currentUser?.displayName}</span>
                </div>
                <div className="settings-item">
                    <label>{t('auth.email')}</label>
                    <span>{currentUser?.email}</span>
                </div>
            </div>

            <div className="settings-group">
                <div className="settings-group-title">{t('settings.language')}</div>
                <div className="settings-item">
                    <label>{t('settings.language')}</label>
                    <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        aria-label={t('settings.language')}
                    >
                        {getSupportedLocales().map((loc) => (
                            <option key={loc} value={loc}>{localeLabels[loc] || loc}</option>
                        ))}
                    </select>
                </div>
            </div>

            <button className="logout-button" onClick={handleLogout}>
                {t('settings.logout')}
            </button>
        </div>
    );
}
