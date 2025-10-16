import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './context'
import type { ReactNode } from 'react'
import type { LoginPayload, RegisterPayload, UpdatePayload, User } from './context'

type StoredAccount = User & { password: string }

const ACTIVE_USER_KEY = 'user'
const ACCOUNTS_KEY = 'auth:accounts'

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

const normalizeName = (name: string) => {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  return trimmed || 'Користувач'
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const toUser = (raw: unknown): User | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<User> & { name?: unknown; email?: unknown; id?: unknown; createdAt?: unknown }
  const name = typeof record.name === 'string' ? normalizeName(record.name) : 'Користувач'
  const email = typeof record.email === 'string' ? normalizeEmail(record.email) : ''
  const id = typeof record.id === 'string' && record.id ? record.id : createId()
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : new Date().toISOString()
  return { id, name, email, createdAt }
}

const toStoredAccount = (raw: unknown): StoredAccount | null => {
  if (!raw || typeof raw !== 'object') return null
  const base = toUser(raw)
  if (!base) return null
  const record = raw as Partial<StoredAccount>
  if (!record.password || typeof record.password !== 'string') return null
  return { ...base, password: record.password }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map(toStoredAccount)
        .filter(Boolean) as StoredAccount[]
    } catch {
      return []
    }
  })

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(ACTIVE_USER_KEY)
      return raw ? toUser(JSON.parse(raw)) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (user) localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user))
      else localStorage.removeItem(ACTIVE_USER_KEY)
    } catch {
      /* ignore persistence issues */
    }
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    } catch {
      /* ignore persistence issues */
    }
  }, [accounts])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const register = useCallback(
    async ({ name, email, password }: RegisterPayload) => {
      const normalizedEmail = normalizeEmail(email)
      const normalizedName = normalizeName(name)
      if (!normalizedEmail) throw new Error('Вкажіть email')
      if (!password || password.trim().length < 4) throw new Error('Пароль має містити щонайменше 4 символи')
      const exists = accounts.some((acc) => acc.email === normalizedEmail)
      if (exists) throw new Error('Користувач з таким email вже існує')
      const newUser: User = {
        id: createId(),
        name: normalizedName,
        email: normalizedEmail,
        createdAt: new Date().toISOString(),
      }
      const newAccount: StoredAccount = { ...newUser, password: password.trim() }
      setAccounts((prev) => [...prev, newAccount])
      setUser(newUser)
      return newUser
    },
    [accounts],
  )

  const login = useCallback(
    async ({ email, password }: LoginPayload) => {
      const normalizedEmail = normalizeEmail(email)
      const account = accounts.find((acc) => acc.email === normalizedEmail)
      if (!account || account.password !== password.trim()) {
        throw new Error('Неправильний email або пароль')
      }
      const nextUser: User = { id: account.id, name: account.name, email: account.email, createdAt: account.createdAt }
      setUser(nextUser)
      return nextUser
    },
    [accounts],
  )

  const update = useCallback(
    async (patch: UpdatePayload) => {
      if (!user) throw new Error('Користувач не авторизований')
      const nextName = patch.name != null ? normalizeName(patch.name) : user.name
      const nextEmail = patch.email != null ? normalizeEmail(patch.email) : user.email
      if (!nextEmail) throw new Error('Email не може бути порожнім')
      if (nextEmail !== user.email) {
        const conflict = accounts.some((acc) => acc.email === nextEmail && acc.id !== user.id)
        if (conflict) throw new Error('Email вже використовується')
      }
      const nextUser: User = { ...user, name: nextName, email: nextEmail }
      setUser(nextUser)
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === user.id ? { ...acc, name: nextName, email: nextEmail } : acc)),
      )
      return nextUser
    },
    [accounts, user],
  )

  const value = useMemo(
    () => ({
      user,
      register,
      login,
      logout,
      update,
    }),
    [user, register, login, logout, update],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
