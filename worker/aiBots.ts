/** User-Agent tokens of known AI training/scraping crawlers (matched case-insensitively). */
export const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'GoogleOther',
  'PerplexityBot',
  'Perplexity-User',
  'Bytespider',
  'Amazonbot',
  'Applebot-Extended',
  'meta-externalagent',
  'meta-externalfetcher',
  'FacebookBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'omgili',
  'YouBot',
  'PetalBot',
  'Timpibot',
  'Scrapy',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'Kangaroo Bot',
  'img2dataset',
  'DuckAssistBot',
  'MistralAI-User',
] as const

const PATTERN = new RegExp(
  AI_BOTS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
)

export const isAiBot = (userAgent: string | null | undefined): boolean =>
  !!userAgent && PATTERN.test(userAgent)
