
// 状态机 - 存在状态不互斥和输入丢失bug
class StateMachine {
  constructor() { this.currentState = 'idle'; this.stateTime = 0; this.animFrame = 0; }
  setState(state) {
    // BUG: 没有状态互斥检查，可以从任何状态切到任何状态
    this.currentState = state;
    this.stateTime = 0;
    // BUG: 没有重置动画播放头
  }
  update(dt) {
    this.stateTime += dt;
    this.animFrame += dt * 30;
    // BUG: 受击硬直期间不锁定输入
  }
  canAttack() { return this.currentState === 'idle' || this.currentState === 'run'; }
  canDodge() { return true; } // BUG: 任何状态都能闪避
}

module.exports = { StateMachine };
