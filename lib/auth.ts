const MOCK_EMAIL = 'doctor@clinic.com'
const MOCK_PASSWORD = 'clinic2026'
const TOKEN_KEY = 'ag_doctor_token'

export function login(email: string, password: string): boolean {
  if (email === MOCK_EMAIL && password === MOCK_PASSWORD) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, 'mock-token-2026')
    }
    return true
  }
  return false
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function isAuthenticated(): boolean {
  if (typeof window !== 'undefined') {
    return !!localStorage.getItem(TOKEN_KEY)
  }
  return false
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY)
  }
  return null
}
