import { describe, it, expect } from 'vitest'
import { highlightJson } from './highlight'

describe('highlightJson', () => {
  it('marks keys and string values differently', () => {
    const out = highlightJson('{"name": "Spill"}')
    expect(out).toContain('<span class="jk">"name"</span>')
    expect(out).toContain('<span class="js">"Spill"</span>')
  })

  it('marks numbers and literals', () => {
    const out = highlightJson('{"a": 50, "b": true, "c": null}')
    expect(out).toContain('<span class="jn">50</span>')
    expect(out).toContain('<span class="jl">true</span>')
    expect(out).toContain('<span class="jl">null</span>')
  })

  it('neutralises markup in user-authored values', () => {
    const out = highlightJson(JSON.stringify({ name: '<img src=x onerror=alert(1)>' }))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('neutralises markup in user-authored keys', () => {
    const out = highlightJson(JSON.stringify({ '<script>': 1 }))
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes ampersands before anything else', () => {
    expect(highlightJson('{"a": "A&B"}')).toContain('A&amp;B')
  })
})
