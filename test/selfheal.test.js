import test from 'node:test'
import assert from 'node:assert/strict'
import { HEAL_INTERVAL_MS, patchProto } from '../lib/index.js'

/** 假的原型：只记下每次发出去的正文 */
function fakeProto() {
  const sent = []
  const proto = {
    async sendMarkdown(target, content) {
      sent.push(content)
      return 'ok'
    },
  }
  return { proto, sent }
}

test('自愈探针间隔是个正数', () => {
  assert.equal(typeof HEAL_INTERVAL_MS, 'number')
  assert.ok(HEAL_INTERVAL_MS > 0)
})

test('包一次就够，再包是空操作', () => {
  const { proto } = fakeProto()
  assert.equal(patchProto(proto, 'test'), true)
  assert.equal(patchProto(proto, 'test'), false)
  assert.equal(patchProto(proto, 'test'), false)
})

test('宿主重载换了新的一份类，自愈会把新的那份也包上', () => {
  const first = fakeProto()
  patchProto(first.proto, 'test')

  // 重载后是另一份全新的类：原型上没有标记
  const second = fakeProto()
  assert.equal(second.proto.__dshSplitReplyPatched, undefined)
  assert.equal(patchProto(second.proto, 'self-heal'), true)
  assert.equal(second.proto.__dshSplitReplyPatched, true)
})

test('包上之后长句真的会被拆成多条发出去', async () => {
  const { proto, sent } = fakeProto()
  patchProto(proto, 'test')
  await proto.sendMarkdown({ id: 'u' }, '哦...这样啊。那我也不懂。你自己看着办吧，反正我信你。', {})
  assert.ok(sent.length >= 2, `应该拆成多条，实际发了 ${sent.length} 条`)
  assert.ok(sent.every((s) => s.trim().length > 0))
})

test('短句和代码块整段放行，不拆', async () => {
  const { proto, sent } = fakeProto()
  patchProto(proto, 'test')
  await proto.sendMarkdown({ id: 'u' }, '好。', {})
  await proto.sendMarkdown({ id: 'u' }, '看这个。\n```js\nconsole.log(1)。\n```\n就这样。', {})
  assert.equal(sent.length, 2)
})
