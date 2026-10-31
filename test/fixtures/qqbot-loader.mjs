/**
 * 测试用的模块解析钩子：把 '@tencent-connect/qqbot-nodejs' 指到假包。
 * 只有 node --test 起的进程里会用到，真实运行时走宿主提供的真包。
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@tencent-connect/qqbot-nodejs') {
    return {
      url: new URL('./fake-qqbot.mjs', import.meta.url).href,
      shortCircuit: true,
    }
  }
  return nextResolve(specifier, context)
}
