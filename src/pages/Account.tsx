import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

type AuthMode = 'login' | 'register'

export default function Account() {
  const { user, update, logout, login, register } = useAuth()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [profileName, setProfileName] = useState(user?.name ?? '')
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '')

  useEffect(() => {
    if (user) {
      setProfileName(user.name)
      setProfileEmail(user.email)
    }
  }, [user])

  useEffect(() => {
    setStatus((prev) => (prev?.type === 'error' ? null : prev))
    setForm((prev) => ({ ...prev, password: '', confirm: '' }))
  }, [mode])

  const resetForm = useCallback(() => {
    setForm({
      name: '',
      email: '',
      password: '',
      confirm: '',
    })
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    setStatus(null)
    try {
      if (!form.email.trim()) throw new Error('Вкажіть email')
      if (!form.password.trim()) throw new Error('Вкажіть пароль')
      await login({ email: form.email, password: form.password })
      resetForm()
      setStatus({ type: 'success', text: 'Вітаємо, ви увійшли!' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося увійти'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setStatus(null)
    try {
      if (!form.name.trim()) throw new Error("Вкажіть ім'я")
      if (!form.email.trim()) throw new Error('Вкажіть email')
      if (form.password.trim().length < 4) throw new Error('Пароль має містити щонайменше 4 символи')
      if (form.password !== form.confirm) throw new Error('Паролі не співпадають')
      await register({ name: form.name, email: form.email, password: form.password })
      resetForm()
      setStatus({ type: 'success', text: 'Успішна реєстрація та вхід!' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не вдалося зареєструватися'
      setStatus({ type: 'error', text: message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setEditing(false)
      setMode('login')
      resetForm()
    }
  }, [resetForm, user])

  const handleUpdate = async () => {
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

  const handleLogout = () => {
    logout()
    setStatus({ type: 'success', text: 'Ви вийшли з акаунта' })
    setEditing(false)
    setMode('login')
  }

  if (!user) {
    return (
      <div className="account">
        <h2>Створіть або увійдіть в акаунт</h2>
        <p className="muted">Зберігайте налаштування та швидко повертайтесь до завантажень.</p>

        <div className="accountTabs" role="tablist" aria-label="Режим авторизації">
          <button
            className={`tab ${mode === 'login' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => setMode('login')}
            disabled={loading}
          >
            Вхід
          </button>
          <button
            className={`tab ${mode === 'register' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => setMode('register')}
            disabled={loading}
          >
            Реєстрація
          </button>
        </div>

        {status && (
          <div className={`accountAlert ${status.type === 'error' ? 'is-error' : 'is-success'}`} role="status">
            {status.text}
          </div>
        )}

        <div className="accountForm wide">
          {mode === 'register' && (
            <input
              className="input"
              placeholder="Ім'я"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              autoComplete="name"
            />
          )}
          <input
            className="input"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            type="email"
            autoComplete={mode === 'login' ? 'email' : 'new-email'}
          />
          <input
            className="input"
            placeholder="Пароль"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <input
              className="input"
              placeholder="Повторіть пароль"
              value={form.confirm}
              onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
              type="password"
              autoComplete="new-password"
            />
          )}
          <div className="accountActions">
            <button onClick={mode === 'login' ? handleLogin : handleRegister} disabled={loading}>
              {loading ? 'Зачекайте…' : mode === 'login' ? 'Увійти' : 'Зареєструватися'}
            </button>
            {mode === 'login' ? (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setMode('register')
                }}
              >
                Немає акаунта? Зареєструйтесь
              </button>
            ) : (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setMode('login')
                }}
              >
                Вже зареєстровані? Увійдіть
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="account">
      <h2>Особистий кабінет</h2>
      <p className="muted">Керуйте даними свого профілю.</p>

      {status && (
        <div className={`accountAlert ${status.type === 'error' ? 'is-error' : 'is-success'}`} role="status">
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
          <div className="accountActions">
            <button onClick={() => setEditing(true)}>Редагувати</button>
            <button className="ghost" onClick={handleLogout}>Вийти</button>
          </div>
        </div>
      ) : (
        <div className="accountForm">
          <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          <input className="input" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
          <div className="accountActions">
            <button onClick={handleUpdate} disabled={loading}>Зберегти</button>
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
    </div>
  )
}
