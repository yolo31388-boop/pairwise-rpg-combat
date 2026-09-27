const { StateMachine, STATES } = require('../src/combat/stateMachine.js');
const { InputBuffer } = require('../src/input/buffer.js');
const { PlayerController } = require('../src/combat/playerController.js');

describe('RPG战斗状态机', () => {
  test('状态应互斥', () => {
    const fsm = new StateMachine();
    fsm.setState('attack');
    expect(() => fsm.setState('dodge')).toThrow();
  });

  test('受击硬直应锁定输入', () => {
    const pc = new PlayerController();
    pc.fsm.setState('hit');
    pc.handleInput('attack');
    expect(pc.fsm.currentState).toBe('hit');
  });

  test('输入缓冲应在状态结束后触发', () => {
    const pc = new PlayerController();
    pc.fsm.setState('attack');
    pc.fsm.stateTime = 0.5;
    pc.handleInput('dodge');
    pc.update(0.1);
    expect(pc.buffer.inputs.length).toBeGreaterThan(0);
  });

  test('状态切换应重置动画', () => {
    const fsm = new StateMachine();
    fsm.animFrame = 100;
    fsm.setState('attack');
    expect(fsm.animFrame).toBe(0);
  });

  test('死亡状态应锁定所有输入', () => {
    const pc = new PlayerController();
    pc.fsm.setState('dead');
    pc.handleInput('attack');
    pc.handleInput('dodge');
    expect(pc.fsm.currentState).toBe('dead');
  });

  test('缓冲超时应丢弃', () => {
    const buf = new InputBuffer(0.1);
    buf.record('attack');
    buf.update(0.2);
    expect(buf.consume()).toBeNull();
  });
});

describe('状态机修复 - 扩展断言', () => {
  // 1. 状态互斥性：切换后旧状态完全消失，previousState 记录但不并存
  test('任意时刻只处于一个状态', () => {
    const fsm = new StateMachine();
    fsm.setState('attack');
    expect(fsm.currentState).toBe('attack');
    expect(fsm.previousState).toBe('idle');
    const active = STATES.filter((s) => s === fsm.currentState);
    expect(active).toHaveLength(1);
    expect(fsm.flags).toEqual({});
  });

  // 2. 输入缓冲触发：攻击中缓冲的闪避在攻击自然结束后自动触发
  test('缓冲输入在当前状态结束后自动触发下一个动作', () => {
    const pc = new PlayerController({ bufferWindow: 1.5 });
    pc.fsm.setState('attack');
    pc.handleInput('dodge');
    expect(pc.fsm.currentState).toBe('attack');
    pc.update(0.5);
    expect(pc.fsm.currentState).toBe('attack');
    pc.update(0.5); // 攻击满 1.0s 自动回 idle，缓冲闪避立即触发
    expect(pc.fsm.currentState).toBe('dodge');
    expect(pc.buffer.inputs.length).toBe(0);
  });

  // 3. 受击硬直锁定：攻击与移动均被忽略，且只播放受击动画（计时推进）
  test('受击硬直期间忽略所有攻击和移动输入', () => {
    const pc = new PlayerController();
    pc.fsm.setState('hit');
    pc.handleInput('attack');
    pc.handleInput('move');
    pc.handleInput('run');
    expect(pc.fsm.currentState).toBe('hit');
    expect(pc.buffer.inputs.length).toBe(0);
    pc.update(0.1);
    expect(pc.fsm.currentState).toBe('hit');
    expect(pc.fsm.stateTime).toBeCloseTo(0.1, 10);
    pc.update(0.25);
    expect(pc.fsm.currentState).toBe('idle'); // 受击结束恢复行动
  });

  // 4. 攻击前摇不可被闪避打断；后摇（取消帧之后）可取消
  test('攻击前摇拒绝闪避，后摇允许闪避取消', () => {
    const fsm = new StateMachine();
    fsm.setState('attack');
    fsm.update(0.5);
    expect(fsm.canDodge()).toBe(false);
    expect(() => fsm.setState('dodge')).toThrow();
    fsm.update(0.3); // stateTime 0.8 >= 取消帧 0.75
    expect(fsm.canDodge()).toBe(true);
    fsm.setState('dodge');
    expect(fsm.currentState).toBe('dodge');
    expect(fsm.previousState).toBe('attack');
  });

  // 取消帧必须可配置
  test('闪避取消帧可配置', () => {
    const early = new StateMachine({ attackCancelTime: 0.3 });
    early.setState('attack');
    early.update(0.3);
    expect(early.canDodge()).toBe(true);
    const late = new StateMachine({ attackCancelTime: 0.9 });
    late.setState('attack');
    late.update(0.8);
    expect(late.canDodge()).toBe(false);
  });

  // 5. 状态持续时间基于真实时间：大步长与多个小步长结果一致
  test('状态持续时间基于真实时间而非帧数', () => {
    const big = new StateMachine();
    big.setState('attack');
    big.update(0.9);
    expect(big.currentState).toBe('attack');
    big.update(0.2);
    expect(big.currentState).toBe('idle');

    const small = new StateMachine();
    small.setState('attack');
    for (let i = 0; i < 11; i++) small.update(0.1); // 累计 1.1s
    expect(small.currentState).toBe('idle');
    expect(big.transitionCount).toBe(small.transitionCount);
  });

  // 6. 状态切换重置动画播放头：进入新状态后 animFrame 归零
  test('每次状态切换都重置动画播放头', () => {
    const pc = new PlayerController();
    pc.fsm.setState('attack');
    pc.update(0.8);
    expect(pc.fsm.animFrame).toBeGreaterThan(0);
    pc.fsm.setState('dodge');
    expect(pc.fsm.animFrame).toBe(0);
    pc.update(0.1);
    expect(pc.fsm.animFrame).toBeCloseTo(0.1, 10);
    pc.fsm.setState('idle');
    expect(pc.fsm.animFrame).toBe(0);
  });

  // 7. 死亡锁定：任何输入与 update 都不能复活
  test('死亡状态锁定全部输入且无法复活', () => {
    const pc = new PlayerController();
    pc.fsm.setState('hit');
    pc.fsm.setState('dead');
    pc.handleInput('attack');
    pc.handleInput('dodge');
    pc.handleInput('move');
    pc.update(5);
    expect(pc.fsm.currentState).toBe('dead');
    expect(pc.fsm.stateTime).toBe(0);
    expect(pc.buffer.inputs.length).toBe(0);
    expect(() => pc.fsm.setState('idle')).toThrow();
    expect(() => pc.fsm.setState('attack')).toThrow();
  });

  // 8. 缓冲超时丢弃：窗口外的输入不触发动作；窗口边界内有效
  test('缓冲窗口精确丢弃过期输入', () => {
    const pc = new PlayerController({ bufferWindow: 0.15 });
    pc.fsm.setState('attack');
    pc.handleInput('dodge');
    for (let i = 0; i < 12; i++) pc.update(0.1); // 1.2s，输入早已过期
    expect(pc.fsm.currentState).toBe('idle');
    expect(pc.buffer.inputs.length).toBe(0);

    const buf = new InputBuffer(0.15);
    buf.record('attack');
    buf.update(0.1);
    expect(buf.consume()).toBe('attack'); // 窗口内仍可取
  });

  // 9. 多输入按序处理（FIFO）：先排队的先触发
  test('多个缓冲输入严格按入队顺序触发', () => {
    const pc = new PlayerController({ bufferWindow: 2.0 });
    pc.fsm.setState('attack');
    pc.handleInput('dodge'); // 队头：攻击结束后触发
    pc.handleInput('attack'); // 队二：闪避结束后触发
    pc.update(1.0); // 攻击结束 -> dodge
    expect(pc.fsm.currentState).toBe('dodge');
    pc.update(0.4); // 闪避结束 -> 排队的 attack
    expect(pc.fsm.currentState).toBe('attack');
    expect(pc.buffer.inputs.length).toBe(0);
  });

  // 10. 进入/退出回调 + 退出时清理计时器与标志
  test('状态切换调用进入和退出回调并清理状态资源', () => {
    const events = [];
    const fsm = new StateMachine({
      onEnter: (s, old) => events.push(`enter:${old}->${s}`),
      onExit: (old, next) => events.push(`exit:${old}->${next}`),
    });
    fsm.flags.hitStop = true;
    fsm.setState('attack');
    expect(events).toContain('exit:idle->attack');
    expect(events).toContain('enter:idle->attack');
    expect(fsm.stateTime).toBe(0);
    expect(fsm.animFrame).toBe(0);
    expect(fsm.flags).toEqual({});
    fsm.update(0.2);
    fsm.flags.someFlag = true;
    fsm.setState('hit');
    expect(fsm.flags).toEqual({});
    expect(events[events.length - 1]).toBe('enter:attack->hit');
  });

  // 11. 非法状态切换被拒绝
  test('未知状态与非法转换均抛错且状态不变', () => {
    const fsm = new StateMachine();
    expect(() => fsm.setState('cast')).toThrow();
    expect(fsm.currentState).toBe('idle');
    fsm.setState('dodge');
    expect(() => fsm.setState('attack')).toThrow(); // 闪避中不能直接攻击
    expect(fsm.currentState).toBe('dodge');
    const dead = new StateMachine();
    dead.setState('dead');
    expect(() => dead.setState('run')).toThrow();
  });

  // 12. 确定性：相同输入序列与时间步长，任意次运行结果完全一致
  test('状态机对相同输入序列具有确定性', () => {
    const run = () => {
      const pc = new PlayerController({ bufferWindow: 1.0 });
      const trace = [];
      const steps = [
        ['input', 'attack'],
        ['tick', 0.2],
        ['input', 'dodge'],
        ['tick', 0.6],
        ['input', 'attack'],
        ['tick', 0.4],
        ['tick', 0.3],
        ['hit', null],
        ['tick', 0.3],
        ['input', 'attack'],
        ['tick', 0.2],
      ];
      for (const [kind, v] of steps) {
        if (kind === 'input') pc.handleInput(v);
        if (kind === 'tick') pc.update(v);
        if (kind === 'hit') pc.fsm.setState('hit');
        trace.push(pc.fsm.currentState);
      }
      return trace;
    };
    expect(run()).toEqual(run());
    const t = run();
    expect(t).toContain('attack');
    expect(t).toContain('dodge');
    expect(t).toContain('hit');
    expect(t[t.length - 1]).toBe('attack'); // 硬直结束后缓冲攻击触发
  });
});
