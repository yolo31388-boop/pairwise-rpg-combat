
// 输入缓冲 - 存在输入丢失bug
class InputBuffer {
  constructor(window = 0.15) {
    this.window = window;
    this.inputs = []; // BUG: 没有时间戳
  }
  record(input) {
    this.inputs.push(input); // BUG: 不记录时间
    if (this.inputs.length > 5) this.inputs.shift(); // BUG: 固定长度覆盖
  }
  consume() {
    if (this.inputs.length > 0) return this.inputs.shift();
    return null;
  }
  update(dt) { /* BUG: 不清理过期输入 */ }
}

module.exports = { InputBuffer };
