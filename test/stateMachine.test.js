
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
});
