import { createContext } from 'react'

export type User = {
  id: string
  name: string
  email: string
  createdAt: string
}

export type RegisterPayload = {
  name: string
  email: string
  password: string
}

export type LoginPayload = {
  email: string
  password: string
}

export type UpdatePayload = Partial<Pick<User, 'name' | 'email'>>

export type AuthContextValue = {
  user: User | null
  register: (payload: RegisterPayload) => Promise<User>
  login: (payload: LoginPayload) => Promise<User>
  logout: () => void
  update: (patch: UpdatePayload) => Promise<User>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
