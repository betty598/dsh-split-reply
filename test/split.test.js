import test from 'node:test'
import assert from 'node:assert/strict'
import { pickDelay, splitText } from '../lib/split.js'

const plain = (s) => s.replace(/[\s。！？!?…~～]+$/u, '')

test('一整段话按标点拆开', () => {
  const text = '哦...这样啊。那我也不懂。你自己看着办吧，反正我信你。'
  const segs = splitText(text)
  assert.ok(segs.length >= 3, `想要至少 3 段，拿到 ${segs.length}`)
  assert.ok(segs.every((s) => s.trim().length > 0))
  for (const s of segs) assert.match(s, /[。！？!?…~～]$/)
})

test('短句不拆', () => {
  assert.deepEqual(splitText('好。'), ['好。'])
  assert.deepEqual(splitText('嗯。'), ['嗯。'])
})

test('代码块整段放行', () => {
  const text = '看这个。\n```js\nconsole.log(1)。\n```\n就这样。'
  assert.equal(splitText(text).length, 1)
})

test('表格整段放行', () => {
  const text = '结果如下。\n| a | b |\n|---|---|\n| 1 | 2 |\n就这样。'
  assert.equal(splitText(text).length, 1)
})

test('不超过 maxSegments', () => {
  const text = Array.from({ length: 9 }, (_, i) => `这是第${i}句话内容。`).join('')
  const segs = splitText(text, { maxSegments: 3 })
  assert.ok(segs.length <= 3, `拿到 ${segs.length} 段`)
})

test('过短的碎片并回邻居', () => {
  const text = '我去。今天真的有点累，想早点睡。好。'
  const segs = splitText(text)
  assert.ok(segs.every((s) => plain(s).length >= 2))
})

test('换行也分段', () => {
  const segs = splitText('第一行想说的话都在这\n第二行想说的话也在这')
  assert.equal(segs.length, 2)
})

test('间隔落在区间里', () => {
  for (let i = 0; i < 50; i++) {
    const d = pickDelay({ minIntervalMs: 700, maxIntervalMs: 1600 })
    assert.ok(d >= 700 && d <= 1600)
  }
})

test('关掉就原样返回', () => {
  const text = '一句。两句。三句。'
  assert.deepEqual(splitText(text, { enabled: false }), [text])
})
