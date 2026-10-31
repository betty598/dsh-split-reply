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
 * 为什么要自愈：
 *   宿主重载时会把 QQBot 重新加载成新的一份类，旧的包层跟着旧类一起被丢掉，
 *   而 apply 不会因此再跑一次——从那一刻起就静默不拆了（0.1.0 踩过的坑）。
 *   所以这里每 5 秒探一眼，包层没了就补上；真正发消息时也会顺手补一次。
 *
 * 不拆的情况：带键盘（按钮消息）、代码块、表格、短句。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS, pickDelay, splitText } from './split.js'

export const name = 'split-reply'
export const inject = ['webServer']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const LOG_DIR = join(DSH_HOME, 'split-reply')
const LOG_PATH = join(LOG_DIR, 'diag.log')

/** 自愈探针的间隔：包层丢了最多这么久补回来 */
export const HEAL_INTERVAL_MS = 5000

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

/**
 * 把 proto.sendMarkdown 包成「拆句版」。
 * 幂等：已经包过的那份类返回 false，不会套第二层。
 * source 只用来在日志里区分是谁补的（apply / self-heal / lazy）。
 */
export function patchProto(proto, source = 'apply') {
  if (!proto || typeof proto.sendMarkdown !== 'function') return false
  if (proto.__dshSplitReplyPatched) {
    state.patched = true
    return false
  }

  const original = proto.sendMarkdown

  proto.sendMarkdown = async function splitSendMarkdown(target, content, opts) {
    // 现场自愈：能走到这就说明手上是一个还没包过的类，顺手补上
    try {
      const own = this?.constructor?.prototype
      if (own && own !== proto && typeof own.sendMarkdown === 'function' && !own.__dshSplitReplyPatched) {
        patchProto(own, 'lazy')
      }
    } catch {
      /* 补挂失败不影响这次发送 */
    }

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
  state.error = ''
  log(`patched QQBot.prototype.sendMarkdown (${source})`)
  return true
}

async function patchSendMarkdown(ctx, source = 'apply') {
  let QQBot
  try {
    ;({ QQBot } = await import('@tencent-connect/qqbot-nodejs'))
  } catch (err) {
    state.error = `import failed: ${err?.message ?? err}`
    log(state.error)
    return false
  }
  const proto = QQBot?.prototype
  if (!proto || typeof proto.sendMarkdown !== 'function') {
    state.error = 'sendMarkdown not found on QQBot.prototype'
    log(state.error)
    return false
  }
  return patchProto(proto, source)
}

let healTimer = null

/** 每 HEAL_INTERVAL_MS 探一次，包层被换掉就补回来（单例，重复 apply 不会叠加定时器） */
function startSelfHeal(ctx) {
  if (healTimer) return
  healTimer = setInterval(() => {
    patchSendMarkdown(ctx, 'self-heal').catch(() => {})
  }, HEAL_INTERVAL_MS)
  healTimer.unref?.()
}

export async function apply(ctx, config) {
  state.config = { ...DEFAULTS, ...(config ?? {}) }
  await patchSendMarkdown(ctx)
  startSelfHeal(ctx)

  // 给面板/调试留个口子：/dsh-split-reply/status
  try {
    ctx?.webServer?.register?.({
      kind: 'exact',
      path: '/dsh-split-reply/status',
      handler: async (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          patched: state.patched,
          selfHeal: healTimer !== null,
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
