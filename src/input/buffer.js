// 输入缓冲队列
// 每条输入记录真实时间戳；超过缓冲窗口的输入在 update 时自动丢弃；
// 队列严格 FIFO，多输入按入队顺序处理。
class InputBuffer {
  constructor(window = 0.15) {
    this.window = window; // 缓冲时间（秒，真实时间）
    this.inputs = []; // { input, time }
    this.now = 0;
  }

  record(input, time) {
    const at = time !== undefined ? time : this.now;
    this.inputs.push({ input, time: at });
    return at;
  }

  // 取出队头仍未过期的输入（过期输入先被丢弃）
  consume(time) {
    this.prune(time);
    const entry = this.inputs.shift();
    return entry ? entry.input : null;
  }

  peek() {
    return this.inputs.length > 0 ? this.inputs[0] : null;
  }

  // 丢弃所有已超过缓冲窗口的输入
  prune(time) {
    const at = time !== undefined ? time : this.now;
    while (this.inputs.length > 0 && at - this.inputs[0].time > this.window) {
      this.inputs.shift();
    }
  }

  clear() {
    this.inputs = [];
  }

  get length() {
    return this.inputs.length;
  }

  // 兼容旧用法：buffer.inputs.length
  update(dt) {
    if (typeof dt !== 'number' || dt < 0) return;
    this.now += dt;
    this.prune();
  }
}

module.exports = { InputBuffer };
