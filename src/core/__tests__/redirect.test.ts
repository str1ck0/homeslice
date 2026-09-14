import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from '../redirect'

describe('safeRedirectPath', () => {
  it('keeps a path on this site, query and all', () => {
    expect(safeRedirectPath('/groups/abc?created=1')).toBe('/groups/abc?created=1')
    expect(safeRedirectPath('/reset-password')).toBe('/reset-password')
  })

  it('falls back when there is nothing to go to', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard')
    expect(safeRedirectPath(undefined)).toBe('/dashboard')
    expect(safeRedirectPath('')).toBe('/dashboard')
  })

  it('refuses another site written as a protocol-relative address', () => {
    expect(safeRedirectPath('//evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('//evil.example/fake-login')).toBe('/dashboard')
  })

  it('refuses the backslash and whitespace spellings of the same thing', () => {
    expect(safeRedirectPath('/\\evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('/\t/evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('/.//evil.example')).toBe('/dashboard')
  })

  it('refuses full addresses and other schemes', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeRedirectPath('dashboard')).toBe('/dashboard')
  })

  it('treats an @ in a path as part of the path, not a login to another host', () => {
    expect(safeRedirectPath('/@evil.example')).toBe('/@evil.example')
  })

  it('uses the fallback it is given', () => {
    expect(safeRedirectPath('//evil.example', '/auth')).toBe('/auth')
  })
})
