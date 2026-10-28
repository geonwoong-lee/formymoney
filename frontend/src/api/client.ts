const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface HealthResponse {
  status: 'ok'
  app: string
  database: 'ok'
  referenceKey: string
}

export class ApiError extends Error {
  readonly status?: number

  constructor(
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/health`, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError('백엔드에 연결할 수 없습니다.')
  }

  if (!response.ok) {
    throw new ApiError('서비스 상태를 확인하지 못했습니다.', response.status)
  }

  return response.json() as Promise<HealthResponse>
}
