#!/usr/bin/env node
/**
 * 把插件装进 DSH profile：
 *   1. 拷到 ~/.dsh/profiles/desktop/_plugins/dsh-split-reply
 *   2. profile package.json 里加 link 依赖 + bundles
 *   3. node_modules 里建符号链接
 *   4. cordis.patch.yml 里加一段配置（默认值写进去，方便改）
 */
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = homedir()
const PROFILE = join(HOME, '.dsh/profiles/desktop')
const SRC = process.argv[2]
const NAME = 'dsh-split-reply'
const DEST = join(PROFILE, '_plugins', NAME)
if (!SRC) {
  console.error('usage: install.mjs <plugin-src-dir>')
  process.exit(1)
}

// 1. 拷贝
mkdirSync(DEST, { recursive: true })
for (const entry of ['lib', 'cordis.patch.yml', 'README.md', 'package.json']) {
  const from = join(SRC, entry)
  if (existsSync(from)) cpSync(from, join(DEST, entry), { recursive: true })
}
console.log('copied →', DEST)

// 2. package.json
const pkgPath = join(PROFILE, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.dependencies ??= {}
pkg.dependencies[NAME] = `link:${DEST}`
pkg.dsh ??= {}
pkg.dsh.profile ??= {}
pkg.dsh.profile.bundles ??= []
if (!pkg.dsh.profile.bundles.includes(NAME)) pkg.dsh.profile.bundles.push(NAME)
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('package.json updated: dependency + bundles')

// 3. 符号链接
const linkPath = join(PROFILE, 'node_modules', NAME)
if (!existsSync(linkPath)) {
  mkdirSync(join(PROFILE, 'node_modules'), { recursive: true })
  symlinkSync(DEST, linkPath, 'dir')
  console.log('linked →', linkPath)
} else {
  console.log('link already exists:', linkPath)
}

// 4. cordis.patch.yml 配置
const patchPath = join(PROFILE, 'cordis.patch.yml')
let yml = readFileSync(patchPath, 'utf8')
if (!yml.includes('id: split-reply')) {
  yml += `
# 分段式回复：QQ 那边的整段话拆成几句、隔一两秒一条条发
- id: split-reply
  name: ${NAME}
  config:
    enabled: true
    maxSegments: 4
    minSegmentChars: 4
    minTotalChars: 10
    minIntervalMs: 700
    maxIntervalMs: 1600
    splitOnNewline: true
`
  writeFileSync(patchPath, yml)
  console.log('cordis.patch.yml updated')
} else {
  console.log('cordis.patch.yml already has split-reply')
}
