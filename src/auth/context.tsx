import { createContext } from 'react'

export type User = {
  id: string
  name: string
  email: string
  createdAt: string
  twoFactorEnabled: boolean
  emailVerified: boolean
}

export type RegisterPayload = {
  name: string
  email: string
  password: string
}

export type RegisterResult =
  | {
      status: 'pending-verification'
      email: string
      recoveryCodes: string[]
      expiresAt: string | null
    }
  | {
      status: 'success'
      user: User
      recoveryCodes: string[]
    }

export type LoginPayload = {
  email: string
  password: string
  code?: string
}

export type LoginResult =
  | { status: 'success'; user: User }
  | { status: 'two-factor'; challengeId: string; message: string }
  | { status: 'needs-verification'; email: string; message: string }

export type VerifyTwoFactorPayload = {
  challengeId: string
  code?: string
  recoveryCode?: string
}

export type UpdatePayload = Partial<Pick<User, 'name' | 'email'>>

export type EnableTwoFactorResult = {
  secret: string
  recoveryCodes: string[]
  currentCode: string
}

export type RecoverAccountPayload = {
  email: string
  recoveryCode: string
  newPassword: string
}

export type RecoverAccountResult = {
  recoveryCodes: string[]
  message: string
}

export type AuthContextValue = {
  user: User | null
  register: (payload: RegisterPayload) => Promise<RegisterResult>
  login: (payload: LoginPayload) => Promise<LoginResult>
  verifyTwoFactor: (payload: VerifyTwoFactorPayload) => Promise<User>
  verifyEmail: (email: string, code: string) => Promise<User>
  resendVerification: (email: string) => Promise<void>
  pendingVerification: { email: string; expiresAt: string | null } | null
  logout: () => void
  update: (patch: UpdatePayload) => Promise<User>
  enableTwoFactor: () => Promise<EnableTwoFactorResult>
  disableTwoFactor: () => Promise<void>
  regenerateRecoveryCodes: () => Promise<string[]>
  getRecoveryCodes: () => Promise<string[]>
  recoverAccount: (payload: RecoverAccountPayload) => Promise<RecoverAccountResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
