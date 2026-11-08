import { describe, expect, it } from 'vitest'
import { AI_BOTS, isAiBot } from './aiBots.ts'

describe('isAiBot', () => {
  it('matches known AI crawlers case-insensitively', () => {
    expect(
      isAiBot(
        'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      ),
    ).toBe(true)
    expect(isAiBot('Mozilla/5.0 (compatible; claudebot/1.0; +claudebot@anthropic.com)')).toBe(true)
    expect(isAiBot('CCBot/2.0 (https://commoncrawl.org/faq/)')).toBe(true)
    expect(isAiBot('Mozilla/5.0 (compatible; meta-externalagent/1.1)')).toBe(true)
  })
  it('lets browsers, search engines and empty UAs through', () => {
    expect(isAiBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')).toBe(
      false,
    )
    expect(
      isAiBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toBe(false)
    expect(isAiBot('')).toBe(false)
    expect(isAiBot(null)).toBe(false)
  })
  it('has every listed token self-matching', () => {
    for (const b of AI_BOTS) expect(isAiBot(`x ${b}/1.0`)).toBe(true)
  })
})
