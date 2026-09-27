// 输入缓冲队列
// 每个输入记录进入缓冲的真实时间, update(dt) 推进缓冲时钟并丢弃
// 超过缓冲窗口 (window, 秒) 的输入。队列严格 FIFO, 保证多输入按序处理。

const DEFAULT_WINDOW = 0.15;
const MAX_BUFFERED = 8;

class InputBuffer {
  constructor(window = DEFAULT_WINDOW) {
    this.window = window;
    this.inputs = []; // { action, at }
    this.clock = 0;   // 缓冲自己的真实时间时钟 (秒)
  }

  record(input) {
    this.inputs.push({ action: input, at: this.clock });
    // 容量保护: 丢弃最早的 (队首), 保留最新的输入。
    while (this.inputs.length > MAX_BUFFERED) this.inputs.shift();
  }

  // 查看队首且仍在缓冲窗口内的输入; 过期输入在此一并清除。
  _peekFresh() {
    while (this.inputs.length > 0) {
      const head = this.inputs[0];
      if (this.clock - head.at > this.window) {
        this.inputs.shift();
        continue;
      }
      return head;
    }
    return null;
  }

  consume() {
    const head = this._peekFresh();
    if (!head) return null;
    this.inputs.shift();
    return head.action;
  }

  // 只查询不消费 (供控制器判断队首动作当前是否可执行)。
  peek() {
    const head = this._peekFresh();
    return head ? head.action : null;
  }

  clear() {
    this.inputs = [];
  }

  get length() {
    this._peekFresh();
    return this.inputs.length;
  }

  update(dt) {
    if (typeof dt !== 'number' || dt < 0 || !isFinite(dt)) {
      throw new Error('update 需要非负有限的真实时间增量 dt (秒)');
    }
    this.clock += dt;
    this._peekFresh(); // 丢弃缓冲超时的输入
  }
}

module.exports = { InputBuffer };
