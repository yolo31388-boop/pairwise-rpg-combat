// 战斗状态机
// 不变量:
// 1. 任意时刻只处于一个互斥状态 (currentState 是单一字符串)。
// 2. 所有状态切换经过 setState(), 先 exit 旧状态再 enter 新状态,
//    exit 时清理该状态的计时器和标志, enter 时重置动画播放头。
// 3. 状态持续时间只由 update(dt) 累计的真实时间驱动, 不使用帧计数。
// 4. 攻击前摇不可闪避, 后摇可闪避取消 (取消时刻 attackCancelAt 可配置)。
// 5. 受击硬直锁定攻击/移动, 死亡锁定一切。

const STATES = Object.freeze(['idle', 'run', 'attack', 'dodge', 'hit', 'dead']);

const DEFAULT_CONFIG = Object.freeze({
  attackDuration: 0.8,   // 攻击总时长 (秒, 真实时间)
  attackWindup: 0.2,     // 攻击前摇时长 (前摇内闪避不可取消)
  attackCancelAt: 0.7,   // 后摇取消帧 (>= 此时刻允许闪避取消; 可配置)
  dodgeDuration: 0.4,    // 闪避总时长
  hitDuration: 0.3,      // 受击硬直时长
});

class StateMachine {
  constructor(options = {}) {
    this.config = Object.assign({}, DEFAULT_CONFIG, options);
    this.currentState = 'idle';
    // 每个状态独立的状态数据; 进入时建立, 退出时整体清理。
    this.stateData = {};
    this.stateTime = 0;   // 当前状态已经过的真实时间 (秒)
    this.animFrame = 0;   // 当前状态动画播放头; 每次切换状态必须归零
    this.onEnter = null;  // (state) => void
    this.onExit = null;   // (state) => void
  }

  _isKnown(state) {
    return STATES.indexOf(state) !== -1;
  }

  // 公开 API: 请求切换到 state。
  // 非法切换抛错, 调用方需要先用 canAttack/canDodge 等判定动作是否合法。
  setState(state) {
    if (!this._isKnown(state)) {
      throw new Error(`未知状态: ${state}`);
    }

    // 死亡是终态: 锁定, 不能复活, 也不能在死亡后进入任何其它状态。
    if (this.currentState === 'dead') {
      throw new Error('死亡状态已锁定, 不能切换状态');
    }

    const from = this.currentState;
    if (state === from) return; // 同状态不重复 enter/exit

    // 互斥性 / 合法性检查: 动作状态之间不能直接互切,
    // 攻击仅在可取消帧之后允许被闪避打断。
    if (from === 'attack') {
      if (state === 'dodge' && this.stateTime < this.config.attackCancelAt) {
        throw new Error('攻击前摇/未到取消帧, 不能闪避取消');
      }
      if (state !== 'dodge' && state !== 'hit' && state !== 'dead') {
        throw new Error(`攻击状态不能切换到 ${state}`);
      }
    }
    if (from === 'dodge' && state !== 'hit' && state !== 'dead') {
      throw new Error('闪避状态不能直接切换到 ' + state);
    }
    if (from === 'hit' && state !== 'dead') {
      throw new Error('受击硬直未结束, 不能切换到 ' + state);
    }

    this._transition(state);
  }

  // 内部使用: 调用方已确认目标状态合法 (如硬直到期自动回 idle)。
  _transition(state) {
    const from = this.currentState;
    if (this.onExit) this.onExit(from);

    // 退出清理: 丢弃旧状态的所有计时器与标志。
    this.stateData = {};
    this.stateTime = 0;
    this.animFrame = 0; // 重置动画播放头, 不从上一个状态的帧继续播

    this.currentState = state;

    // 进入: 建立新状态的标志。
    if (state === 'attack') {
      this.stateData = {
        attacking: true,
        inWindup: true,
        cancelable: false,
      };
    } else if (state === 'dodge') {
      this.stateData = { dodging: true, invincible: true };
    } else if (state === 'hit') {
      this.stateData = { stunned: true };
    }

    if (this.onEnter) this.onEnter(state);
  }

  update(dt) {
    if (typeof dt !== 'number' || dt < 0 || !isFinite(dt)) {
      throw new Error('update 需要非负有限的真实时间增量 dt (秒)');
    }

    this.stateTime += dt; // 真实时间累计, 与帧率无关
    this.animFrame += dt * 30;

    if (this.currentState === 'attack') {
      this.stateData.inWindup = this.stateTime < this.config.attackWindup;
      this.stateData.cancelable = this.stateTime >= this.config.attackCancelAt;
      if (this.stateTime >= this.config.attackDuration) {
        this._transition('idle');
        return;
      }
    }

    if (this.currentState === 'dodge') {
      if (this.stateTime >= this.config.dodgeDuration) {
        this._transition('idle');
        return;
      }
    }

    if (this.currentState === 'hit') {
      if (this.stateTime >= this.config.hitDuration) {
        this._transition('idle');
        return;
      }
    }
    // run/idle 持续到外部切换; dead 是终态, 永不自动退出。
  }

  canAttack() {
    return this.currentState === 'idle' || this.currentState === 'run';
  }

  canDodge() {
    if (this.currentState === 'dead' || this.currentState === 'hit') return false;
    if (this.currentState === 'dodge') return false;
    if (this.currentState === 'attack') {
      // 前摇不可闪避, 后摇在取消帧之后才可取消。
      return this.stateTime >= this.config.attackCancelAt;
    }
    return true;
  }

  canMove() {
    return (
      this.currentState === 'idle' ||
      this.currentState === 'run'
    );
  }

  // 受击硬直期间攻击和移动输入必须被忽略。
  acceptsAttack() {
    return this.canAttack();
  }

  acceptsMove() {
    return this.canMove();
  }
}

module.exports = { StateMachine, STATES, DEFAULT_CONFIG };
