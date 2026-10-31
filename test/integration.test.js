/**
 * 整条链路的自测：用假 QQBot 替掉官方包，从 apply 一路走到「拆成几条发出去」。
 * 单元测试只管切句，这里管的是「插件挂上去之后，消息真的会一条条走」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./fixtures/qqbot-loader.mjs', import.meta.url)

const FAST = { minIntervalMs: 5, maxIntervalMs: 10 }

test('apply 之后，长回复真的被拆成几条发出去', async () => {
  const { apply } = await import('../lib/index.js')
  const { QQBot } = await import('@tencent-connect/qqbot-nodejs')

  const sent = []
  QQBot.prototype.sendMarkdown = async function sendMarkdown(target, content) {
    sent.push(content)
    return 'ok'
  }

  await apply({}, FAST)

  const bot = new QQBot({ userId: 'u1' })
  await bot.sendMarkdown(bot.target, '哦...这样啊。那我也不懂。你自己看着办吧，反正我信你。', {})

  assert.ok(sent.length >= 2, `应该拆成多条，实际发了 ${sent.length} 条`)
  assert.ok(sent.every((s) => s.trim().length > 0))
})

test('挂上之后，短句不会被拆', async () => {
  const { QQBot } = await import('@tencent-connect/qqbot-nodejs')
  const sent = []
  QQBot.prototype.sendMarkdown = async function sendMarkdown(target, content) {
    sent.push(content)
    return 'ok'
  }
  // 已经 apply 过；换个假实例发短句即可
  const { apply } = await import('../lib/index.js')
  await apply({}, FAST)

  const bot = new QQBot({ userId: 'u2' })
  await bot.sendMarkdown(bot.target, '好。', {})
  assert.equal(sent.length, 1)
})

test('宿主换了新的一份 QQBot，探针会把它重新挂上', async () => {
  const { patchProto } = await import('../lib/index.js')

  // 重载后的新类：全新的原型，没有包层
  const relinked = {
    async sendMarkdown(target, content) {
      this.got = this.got ?? []
      this.got.push(content)
      return 'ok'
    },
  }
  assert.equal(relinked.__dshSplitReplyPatched, undefined)
  assert.equal(patchProto(relinked, 'self-heal'), true)

  const bot = Object.create(relinked)
  bot.sendMarkdown = relinked.sendMarkdown
  await bot.sendMarkdown({ id: 'u3' }, '第一句。第二句。第三句。', {})

  assert.ok((bot.got ?? []).length >= 1)
})
