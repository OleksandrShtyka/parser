import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './context'
import type {
  EnableTwoFactorResult,
  LoginPayload,
  LoginResult,
  RecoverAccountPayload,
  RecoverAccountResult,
  RegisterPayload,
  RegisterResult,
  UpdatePayload,
  VerifyTwoFactorPayload,
  User,
} from './context'
import type { ReactNode } from 'react'
import { ApiError, sendVerificationEmail as sendVerificationEmailRequest } from '../services/api'

type StoredAccount = {
  id: string
  name: string
  email: string
  createdAt: string
  password: string
  twoFactorEnabled: boolean
  emailVerified: boolean
  twoFactorSecret?: string
  recoveryCodes: string[]
  verificationCode?: string
  verificationExpiresAt?: number
}

type TwoFactorChallenge = {
  challengeId: string
  accountId: string
  issuedAt: number
}

const ACTIVE_USER_KEY = 'user'
const ACCOUNTS_KEY = 'auth:accounts'
const PENDING_VERIFICATION_KEY = 'auth:pending-verification'
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000
const VERIFICATION_EXPIRY_MS = 15 * 60 * 1000

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

const normalizeName = (name: string) => {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  return trimmed || 'Користувач'
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const normalizeCode = (code: string) => code.replace(/\s+/g, '').toUpperCase()

const toUser = (raw: unknown): User | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<User> & {
    name?: unknown
    email?: unknown
    id?: unknown
    createdAt?: unknown
    twoFactorEnabled?: unknown
    emailVerified?: unknown
  }
  const name = typeof record.name === 'string' ? normalizeName(record.name) : 'Користувач'
  const email = typeof record.email === 'string' ? normalizeEmail(record.email) : ''
  const id = typeof record.id === 'string' && record.id ? record.id : createId()
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : new Date().toISOString()
  const twoFactorEnabled = typeof record.twoFactorEnabled === 'boolean' ? record.twoFactorEnabled : false
  const emailVerified = typeof record.emailVerified === 'boolean' ? record.emailVerified : true
  return { id, name, email, createdAt, twoFactorEnabled, emailVerified }
}

const randomFrom = <T,>(items: ReadonlyArray<T>) => items[Math.floor(Math.random() * items.length)]

const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')
const TWO_FACTOR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')

const generateRecoveryCode = () => {
  const part = () =>
    Array.from({ length: 4 })
      .map(() => randomFrom(RECOVERY_CODE_ALPHABET))
      .join('')
  return `${part()}-${part()}`
}

const generateRecoveryCodes = (count = 6) => Array.from({ length: count }, generateRecoveryCode)

const generateTwoFactorSecret = () => {
  return Array.from({ length: 16 })
    .map(() => randomFrom(TWO_FACTOR_ALPHABET))
    .join('')
}

const createVerificationCode = () => Math.floor(100000 + Math.random() * 900000).toString()

const sendVerificationEmail = async ({ email, code, name }: { email: string; code: string; name: string }) => {
  if (typeof window === 'undefined') return
  try {
    await sendVerificationEmailRequest({ email, code, name })
  } catch (error) {
    let message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Не вдалося надіслати лист підтвердження'
    if (message.includes('Failed to fetch') || message.includes('Network')) {
      message += '. Переконайтесь, що API сервер запущено (python server.py).'
    }
    throw new Error(message)
  }
}

const hashString = (value: string) => {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return hash >>> 0
}

const generateTwoFactorCode = (secret: string, timestamp = Date.now()) => {
  const window = Math.floor(timestamp / 30000)
  const hash = hashString(`${secret}:${window}`)
  return (hash % 1000000).toString().padStart(6, '0')
}

const verifyTwoFactorCode = (secret: string, code: string) => {
  const sanitized = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(sanitized)) return false
  const now = Date.now()
  const windows = [0, -1, 1]
  return windows.some((offset) => generateTwoFactorCode(secret, now + offset * 30000) === sanitized)
}

const toStoredAccount = (raw: unknown): StoredAccount | null => {
  if (!raw || typeof raw !== 'object') return null
  const base = toUser(raw)
  if (!base) return null
  const record = raw as Partial<StoredAccount>
  if (!record.password || typeof record.password !== 'string') return null
  const recoveryCodes = Array.isArray(record.recoveryCodes)
    ? record.recoveryCodes.filter((c): c is string => typeof c === 'string' && !!c)
    : []
  return {
    id: base.id,
    name: base.name,
    email: base.email,
    createdAt: base.createdAt,
    twoFactorEnabled: base.twoFactorEnabled,
    emailVerified: typeof record.emailVerified === 'boolean' ? record.emailVerified : true,
    password: record.password,
    twoFactorSecret: record.twoFactorSecret && typeof record.twoFactorSecret === 'string' ? record.twoFactorSecret : undefined,
    recoveryCodes: recoveryCodes.length ? recoveryCodes : generateRecoveryCodes(),
    verificationCode:
      record.verificationCode && typeof record.verificationCode === 'string'
        ? record.verificationCode
        : undefined,
    verificationExpiresAt:
      typeof record.verificationExpiresAt === 'number' ? record.verificationExpiresAt : undefined,
  }
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

  const [challenges, setChallenges] = useState<Record<string, TwoFactorChallenge>>({})

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(ACTIVE_USER_KEY)
      return raw ? toUser(JSON.parse(raw)) : null
    } catch {
      return null
    }
  })

  const [pendingVerification, setPendingVerification] = useState<{ email: string; expiresAt: string | null } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(PENDING_VERIFICATION_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      const email = typeof parsed.email === 'string' ? normalizeEmail(parsed.email) : null
      if (!email) return null
      const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null
      return { email, expiresAt }
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (pendingVerification) {
        localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(pendingVerification))
      } else {
        localStorage.removeItem(PENDING_VERIFICATION_KEY)
      }
    } catch {
      /* ignore persistence issues */
    }
  }, [pendingVerification])

  const cleanupChallenges = useCallback(() => {
    setChallenges((prev) => {
      const now = Date.now()
      const nextEntries = Object.entries(prev).filter(([, value]) => value.issuedAt + CHALLENGE_EXPIRY_MS > now)
      return Object.fromEntries(nextEntries)
    })
  }, [])

  useEffect(() => {
    const id = setInterval(cleanupChallenges, 60 * 1000)
    return () => clearInterval(id)
  }, [cleanupChallenges])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const register = useCallback(
    async ({ name, email, password }: RegisterPayload): Promise<RegisterResult> => {
      const normalizedEmail = normalizeEmail(email)
      const normalizedName = normalizeName(name)
      if (!normalizedEmail) throw new Error('Вкажіть email')
      if (!password || password.trim().length < 6) throw new Error('Пароль має містити щонайменше 6 символів')
      const existing = accounts.find((acc) => acc.email === normalizedEmail)
      if (existing && existing.emailVerified) throw new Error('Користувач з таким email вже існує')

      const trimmedPassword = password.trim()
      const recoveryCodes = generateRecoveryCodes()
      const verificationCode = createVerificationCode()
      const expiresAtTs = Date.now() + VERIFICATION_EXPIRY_MS
      const expiresAtIso = new Date(expiresAtTs).toISOString()
      const accountId = existing?.id ?? createId()
      const createdAt = existing?.createdAt ?? new Date().toISOString()
      const secret = existing?.twoFactorSecret ?? generateTwoFactorSecret()

      await sendVerificationEmail({ email: normalizedEmail, code: verificationCode, name: normalizedName })

      const nextAccount: StoredAccount = {
        id: accountId,
        name: normalizedName,
        email: normalizedEmail,
        createdAt,
        password: trimmedPassword,
        twoFactorEnabled: false,
        emailVerified: false,
        twoFactorSecret: secret,
        recoveryCodes,
        verificationCode,
        verificationExpiresAt: expiresAtTs,
      }

      setAccounts((prev) => {
        const existsById = prev.some((acc) => acc.id === accountId)
        if (existsById) {
          return prev.map((acc) => (acc.id === accountId ? nextAccount : acc))
        }
        return [...prev, nextAccount]
      })

      setPendingVerification({ email: normalizedEmail, expiresAt: expiresAtIso })

      return {
        status: 'pending-verification',
        email: normalizedEmail,
        recoveryCodes,
        expiresAt: expiresAtIso,
      }
    },
    [accounts],
  )

  const issueChallenge = useCallback(
    (account: StoredAccount) => {
      const challengeId = createId()
      const issuedAt = Date.now()
      setChallenges((prev) => ({ ...prev, [challengeId]: { challengeId, accountId: account.id, issuedAt } }))
      const code = account.twoFactorSecret ? generateTwoFactorCode(account.twoFactorSecret, issuedAt) : generateTwoFactorCode(account.id, issuedAt)
      return {
        challengeId,
        message: `Введіть код із додатку або резервний код. Поточний код (для тесту): ${code}`,
      }
    },
    [],
  )

  const login = useCallback(
    async ({ email, password, code }: LoginPayload): Promise<LoginResult> => {
      const normalizedEmail = normalizeEmail(email)
      const account = accounts.find((acc) => acc.email === normalizedEmail)
      if (!account || account.password !== password.trim()) {
        throw new Error('Неправильний email або пароль')
      }
      if (!account.emailVerified) {
        const expiresAtIso = account.verificationExpiresAt ? new Date(account.verificationExpiresAt).toISOString() : null
        setPendingVerification({ email: account.email, expiresAt: expiresAtIso })
        return {
          status: 'needs-verification',
          email: account.email,
          message: 'Потрібно підтвердити email. Введіть код із листа або надішліть новий.',
        }
      }
      if (account.twoFactorEnabled) {
        if (code && account.twoFactorSecret && verifyTwoFactorCode(account.twoFactorSecret, code)) {
          const nextUser: User = {
            id: account.id,
            name: account.name,
            email: account.email,
            createdAt: account.createdAt,
            twoFactorEnabled: true,
            emailVerified: account.emailVerified,
          }
          setUser(nextUser)
          setPendingVerification(null)
          return { status: 'success', user: nextUser }
        }
        const challenge = issueChallenge(account)
        if (code) throw new Error('Невірний код двофакторної перевірки')
        setPendingVerification(null)
        return { status: 'two-factor', challengeId: challenge.challengeId, message: challenge.message }
      }
      const nextUser: User = {
        id: account.id,
        name: account.name,
        email: account.email,
        createdAt: account.createdAt,
        twoFactorEnabled: false,
        emailVerified: account.emailVerified,
      }
      setUser(nextUser)
      setPendingVerification(null)
      return { status: 'success', user: nextUser }
    },
    [accounts, issueChallenge],
  )

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const normalizedEmail = normalizeEmail(email)
      const sanitizedCode = normalizeCode(code)
      if (!normalizedEmail) throw new Error('Вкажіть email')
      if (!sanitizedCode) throw new Error('Введіть код підтвердження')
      const account = accounts.find((acc) => acc.email === normalizedEmail)
      if (!account) throw new Error('Акаунт не знайдено')
      if (account.emailVerified) {
        const existingUser: User = {
          id: account.id,
          name: account.name,
          email: account.email,
          createdAt: account.createdAt,
          twoFactorEnabled: account.twoFactorEnabled,
          emailVerified: true,
        }
        setUser(existingUser)
        setPendingVerification(null)
        return existingUser
      }
      if (!account.verificationCode) {
        throw new Error('Код підтвердження не збережено. Надішліть новий.')
      }
      if (account.verificationCode !== sanitizedCode) {
        throw new Error('Невірний код підтвердження')
      }
      if (account.verificationExpiresAt && account.verificationExpiresAt < Date.now()) {
        throw new Error('Код підтвердження протермінований. Надішліть новий.')
      }
      const updatedAccount: StoredAccount = {
        ...account,
        emailVerified: true,
        verificationCode: undefined,
        verificationExpiresAt: undefined,
      }
      const nextUser: User = {
        id: updatedAccount.id,
        name: updatedAccount.name,
        email: updatedAccount.email,
        createdAt: updatedAccount.createdAt,
        twoFactorEnabled: updatedAccount.twoFactorEnabled,
        emailVerified: true,
      }
      setAccounts((prev) => prev.map((acc) => (acc.id === updatedAccount.id ? updatedAccount : acc)))
      setUser(nextUser)
      setPendingVerification(null)
      return nextUser
    },
    [accounts],
  )

  const resendVerification = useCallback(
    async (email: string) => {
      const normalizedEmail = normalizeEmail(email)
      if (!normalizedEmail) throw new Error('Вкажіть email')
      const account = accounts.find((acc) => acc.email === normalizedEmail)
      if (!account) throw new Error('Акаунт не знайдено')
      if (account.emailVerified) throw new Error('Email вже підтверджено')
      const verificationCode = createVerificationCode()
      const expiresAtTs = Date.now() + VERIFICATION_EXPIRY_MS
      const expiresAtIso = new Date(expiresAtTs).toISOString()
      await sendVerificationEmail({ email: normalizedEmail, code: verificationCode, name: account.name })
      const updatedAccount: StoredAccount = {
        ...account,
        verificationCode,
        verificationExpiresAt: expiresAtTs,
        emailVerified: false,
      }
      setAccounts((prev) => prev.map((acc) => (acc.id === updatedAccount.id ? updatedAccount : acc)))
      setPendingVerification({ email: normalizedEmail, expiresAt: expiresAtIso })
    },
    [accounts],
  )

  const verifyTwoFactor = useCallback(
    async ({ challengeId, code, recoveryCode }: VerifyTwoFactorPayload) => {
      const challenge = challenges[challengeId]
      if (!challenge) throw new Error('Запит 2FA не знайдено або він протермінований')
      const account = accounts.find((acc) => acc.id === challenge.accountId)
      if (!account) throw new Error('Акаунт не знайдено')
      let success = false
      let usedRecovery = false
      if (recoveryCode) {
        const normalizedRecovery = normalizeCode(recoveryCode)
        const matches = account.recoveryCodes.some((rc) => normalizeCode(rc) === normalizedRecovery)
        if (!matches) throw new Error('Невірний резервний код')
        usedRecovery = true
        account.recoveryCodes = account.recoveryCodes.filter((rc) => normalizeCode(rc) !== normalizedRecovery)
        success = true
      } else if (code && account.twoFactorSecret) {
        success = verifyTwoFactorCode(account.twoFactorSecret, code)
        if (!success) throw new Error('Невірний код 2FA')
      } else {
        throw new Error('Вкажіть код 2FA або резервний код')
      }
      if (!success) throw new Error('Не вдалося підтвердити 2FA')
      const nextUser: User = {
        id: account.id,
        name: account.name,
        email: account.email,
        createdAt: account.createdAt,
        twoFactorEnabled: account.twoFactorEnabled,
        emailVerified: account.emailVerified,
      }
      setUser(nextUser)
      setPendingVerification(null)
      setAccounts((prev) => prev.map((acc) => (acc.id === account.id ? { ...account } : acc)))
      setChallenges((prev) => {
        const { [challengeId]: _, ...rest } = prev
        return rest
      })
      if (usedRecovery && !account.recoveryCodes.length) {
        const refreshed = generateRecoveryCodes()
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === account.id ? { ...acc, recoveryCodes: refreshed } : acc)),
        )
      }
      return nextUser
    },
    [accounts, challenges],
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
        prev.map((acc) =>
          acc.id === user.id ? { ...acc, name: nextName, email: nextEmail } : acc,
        ),
      )
      return nextUser
    },
    [accounts, user],
  )

  const enableTwoFactor = useCallback(async (): Promise<EnableTwoFactorResult> => {
    if (!user) throw new Error('Користувач не авторизований')
    const account = accounts.find((acc) => acc.id === user.id)
    if (!account) throw new Error('Акаунт не знайдено')
    if (account.twoFactorEnabled) throw new Error('2FA вже увімкнено')
    const secret = account.twoFactorSecret || generateTwoFactorSecret()
    const recoveryCodes = generateRecoveryCodes()
    account.twoFactorSecret = secret
    account.twoFactorEnabled = true
    account.recoveryCodes = recoveryCodes
    const currentCode = generateTwoFactorCode(secret)
    const nextUser: User = { ...user, twoFactorEnabled: true }
    setUser(nextUser)
    setAccounts((prev) => prev.map((acc) => (acc.id === account.id ? { ...account } : acc)))
    return { secret, recoveryCodes, currentCode }
  }, [accounts, user])

  const disableTwoFactor = useCallback(async () => {
    if (!user) throw new Error('Користувач не авторизований')
    const account = accounts.find((acc) => acc.id === user.id)
    if (!account) throw new Error('Акаунт не знайдено')
    if (!account.twoFactorEnabled) return
    account.twoFactorEnabled = false
    account.twoFactorSecret = generateTwoFactorSecret()
    const refreshedCodes = generateRecoveryCodes()
    account.recoveryCodes = refreshedCodes
    const nextUser: User = { ...user, twoFactorEnabled: false }
    setUser(nextUser)
    setAccounts((prev) => prev.map((acc) => (acc.id === account.id ? { ...account } : acc)))
  }, [accounts, user])

  const regenerateRecoveryCodes = useCallback(async () => {
    if (!user) throw new Error('Користувач не авторизований')
    const account = accounts.find((acc) => acc.id === user.id)
    if (!account) throw new Error('Акаунт не знайдено')
    const codes = generateRecoveryCodes()
    account.recoveryCodes = codes
    setAccounts((prev) => prev.map((acc) => (acc.id === account.id ? { ...account } : acc)))
    return codes
  }, [accounts, user])

  const getRecoveryCodes = useCallback(async () => {
    if (!user) throw new Error('Користувач не авторизований')
    const account = accounts.find((acc) => acc.id === user.id)
    if (!account) throw new Error('Акаунт не знайдено')
    return [...account.recoveryCodes]
  }, [accounts, user])

  const recoverAccount = useCallback(
    async ({ email, recoveryCode, newPassword }: RecoverAccountPayload): Promise<RecoverAccountResult> => {
      const normalizedEmail = normalizeEmail(email)
      const account = accounts.find((acc) => acc.email === normalizedEmail)
      if (!account) throw new Error('Акаунт із таким email не знайдено')
      const code = normalizeCode(recoveryCode)
      const rollback = account.recoveryCodes.some((c) => normalizeCode(c) === code)
      if (!rollback) throw new Error('Неправильний резервний код')
      if (newPassword.trim().length < 6) throw new Error('Новий пароль має містити щонайменше 6 символів')
      account.password = newPassword.trim()
      account.twoFactorEnabled = false
      account.twoFactorSecret = generateTwoFactorSecret()
      const newCodes = generateRecoveryCodes()
      account.recoveryCodes = newCodes
      setAccounts((prev) => prev.map((acc) => (acc.id === account.id ? { ...account } : acc)))
      return {
        recoveryCodes: newCodes,
        message: 'Пароль змінено. 2FA вимкнено, ви можете увімкнути його знову після входу.',
      }
    },
    [accounts],
  )

  const value = useMemo(
    () => ({
      user,
      register,
      login,
      verifyTwoFactor,
      verifyEmail,
      resendVerification,
      pendingVerification,
      logout,
      update,
      enableTwoFactor,
      disableTwoFactor,
      regenerateRecoveryCodes,
      getRecoveryCodes,
      recoverAccount,
    }),
    [
      user,
      register,
      login,
      verifyTwoFactor,
      verifyEmail,
      resendVerification,
      pendingVerification,
      logout,
      update,
      enableTwoFactor,
      disableTwoFactor,
      regenerateRecoveryCodes,
      getRecoveryCodes,
      recoverAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
