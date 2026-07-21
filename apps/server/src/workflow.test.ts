import { describe, expect, it } from 'vitest';
import { approveTransition, formatApplicationNo, returnTransition } from './workflow.js';

describe('投资意向工作流', () => {
  it('按年度月份和四位序号生成编号', () => {
    expect(formatApplicationNo(new Date(2026, 6, 21), 12)).toBe('TZ-2026-07-0012');
  });

  it('投资部门负责人同意后流转至分管领导', () => {
    expect(approveTransition(1, 'department_head')).toEqual({
      status: 'IN_REVIEW',
      nextStage: 2
    });
  });

  it('分管领导同意后审批完成', () => {
    expect(approveTransition(2, 'division_leader')).toEqual({
      status: 'APPROVED',
      nextStage: 3
    });
  });

  it('审核节点可以退回业务发起人', () => {
    expect(returnTransition(2, 'division_leader')).toEqual({
      status: 'RETURNED',
      nextStage: 0
    });
  });

  it('错误角色不能审核', () => {
    expect(() => approveTransition(1, 'division_leader')).toThrow('当前用户无权审核此节点');
  });
});
