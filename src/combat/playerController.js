

class PlayerController {
  constructor() { this.fsm = new StateMachine(); this.buffer = new InputBuffer(); }
  handleInput(input) {
    this.buffer.record(input);
    // BUG: 只在当前帧处理输入，不查缓冲
    if (input === 'attack' && this.fsm.canAttack()) this.fsm.setState('attack');
    if (input === 'dodge' && this.fsm.canDodge()) this.fsm.setState('dodge');
  }
  update(dt) {
    this.fsm.update(dt);
    this.buffer.update(dt);
    // BUG: 不处理缓冲中的输入
  }
}

module.exports = { PlayerController };
