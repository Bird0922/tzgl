import { describe, expect, it } from 'vitest';
import {
  approveTransition,
  formatApplicationNo,
  GLOBAL_APPROVAL_POLICY,
  returnTransition,
  submitTransition
} from './workflow.js';

describe('全局单据审批策略', () => {
  it('统一采用经办人、经办部门负责人、经办部门分管领导三节点', () => {
    expect(GLOBAL_APPROVAL_POLICY.scope).toBe('ALL_DOCUMENTS');
    expect(GLOBAL_APPROVAL_POLICY.stages).toEqual([
      { stage: 0, role: 'initiator', name: '经办人', action: 'SUBMIT' },
      { stage: 1, role: 'department_head', name: '经办部门负责人', action: 'APPROVE' },
      { stage: 2, role: 'division_leader', name: '经办部门分管领导', action: 'APPROVE' }
    ]);
  });

  it('按年度月份和四位序号生成编号', () => {
    expect(formatApplicationNo(new Date(2026, 6, 21), 12)).toBe('TZ-2026-07-0012');
  });

  it('经办人提交后流转至经办部门负责人', () => {
    expect(submitTransition(0, 'initiator')).toEqual({
      status: 'IN_REVIEW',
      nextStage: 1
    });
  });

  it('非经办人不能提交单据', () => {
    expect(() => submitTransition(0, 'department_head')).toThrow('当前用户无权提交此单据');
  });

  it('经办部门负责人同意后流转至经办部门分管领导', () => {
    expect(approveTransition(1, 'department_head')).toEqual({
      status: 'IN_REVIEW',
      nextStage: 2
    });
  });

  it('经办部门分管领导同意后审批完成', () => {
    expect(approveTransition(2, 'division_leader')).toEqual({
      status: 'APPROVED',
      nextStage: 3
    });
  });

  it('审核节点可以退回经办人', () => {
    expect(returnTransition(2, 'division_leader')).toEqual({
      status: 'RETURNED',
      nextStage: 0
    });
  });

  it('错误角色不能审核', () => {
    expect(() => approveTransition(1, 'division_leader')).toThrow('当前用户无权审核此节点');
  });
});
