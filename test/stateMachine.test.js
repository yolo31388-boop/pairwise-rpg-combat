
const { StateMachine } = require('../src/combat/stateMachine.js');
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

  // 紧时序配置, 便于在测试里用真实时间驱动完整状态生命周期
  const TIGHT = {
    attackDuration: 0.2,
    attackWindup: 0.1,
    attackCancelAt: 0.15,
    dodgeDuration: 0.2,
    hitDuration: 0.2,
    bufferWindow: 0.3,
  };

  describe('新增不变量断言', () => {
    test('状态互斥: 任意时刻只有一个状态, 状态标志不重叠', () => {
      const fsm = new StateMachine(TIGHT);
      expect(typeof fsm.currentState).toBe('string');
      fsm.setState('attack');
      expect(fsm.currentState).toBe('attack');
      expect(fsm.stateData.attacking).toBe(true);
      expect(fsm.stateData.dodging).toBeUndefined();
      expect(fsm.stateData.stunned).toBeUndefined();
      fsm.update(0.15);
      fsm.setState('dodge'); // 后摇取消进入闪避
      expect(fsm.currentState).toBe('dodge');
      expect(fsm.stateData.dodging).toBe(true);
      expect(fsm.stateData.attacking).toBeUndefined();
    });

    test('输入缓冲: 攻击期间按闪避, 攻击结束后自动触发闪避', () => {
      const pc = new PlayerController(TIGHT);
      pc.handleInput('attack');
      expect(pc.fsm.currentState).toBe('attack');
      pc.handleInput('dodge'); // 前摇/未到取消帧, 不能立即取消
      expect(pc.fsm.currentState).toBe('attack');
      pc.update(0.2); // 真实时间推进: 攻击到期回 idle, 缓冲闪避自动触发
      expect(pc.fsm.currentState).toBe('dodge');
    });

    test('受击硬直: 攻击和移动输入被直接忽略, 只能播放受击动画', () => {
      const pc = new PlayerController(TIGHT);
      pc.fsm.setState('hit');
      pc.handleInput('attack');
      pc.handleInput('move');
      expect(pc.buffer.inputs.length).toBe(0); // 不入队
      expect(pc.fsm.currentState).toBe('hit');
      pc.update(0.1);
      expect(pc.fsm.currentState).toBe('hit'); // 硬直未满不结束
      pc.update(0.1);
      expect(pc.fsm.currentState).toBe('idle'); // 真实时间到期才恢复
    });

    test('攻击前摇不能被闪避打断, 且直接切换会被拒绝', () => {
      const fsm = new StateMachine(TIGHT);
      fsm.setState('attack');
      fsm.update(0.05); // 仍在前摇 (windup=0.1)
      expect(fsm.canDodge()).toBe(false);
      expect(() => fsm.setState('dodge')).toThrow();
      expect(fsm.currentState).toBe('attack');
    });

    test('攻击后摇可被闪避取消, 取消帧可配置, 取消时重置计时与动画', () => {
      const fsm = new StateMachine(TIGHT); // cancelAt=0.15
      fsm.setState('attack');
      fsm.update(0.15);
      expect(fsm.canDodge()).toBe(true);
      fsm.setState('dodge');
      expect(fsm.currentState).toBe('dodge');
      expect(fsm.stateTime).toBe(0);
      expect(fsm.animFrame).toBe(0);

      const late = new StateMachine(Object.assign({}, TIGHT, { attackCancelAt: 0.2 }));
      late.setState('attack');
      late.update(0.15);
      expect(late.canDodge()).toBe(false); // 更晚的取消帧: 0.15 时仍不可取消
    });

    test('状态持续时间基于真实时间: 不同帧切分只要总时长相同结果一致', () => {
      const a = new StateMachine(TIGHT);
      const b = new StateMachine(TIGHT);
      a.setState('hit');
      b.setState('hit');
      a.update(0.07);
      a.update(0.07);
      expect(a.stateTime).toBeCloseTo(0.14);
      a.update(0.07); // 累计 0.21 >= hitDuration 0.2
      b.update(0.21); // 一次性给足真实时间
      expect(a.currentState).toBe('idle');
      expect(b.currentState).toBe('idle');
      expect(a.stateTime).toBe(b.stateTime);
    });

    test('状态自动切换(到期)也必须重置动画播放头', () => {
      const fsm = new StateMachine(TIGHT);
      fsm.setState('attack');
      fsm.update(0.19);
      expect(fsm.animFrame).toBeGreaterThan(0);
      fsm.update(0.01); // 攻击到期自动回 idle
      expect(fsm.currentState).toBe('idle');
      expect(fsm.animFrame).toBe(0);
    });

    test('死亡状态锁定所有输入, update 也不能复活', () => {
      const pc = new PlayerController(TIGHT);
      pc.fsm.setState('dead');
      pc.handleInput('attack');
      pc.handleInput('dodge');
      pc.handleInput('move');
      expect(pc.buffer.inputs.length).toBe(0);
      for (let i = 0; i < 5; i++) pc.update(0.5);
      expect(pc.fsm.currentState).toBe('dead');
      expect(() => pc.fsm.setState('idle')).toThrow();
    });

    test('缓冲超时: 队首过期后不阻塞后面新鲜输入', () => {
      const buf = new InputBuffer(0.1);
      buf.record('attack');
      buf.update(0.11); // attack 过期
      buf.record('dodge');
      expect(buf.peek()).toBe('dodge');
      expect(buf.consume()).toBe('dodge');
      expect(buf.consume()).toBeNull();
    });

    test('多输入按 FIFO 顺序处理: dodge -> attack -> move', () => {
      const pc = new PlayerController(Object.assign({}, TIGHT, { bufferWindow: 1 }));
      const trace = [];
      pc.handleInput('dodge');
      pc.handleInput('attack'); // 闪避中: 排队
      pc.handleInput('move');   // 排在攻击后
      trace.push(pc.fsm.currentState);
      pc.update(0.2); // 闪避结束 -> 队首攻击触发
      trace.push(pc.fsm.currentState);
      pc.update(0.2); // 攻击结束 -> 移动触发
      trace.push(pc.fsm.currentState);
      expect(trace).toEqual(['dodge', 'attack', 'run']);
    });

    test('进入/退出回调按序触发, 退出时清理旧状态计时器和标志', () => {
      const fsm = new StateMachine(TIGHT);
      const events = [];
      fsm.onExit = (s) => events.push('exit:' + s);
      fsm.onEnter = (s) => events.push('enter:' + s);
      fsm.setState('attack');
      expect(events).toEqual(['exit:idle', 'enter:attack']);
      expect(fsm.stateData.attacking).toBe(true);
      fsm.update(0.15);
      fsm.setState('dodge');
      expect(events).toEqual([
        'exit:idle', 'enter:attack',
        'exit:attack', 'enter:dodge',
      ]);
      expect(fsm.stateData.attacking).toBeUndefined();
      expect(fsm.stateData.dodging).toBe(true);
      expect(fsm.stateTime).toBe(0);
    });

    test('非法状态切换一律拒绝', () => {
      const fsm = new StateMachine(TIGHT);
      fsm.setState('dodge');
      expect(() => fsm.setState('attack')).toThrow();
      fsm.update(0.5); // 闪避按真实时间到期后回 idle, 不能强制切
      expect(fsm.currentState).toBe('idle');
      fsm.setState('hit');
      expect(() => fsm.setState('dodge')).toThrow();
      expect(() => fsm.setState('run')).toThrow();
      fsm.setState('dead'); // 硬直中允许死亡
      expect(() => fsm.setState('idle')).toThrow();
      const fresh = new StateMachine();
      expect(() => fresh.setState('sleep')).toThrow();
    });

    test('确定性: 相同输入与 dt 序列产生完全相同的状态轨迹', () => {
      const script = [
        ['input', 'attack'], ['tick', 0.05], ['input', 'dodge'],
        ['tick', 0.16], ['input', 'attack'], ['tick', 0.2], ['tick', 0.2],
      ];
      const run = () => {
        const pc = new PlayerController(TIGHT);
        const trace = [];
        for (const [kind, value] of script) {
          if (kind === 'input') pc.handleInput(value);
          else pc.update(value);
          trace.push([pc.fsm.currentState, Number(pc.fsm.stateTime.toFixed(6))]);
        }
        return trace;
      };
      expect(run()).toEqual(run());
    });

    test('受击期间排队的闪避在硬直结束后触发', () => {
      const pc = new PlayerController(TIGHT);
      pc.fsm.setState('hit');
      pc.handleInput('dodge'); // 硬直中不能闪避, 但允许入缓冲队列
      expect(pc.fsm.currentState).toBe('hit');
      pc.update(0.2);
      expect(pc.fsm.currentState).toBe('dodge');
    });
  });
});
