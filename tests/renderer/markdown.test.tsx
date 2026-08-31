import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownView } from '../../src/renderer/src/components'

describe('strict Markdown rendering', () => {
  it('drops script HTML, event handlers and dangerous link protocols', () => {
    const html = renderToStaticMarkup(
      <MarkdownView markdown={'# 安全正文\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n<img src="x" onerror="alert(2)">'} />
    )

    expect(html).toContain('安全正文')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onerror')
  })

  it('keeps HTTPS links but never creates executable local-protocol links', () => {
    const html = renderToStaticMarkup(
      <MarkdownView markdown={'[官方资料](https://example.com/docs) [本地文件](file:///C:/secret.txt)'} />
    )

    expect(html).toContain('href="https://example.com/docs"')
    expect(html).not.toContain('file:///')
  })
})
