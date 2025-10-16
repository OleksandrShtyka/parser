import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

type AuthMode = 'login' | 'register' | 'recovery'

const initialForm = {
  name: '',
  email: '',
  password: '',
  confirm: '',
}

const initialTwoFactorInputs = { code: '', recovery: '' }

const initialRecoveryForm = { email: '', code: '', password: '', confirm: '' }

export default function Account() {
  const {
    user,
    update,
    logout,
    login,
    register,
    verifyTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    regenerateRecoveryCodes,
    getRecoveryCodes,
    recoverAccount,
  } = useAuth()

  const [mode, setMode] = useState<AuthMode>('login')
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const [authForm, setAuthForm] = useState(initialForm)
  const [recoveryForm, setRecoveryForm] = useState(initialRecoveryForm)
  const [profileName, setProfileName] = useState(user?.name ?? '')
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '')

  const [twoFactorChallenge, setTwoFactorChallenge] = useState<{ id: string; message: string } | null>(null)
  const [twoFactorInputs, setTwoFactorInputs] = useState(initialTwoFactorInputs)
  const [twoFactorInfo, setTwoFactorInfo] = useState<{ secret: string; recoveryCodes: string[]; currentCode: string } | null>(null)
  const [visibleRecoveryCodes, setVisibleRecoveryCodes] = useState<string[] | null>(null)
  const [registerCodes, setRegisterCodes] = useState<string[] | null>(null)

  useEffect(() => {
    if (user) {
      setProfileName(user.name)
      setProfileEmail(user.email)
    }
  }, [user])

  useEffect(() => {
    setStatus(null)
    setTwoFactorChallenge(null)
    setTwoFactorInputs(initialTwoFactorInputs)
    if (mode !== 'register') setRegisterCodes(null)
  }, [mode])

  useEffect(() => {
    if (!user) {
      setEditing(false)
      setMode('login')
      setAuthForm(initialForm)
      setTwoFactorInfo(null)
      setVisibleRecoveryCodes(null)
    }
  }, [user])

  const setAuthField = useCallback(
    (key: keyof typeof initialForm) => (value: string) => {
      setAuthForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const setRecoveryField = useCallback(
    (key: keyof typeof initialRecoveryForm) => (value: string) => {
      setRecoveryForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const handleLogin = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const result = await login({ email: authForm.email, password: authForm.password, code: twoFactorInputs.code })
      if (result.status === 'success') {
        setAuthForm(initialForm)
        setTwoFactorInputs(initialTwoFactorInputs)
        setTwoFactorChallenge(null)
        setStatus({ type: 'success', text: 'Вітаємо, ви увійшли!' })
      } else {
        setTwoFactorChallenge({ id: result.challengeId, message: result.message })
        setStatus({ type: 'success', text: 'Пароль вірний. Введіть код підтвердження.' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося увійти'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyTwoFactor = async () => {
    if (!twoFactorChallenge) return
    setLoading(true)
    setStatus(null)
    try {
      await verifyTwoFactor({
        challengeId: twoFactorChallenge.id,
        code: twoFactorInputs.code,
        recoveryCode: twoFactorInputs.recovery,
      })
      setTwoFactorChallenge(null)
      setTwoFactorInputs(initialTwoFactorInputs)
      setStatus({ type: 'success', text: 'Успішне підтвердження. Ви авторизовані.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося підтвердити код'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setStatus(null)
    try {
      if (!authForm.name.trim()) throw new Error("Вкажіть ім'я")
      if (!authForm.email.trim()) throw new Error('Вкажіть email')
      if (authForm.password.trim().length < 6) throw new Error('Пароль має містити щонайменше 6 символів')
      if (authForm.password !== authForm.confirm) throw new Error('Паролі не співпадають')
      const result = await register({ name: authForm.name, email: authForm.email, password: authForm.password })
      setRegisterCodes(result.recoveryCodes)
      setAuthForm(initialForm)
      setStatus({ type: 'success', text: 'Реєстрація успішна. Збережіть резервні коди.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося зареєструватися'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async () => {
    setLoading(true)
    setStatus(null)
    try {
      await update({ name: profileName, email: profileEmail })
      setEditing(false)
      setStatus({ type: 'success', text: 'Профіль оновлено' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося оновити профіль'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleEnableTwoFactor = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const info = await enableTwoFactor()
      setTwoFactorInfo(info)
      setVisibleRecoveryCodes(info.recoveryCodes)
      setStatus({ type: 'success', text: '2FA увімкнено. Збережіть секретний ключ та резервні коди.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося увімкнути 2FA'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleDisableTwoFactor = async () => {
    setLoading(true)
    setStatus(null)
    try {
      await disableTwoFactor()
      setTwoFactorInfo(null)
      setVisibleRecoveryCodes(null)
      setStatus({ type: 'success', text: '2FA вимкнено' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося вимкнути 2FA'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateCodes = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const codes = await regenerateRecoveryCodes()
      setVisibleRecoveryCodes(codes)
      setStatus({ type: 'success', text: 'Створено новий набір резервних кодів' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося відновити коди'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleShowCodes = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const codes = await getRecoveryCodes()
      setVisibleRecoveryCodes(codes)
      setStatus({ type: 'success', text: 'Показано актуальні резервні коди' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося отримати коди'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverAccount = async () => {
    setLoading(true)
    setStatus(null)
    try {
      if (!recoveryForm.email.trim()) throw new Error('Вкажіть email')
      if (!recoveryForm.code.trim()) throw new Error('Вкажіть резервний код')
      if (recoveryForm.password.trim().length < 6) throw new Error('Новий пароль має містити щонайменше 6 символів')
      if (recoveryForm.password !== recoveryForm.confirm) throw new Error('Паролі не співпадають')
      const result = await recoverAccount({
        email: recoveryForm.email,
        recoveryCode: recoveryForm.code,
        newPassword: recoveryForm.password,
      })
      setVisibleRecoveryCodes(result.recoveryCodes)
      setStatus({ type: 'success', text: result.message })
      setRecoveryForm(initialRecoveryForm)
      setMode('login')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося відновити доступ'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    setStatus({ type: 'success', text: 'Ви вийшли з акаунта' })
  }

  const tabs = useMemo(
    () => [
      { key: 'login', label: 'Вхід' },
      { key: 'register', label: 'Реєстрація' },
      { key: 'recovery', label: 'Відновлення' },
    ] satisfies Array<{ key: AuthMode; label: string }>,
    [],
  )

  const renderCodes = (codes: string[] | null, description: string) =>
    codes && codes.length > 0 ? (
      <div className="codesBox" role="status">
        <div className="muted">{description}</div>
        <ul>
          {codes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
      </div>
    ) : null

  if (!user) {
    return (
      <div className="account">
        <h2>Керування акаунтом</h2>
        <p className="muted">Зареєструйтесь, увійдіть або відновіть доступ до збережених налаштувань.</p>

        <div className="accountTabs" role="tablist" aria-label="Режим авторизації">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${mode === tab.key ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              onClick={() => setMode(tab.key)}
              disabled={loading}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {status && (
          <div className={`accountAlert ${status.type === 'error' ? 'is-error' : ''}`} role="status">
            {status.text}
          </div>
        )}

        {mode === 'recovery' ? (
          <div className="accountForm wide">
            <input
              className="input"
              placeholder="Email"
              type="email"
              value={recoveryForm.email}
              onChange={(e) => setRecoveryField('email')(e.target.value)}
            />
            <input
              className="input"
              placeholder="Резервний код (XXXX-XXXX)"
              value={recoveryForm.code}
              onChange={(e) => setRecoveryField('code')(e.target.value)}
            />
            <input
              className="input"
              placeholder="Новий пароль"
              type="password"
              value={recoveryForm.password}
              onChange={(e) => setRecoveryField('password')(e.target.value)}
            />
            <input
              className="input"
              placeholder="Підтвердіть новий пароль"
              type="password"
              value={recoveryForm.confirm}
              onChange={(e) => setRecoveryField('confirm')(e.target.value)}
            />
            <div className="accountActions">
              <button onClick={handleRecoverAccount} disabled={loading}>
                {loading ? 'Зачекайте…' : 'Відновити доступ'}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setMode('login')
                  setRecoveryForm(initialRecoveryForm)
                }}
              >
                Повернутись до входу
              </button>
            </div>
          </div>
        ) : (
          <div className="accountForm wide">
            {mode === 'register' && (
              <input
                className="input"
                placeholder="Ім'я"
                value={authForm.name}
                onChange={(e) => setAuthField('name')(e.target.value)}
                autoComplete="name"
              />
            )}
            <input
              className="input"
              placeholder="Email"
              type="email"
              value={authForm.email}
              onChange={(e) => setAuthField('email')(e.target.value)}
              autoComplete={mode === 'login' ? 'email' : 'new-email'}
            />
            <input
              className="input"
              placeholder="Пароль"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthField('password')(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <input
                className="input"
                placeholder="Повторіть пароль"
                type="password"
                value={authForm.confirm}
                onChange={(e) => setAuthField('confirm')(e.target.value)}
                autoComplete="new-password"
              />
            )}
            {mode === 'login' && (
              <>
                <input
                  className="input"
                  placeholder="Код 2FA (за наявності)"
                  value={twoFactorInputs.code}
                  onChange={(e) =>
                    setTwoFactorInputs((prev) => ({ ...prev, code: e.target.value }))
                  }
                  inputMode="numeric"
                />
                {twoFactorChallenge && (
                  <>
                    <div className="muted">{twoFactorChallenge.message}</div>
                    <input
                      className="input"
                      placeholder="Резервний код (опціонально)"
                      value={twoFactorInputs.recovery}
                      onChange={(e) =>
                        setTwoFactorInputs((prev) => ({ ...prev, recovery: e.target.value }))
                      }
                    />
                  </>
                )}
              </>
            )}
            <div className="accountActions">
              <button
                onClick={
                  mode === 'login'
                    ? twoFactorChallenge
                      ? handleVerifyTwoFactor
                      : handleLogin
                    : handleRegister
                }
                disabled={loading}
              >
                {loading
                  ? 'Зачекайте…'
                  : mode === 'login'
                    ? twoFactorChallenge
                      ? 'Підтвердити код'
                      : 'Увійти'
                    : 'Зареєструватися'}
              </button>
              {mode === 'login' && !twoFactorChallenge && (
                <button className="ghost" onClick={() => setMode('register')} type="button">
                  Немає акаунта? Зареєструйтесь
                </button>
              )}
              {mode === 'register' && (
                <button className="ghost" onClick={() => setMode('login')} type="button">
                  Вже маєте акаунт? Увійдіть
                </button>
              )}
              {mode === 'login' && (
                <button className="ghost" onClick={() => setMode('recovery')} type="button">
                  Забули пароль? Відновлення
                </button>
              )}
            </div>
          </div>
        )}

        {renderCodes(registerCodes, 'Збережіть ці резервні коди після реєстрації:')}
        {renderCodes(visibleRecoveryCodes, 'Актуальні резервні коди:')}
      </div>
    )
  }

  return (
    <div className="account">
      <h2>Особистий кабінет</h2>
      <p className="muted">Керуйте профілем, двофакторною аутентифікацією та резервними кодами.</p>

      {status && (
        <div className={`accountAlert ${status.type === 'error' ? 'is-error' : ''}`} role="status">
          {status.text}
        </div>
      )}

      {!editing ? (
        <div className="accountDetails">
          <div>
            <span className="muted">Ім'я</span>
            <div>{user.name}</div>
          </div>
          <div>
            <span className="muted">Email</span>
            <div>{user.email || '—'}</div>
          </div>
          <div>
            <span className="muted">Створено</span>
            <div>{new Date(user.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <span className="muted">2FA</span>
            <div>{user.twoFactorEnabled ? 'Увімкнено' : 'Вимкнено'}</div>
          </div>
          <div className="accountActions">
            <button onClick={() => setEditing(true)}>Редагувати</button>
            <button className="ghost" onClick={handleLogout}>
              Вийти
            </button>
          </div>
        </div>
      ) : (
        <div className="accountForm">
          <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          <input className="input" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
          <div className="accountActions">
            <button onClick={handleUpdateProfile} disabled={loading}>
              {loading ? 'Зачекайте…' : 'Зберегти'}
            </button>
            <button
              className="ghost"
              onClick={() => {
                setEditing(false)
                setProfileName(user.name)
                setProfileEmail(user.email)
              }}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <section className="twoFactor">
        <header>
          <h3>Двофакторна аутентифікація</h3>
          <span className={`badge ${user.twoFactorEnabled ? 'is-on' : 'is-off'}`}>
            {user.twoFactorEnabled ? 'Активна' : 'Вимкнена'}
          </span>
        </header>
        <p className="muted">
          Увімкніть другий фактор для підвищення безпеки. Використовуйте код із застосунку-аутентифікатора
          або резервні коди для аварійного входу.
        </p>
        <div className="accountActions wrap">
          {!user.twoFactorEnabled ? (
            <button onClick={handleEnableTwoFactor} disabled={loading}>
              {loading ? 'Зачекайте…' : 'Увімкнути 2FA'}
            </button>
          ) : (
            <>
              <button onClick={handleShowCodes} disabled={loading}>
                Показати коди
              </button>
              <button onClick={handleRegenerateCodes} disabled={loading}>
                Оновити резервні коди
              </button>
              <button className="ghost" onClick={handleDisableTwoFactor} disabled={loading}>
                Вимкнути 2FA
              </button>
            </>
          )}
        </div>
        {twoFactorInfo && (
          <div className="codesBox" role="status">
            <div className="muted">Секретний ключ (додайте його до аутентифікатора):</div>
            <code>{twoFactorInfo.secret}</code>
            <div className="muted">Поточний код для перевірки: {twoFactorInfo.currentCode}</div>
          </div>
        )}
        {renderCodes(visibleRecoveryCodes, 'Збережіть ці резервні коди:')}
      </section>
    </div>
  )
}
