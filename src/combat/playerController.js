
// 玩家控制器: 连接输入缓冲与战斗状态机。
// - handleInput: 记录输入并立即尝试触发; 当前不能执行的动作留在缓冲队列。
// - update: 先推进状态机真实时间, 再推进缓冲时钟 (超时丢弃),
//   最后按 FIFO 排空缓冲, 当前状态结束后排队的动作自动触发。

const { StateMachine } = require('./stateMachine.js');
const { InputBuffer } = require('../input/buffer.js');

class PlayerController {
  constructor(options = {}) {
    this.fsm = new StateMachine(options);
    this.buffer = new InputBuffer(
      options.bufferWindow !== undefined ? options.bufferWindow : 0.15
    );
  }

  handleInput(input) {
    // 死亡锁定所有输入: 不记录, 不触发, 不能复活。
    if (this.fsm.currentState === 'dead') return;

    // 受击硬直: 忽略所有攻击和移动输入 (不入队), 只能播放受击动画。
    // 闪避不属于攻击/移动, 允许进入缓冲, 硬直结束后自动触发。
    if (this.fsm.currentState === 'hit') {
      if (input === 'attack' || input === 'move') return;
    }

    this.buffer.record(input);
    this._drainBuffer();
  }

  // 严格 FIFO: 队首动作当前可执行才消费并执行, 否则停止等待
  // (后续动作不能越过队首; 队首超时后由缓冲丢弃, 再处理下一个)。
  // 每轮排空最多触发一个动作 (一帧一个动作), 避免在新状态里连续吞掉
  // 后续输入; 触发后的新状态留待下一轮/下一帧重新判定。
  _drainBuffer() {
    if (this.buffer.length === 0) return;
    const action = this.buffer.peek();
    if (action === null) return;

    if (action === 'attack') {
      if (!this.fsm.acceptsAttack()) return;
      this.buffer.consume();
      this.fsm.setState('attack');
    } else if (action === 'dodge') {
      if (!this.fsm.canDodge()) return;
      this.buffer.consume();
      this.fsm.setState('dodge');
    } else if (action === 'move') {
      if (!this.fsm.acceptsMove()) return;
      this.buffer.consume();
      this.fsm.setState('run');
    } else {
      this.buffer.consume(); // 未识别输入不阻塞队列
    }
  }

  update(dt) {
    this.fsm.update(dt);       // 状态到时自动结束 (真实时间)
    this.buffer.update(dt);    // 丢弃缓冲超时的输入
    this._drainBuffer();       // 当前状态结束后自动触发排队动作
  }
}

module.exports = { PlayerController };
