const { StateMachine } = require('./stateMachine.js');
const { InputBuffer } = require('../input/buffer.js');

// 受击硬直期间必须忽略的输入（攻击/移动；只能播放受击动画）
const LOCKED_INPUTS = ['attack', 'move', 'run'];

class PlayerController {
  constructor(options = {}) {
    this.fsm = new StateMachine(options);
    this.buffer = new InputBuffer(options.bufferWindow);
  }

  // 公开用途不变：接收一帧的输入
  handleInput(input) {
    if (this.fsm.currentState === 'dead') return; // 死亡锁定全部输入
    if (this.fsm.currentState === 'hit') {
      // 受击硬直：攻击/移动等输入直接忽略；其余输入也不驱动任何动作，
      // 只能播放受击动画（缓冲在状态结束后才有机会生效）
      if (LOCKED_INPUTS.indexOf(input) !== -1) return;
    }
    this.buffer.record(input);
    this._drainBuffer();
  }

  // 公开用途不变：每帧推进（dt 为真实时间增量，单位秒）
  update(dt) {
    this.fsm.update(dt);
    this.buffer.update(dt);
    if (this.fsm.currentState === 'dead') {
      this.buffer.clear();
      return;
    }
    this._drainBuffer();
  }

  // 依次尝试消费缓冲队列：队头输入在当前状态可触发则立即触发，
  // 否则保留等待当前状态结束（缓冲窗口内自动触发）；
  // 已过期的输入在 consume/prune 中丢弃。
  _drainBuffer() {
    if (this.fsm.currentState === 'dead' || this.fsm.currentState === 'hit') {
      return;
    }
    while (this.buffer.peek()) {
      const head = this.buffer.peek();
      if (!this._tryApply(head.input)) break;
      this.buffer.consume();
    }
  }

  _tryApply(input) {
    const state = this.fsm.currentState;
    if (input === 'attack') {
      if (this.fsm.canAttack()) {
        this.fsm.setState('attack');
        return true;
      }
      return false; // 攻击前摇/闪避中：排队等待
    }
    if (input === 'dodge') {
      if (this.fsm.canDodge()) {
        this.fsm.setState('dodge');
        return true;
      }
      return false; // 攻击前摇不可打断：排队到后摇/状态结束
    }
    if (input === 'move' || input === 'run') {
      if (state === 'idle' || state === 'run') {
        this.fsm.setState('run');
        return true;
      }
      return false;
    }
    if (input === 'stop') {
      if (state === 'run') {
        this.fsm.setState('idle');
        return true;
      }
      return false;
    }
    // 未知输入消费掉，避免永久阻塞队列
    return true;
  }
}

module.exports = { PlayerController };
