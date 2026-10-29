/**
 * dsh-split-reply · 宿主半边
 *
 * 干一件事：把 QQ 那边发出去的整段回复，拆成几句、隔一两秒一条条发。
 *
 * 为什么是「包一层」而不是自己发：
 *   dsh-qqbot 所有出站文字最后都汇到 QQBot.prototype.sendMarkdown 这一个口子
 *   （transport/outbound.js 的 send()、deliverables、错误提示、提问卡片都走它）。
 *   在原型上包一层，既不用改官方包、也不用改它的配置，升级后还在。
 *
 * 不拆的情况：带键盘（按钮消息）、代码块、表格、短句。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS, pickDelay, splitText } from './split.js'

export const name = 'split-reply'
export const inject = { required: [], optional: ['webServer'] }

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const LOG_DIR = join(DSH_HOME, 'split-reply')
const LOG_PATH = join(LOG_DIR, 'diag.log')

const state = {
  config: { ...DEFAULTS },
  patched: false,
  pending: 0,
  sent: 0,
  splitAt: 0,
  error: '',
}

function log(line) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* 记日志失败不该影响发消息 */
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function shouldBypass(opts, text) {
  if (opts && (opts.keyboard || opts.updateMsgId || opts.msgId)) return true
  if (!text) return true
  if (/```|^\s*\|.*\|\s*$/m.test(text)) return true
  return false
}

async function patchSendMarkdown(ctx) {
  let QQBot
  try {
    ;({ QQBot } = await import('@tencent-connect/qqbot-nodejs'))
  } catch (err) {
    state.error = `import failed: ${err?.message ?? err}`
    log(state.error)
    return
  }
  const proto = QQBot?.prototype
  if (!proto || typeof proto.sendMarkdown !== 'function') {
    state.error = 'sendMarkdown not found on QQBot.prototype'
    log(state.error)
    return
  }
  if (proto.__dshSplitReplyPatched) {
    state.patched = true
    return
  }

  const original = proto.sendMarkdown

  proto.sendMarkdown = async function splitSendMarkdown(target, content, opts) {
    const text = typeof content === 'string' ? content : String(content ?? '')
    state.pending += 1
    try {
      if (shouldBypass(opts, text)) return await original.call(this, target, content, opts)
      const segments = splitText(text, state.config)
      if (segments.length <= 1) return await original.call(this, target, content, opts)

      state.splitAt += 1
      log(`split ${segments.length} segments (${text.length} chars): ${segments.map((s) => s.length).join('/')}`)

      let last
      for (let i = 0; i < segments.length; i++) {
        if (i > 0) await sleep(pickDelay(state.config))
        try {
          last = await original.call(this, target, segments[i], opts)
          state.sent += 1
        } catch (err) {
          // 拆到一半被限流/失败了：剩下的不再发，把错误咽下去，别让整轮崩掉
          log(`segment ${i + 1}/${segments.length} failed: ${err?.message ?? err}`)
          break
        }
      }
      return last
    } finally {
      state.pending -= 1
    }
  }

  proto.__dshSplitReplyPatched = true
  state.patched = true
  log('patched QQBot.prototype.sendMarkdown')
}

export async function apply(ctx, config) {
  state.config = { ...DEFAULTS, ...(config ?? {}) }
  await patchSendMarkdown(ctx)

  // 给面板/调试留个口子：/dsh-split-reply/status
  try {
    ctx?.webServer?.register?.({
      kind: 'exact',
      path: '/dsh-split-reply/status',
      handler: async (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          patched: state.patched,
          config: state.config,
          inflight: state.pending,
          segmentsSent: state.sent,
          messagesSplit: state.splitAt,
          error: state.error,
        }))
      },
    })
  } catch {
    /* 没有 webServer 就算了，不影响拆句 */
  }
}
