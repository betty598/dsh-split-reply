/**
 * 假的 QQ 官方 SDK：真实那个只有宿主里才有，测试里用它顶替。
 * 只提供 QQBot 类，原型上有一个能记账的 sendMarkdown。
 */
export class QQBot {
  constructor(target) {
    this.target = target
  }

  async sendMarkdown() {
    throw new Error('测试应该先覆盖 sendMarkdown')
  }
}
