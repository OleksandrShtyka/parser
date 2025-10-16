const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const payload = await parseBody(res)

  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      message = payload.error
    }
    throw new ApiError(message, res.status, payload)
  }

  return payload as T
}

export type VideoFormat = {
  format_id: string
  ext: string
  resolution?: string | null
  abr?: number | null
  vcodec?: string | null
  acodec?: string | null
  filesize?: number | null
  format_note?: string | null
}

export type VideoInfoResponse = {
  id: string
  title: string
  duration?: number
  thumbnail?: string
  uploader?: string
  webpage_url?: string
  formats: VideoFormat[]
}

export async function fetchVideoInfo(url: string) {
  return apiRequest<VideoInfoResponse>('/api/info', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ url }),
  })
}

export function buildDownloadUrl(url: string, formatId: string) {
  if (typeof window === 'undefined') {
    throw new Error('buildDownloadUrl is only available in the browser runtime')
  }
  const endpoint = new URL('/api/download', window.location.origin)
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('format_id', formatId)
  return endpoint.toString()
}

export type SendVerificationEmailPayload = { email: string; code: string; name: string }
export type SendVerificationEmailResponse = { ok: boolean; sent?: boolean; message?: string }

export async function sendVerificationEmail({ email, code, name }: SendVerificationEmailPayload) {
  if (typeof window === 'undefined') {
    return { ok: true, sent: false } satisfies SendVerificationEmailResponse
  }
  return apiRequest<SendVerificationEmailResponse>('/api/send-verification', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, code, name }),
  })
}
