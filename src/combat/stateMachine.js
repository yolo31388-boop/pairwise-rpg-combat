// 战斗状态机
// 不变量：
// 1. 状态互斥：任意时刻 currentState 有且仅有一个；非法转换一律抛错
// 2. 每次转换先退出旧状态（清理计时器/标志）再进入新状态（重置计时器与动画播放头）
// 3. 所有持续时间基于真实时间（秒），不使用帧计数
const STATES = ['idle', 'run', 'attack', 'dodge', 'hit', 'dead'];

// 默认状态持续时间（秒，真实时间）
const DEFAULT_DURATIONS = {
  idle: Infinity,
  run: Infinity,
  attack: 1.0,
  dodge: 0.4,
  hit: 0.3,
  dead: Infinity,
};

// 进入 hit / dead 的“受击源”状态永远合法（存活状态均可受击/死亡），
// 由构造参数 allowTransitions 决定的是常规动作转换。
class StateMachine {
  constructor(options = {}) {
    this.durations = Object.assign({}, DEFAULT_DURATIONS, options.durations || {});
    // 攻击后摇可被闪避取消的时间点（取消帧，单位：秒，可配置）
    this.attackCancelTime =
      options.attackCancelTime !== undefined ? options.attackCancelTime : 0.75;
    this.allowTransitions = options.allowTransitions || {
      idle: ['run', 'attack', 'dodge', 'hit', 'dead'],
      run: ['idle', 'attack', 'dodge', 'hit', 'dead'],
      attack: ['dodge', 'hit', 'dead', 'idle'],
      dodge: ['idle', 'run', 'hit', 'dead'],
      hit: ['idle', 'dead'],
      dead: [],
    };
    this.currentState = 'idle';
    this.stateTime = 0; // 当前状态已持续的真实时间（秒）
    this.animFrame = 0; // 当前状态自己的动画播放头（秒）
    this.flags = {}; // 仅属于当前状态的临时标志
    this.previousState = null;
    this.transitionCount = 0;
    this.onEnter = options.onEnter || null;
    this.onExit = options.onExit || null;
    // 初始化状态同样走进入回调，但不触发退出
    this._enterState('idle', null, { initial: true });
  }

  // 是否允许从 from 切到 to
  canTransition(from, to) {
    if (from === to) return false;
    const allowed = this.allowTransitions[from];
    if (!allowed || allowed.indexOf(to) === -1) return false;
    // 攻击前摇期间不能被闪避打断；stateTime >= attackCancelTime（后摇）才允许取消
    if (from === 'attack' && to === 'dodge') {
      return this.stateTime >= this.attackCancelTime;
    }
    return true;
  }

  setState(state) {
    if (STATES.indexOf(state) === -1) {
      throw new Error(`非法状态: ${state}`);
    }
    if (state === this.currentState) return; // 互斥：重复进入同一状态不是一次转换
    if (!this.canTransition(this.currentState, state)) {
      throw new Error(
        `非法状态切换: ${this.currentState} -> ${state}` +
          (this.currentState === 'attack' && state === 'dodge'
            ? `（攻击前摇不可闪避取消，stateTime=${this.stateTime} < ${this.attackCancelTime}）`
            : '')
      );
    }
    const old = this.currentState;
    this._exitState(old, state);
    this._enterState(state, old);
  }

  _exitState(old, next) {
    // 退出回调（外部清理钩子）
    if (this.onExit) this.onExit(old, next);
    // 清理当前状态的计时器与标志
    this.stateTime = 0;
    this.animFrame = 0;
    this.flags = {};
  }

  _enterState(state, old, meta) {
    this.currentState = state;
    this.previousState = old;
    // 重置该状态的计时器与动画播放头（绝不从上一状态的帧继续播）
    this.stateTime = 0;
    this.animFrame = 0;
    this.flags = {};
    if (old !== null) this.transitionCount += 1;
    if (this.onEnter) this.onEnter(state, old, meta || {});
  }

  // dt: 距上一帧的真实时间增量（秒）
  update(dt) {
    if (typeof dt !== 'number' || dt < 0 || !isFinite(dt)) {
      throw new Error(`非法时间增量: ${dt}`);
    }
    if (this.currentState === 'dead') {
      return; // 死亡锁定：不推进任何计时
    }
    this.stateTime += dt;
    this.animFrame += dt; // 播放头用秒计；每个状态进入时已归零
    const duration = this.durations[this.currentState];
    // 定时状态（攻击/闪避/受击）结束后自动回到 idle
    if (duration !== Infinity && this.stateTime >= duration) {
      if (this.canTransition(this.currentState, 'idle')) {
        this.setState('idle');
      }
    }
  }

  canAttack() {
    return this.currentState === 'idle' || this.currentState === 'run';
  }

  // 仅在攻击后摇（取消帧之后）才允许闪避取消攻击
  canDodge() {
    if (this.currentState === 'attack') {
      return this.stateTime >= this.attackCancelTime;
    }
    return this.currentState === 'idle' || this.currentState === 'run';
  }

  isLocked() {
    return this.currentState === 'hit' || this.currentState === 'dead';
  }
}

module.exports = { StateMachine, STATES, DEFAULT_DURATIONS };
