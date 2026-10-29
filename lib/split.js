/**
 * 分句逻辑（纯函数，好测）
 *
 * 目标：把一整段回复切成 2~4 条短消息，像人发微信那样一条一条来。
 * 不干的事：不碰代码块、不碰表格、不把一句话拆散。
 */
const SENTENCE_END = '。！？!?…~～'
const CLOSERS = '”’」』）)】》>'

export const DEFAULTS = {
  enabled: true,
  /** 最多拆几条（QQ 官方对同一条消息的被动回复有次数上限，别贪多） */
  maxSegments: 4,
  /** 短于这个字数的碎片不单独成条，并回上一句 */
  minSegmentChars: 4,
  /** 整段短于这个字数就不拆了 */
  minTotalChars: 10,
  /** 两条之间隔多久（毫秒，随机取值） */
  minIntervalMs: 700,
  maxIntervalMs: 1600,
  /** 换行也算分段点 */
  splitOnNewline: true,
}

/** 代码块 / 表格 / 标题这类东西拆了会散架，整段放行 */
function looksStructured(text) {
  return /```|^\s*\|.*\|\s*$/m.test(text) || /^\s{0,3}#{1,6}\s/m.test(text)
}

/** 按标点切成句子（标点跟着前一句走，后面的引号括号也跟过去） */
function cutSentences(text) {
  const out = []
  let buf = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    buf += ch
    if (SENTENCE_END.includes(ch)) {
      // 连着好几个标点（比如「？！」）算一句话
      while (i + 1 < text.length && SENTENCE_END.includes(text[i + 1])) buf += text[++i]
      // 收尾的引号、括号
      while (i + 1 < text.length && CLOSERS.includes(text[i + 1])) buf += text[++i]
      out.push(buf)
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** 把过短的碎片并进邻居，直到没有太短的 */
function mergeShort(segments, min) {
  const out = []
  for (const seg of segments) {
    if (out.length === 0) {
      out.push(seg)
      continue
    }
    const prev = out[out.length - 1]
    if (stripLen(prev) < min || stripLen(seg) < min) {
      out[out.length - 1] = prev + seg
    } else {
      out.push(seg)
    }
  }
  return out
}

function stripLen(s) {
  return s.replace(/[\s。！？!?…~～]+$/u, '').trim().length
}

/** 太多了就合并：每次合并最短的相邻两条 */
function capSegments(segments, max) {
  const list = [...segments]
  while (list.length > max) {
    let best = 0
    let bestLen = Infinity
    for (let i = 0; i < list.length - 1; i++) {
      const len = list[i].length + list[i + 1].length
      if (len < bestLen) {
        bestLen = len
        best = i
      }
    }
    list.splice(best, 2, list[best] + list[best + 1])
  }
  return list
}

/**
 * @param {string} text
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {string[]} 1 条 = 不拆
 */
export function splitText(text, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const raw = String(text ?? '')
  const trimmed = raw.trim()
  if (!opts.enabled) return [raw]
  if (!trimmed) return [raw]
  if (trimmed.length < opts.minTotalChars) return [raw]
  if (looksStructured(raw)) return [raw]

  let segments = opts.splitOnNewline
    ? trimmed.split(/\n+/).flatMap((line) => cutSentences(line))
    : cutSentences(trimmed)

  segments = mergeShort(segments, opts.minSegmentChars)
  segments = capSegments(segments, Math.max(1, opts.maxSegments))

  if (segments.length <= 1) return [raw]
  return segments
}

/** 拆完之后两条之间等多久 */
export function pickDelay(options = {}, random = Math.random) {
  const opts = { ...DEFAULTS, ...options }
  const min = Math.max(0, opts.minIntervalMs)
  const max = Math.max(min, opts.maxIntervalMs)
  return Math.round(min + random() * (max - min))
}
