import { describe, expect, it } from 'vitest';
import {
  formatGroupDecisionApplicationNo,
  validateGroupDecisionInput
} from './group-decision-application-service-20260722.js';

describe('集团决策申请', () => {
  it('按年月和四位流水号生成单据编号', () => {
    expect(formatGroupDecisionApplicationNo(new Date(2026, 6, 22), 12))
      .toBe('JTJC-202607-0012');
  });

  it('规范化合法的项目和资金数据', () => {
    expect(validateGroupDecisionInput({
      applicationDate: '2026-07-22',
      applicationYear: '2026',
      projectName: ' 集团新能源项目 ',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2027-07-31',
      investmentDirection: 'STRATEGIC',
      domesticOverseas: 'DOMESTIC',
      investmentMethod: 'EQUITY',
      majorProject: true,
      currencyCode: 'CNY',
      fundingGroupRequested: '1000000.25',
      expectedReturnRate: '8.5000'
    })).toMatchObject({
      applicationYear: 2026,
      projectName: '集团新能源项目',
      majorProject: true,
      fundingGroupRequested: '1000000.25',
      expectedReturnRate: '8.5000'
    });
  });

  it('拒绝计划结束日期早于开始日期', () => {
    expect(() => validateGroupDecisionInput({
      plannedStartDate: '2026-08-02',
      plannedEndDate: '2026-08-01'
    })).toThrow('计划结束日期不能早于计划开始日期');
  });

  it('拒绝非法日期', () => {
    expect(() => validateGroupDecisionInput({ applicationDate: '2026-02-30' }))
      .toThrow('申请日期不是有效日期');
  });

  it('拒绝负数或超过两位小数的资金金额', () => {
    expect(() => validateGroupDecisionInput({ fundingLoan: '-1' }))
      .toThrow('贷款应为非负金额且最多保留两位小数');
    expect(() => validateGroupDecisionInput({ fundingLoan: '1.001' }))
      .toThrow('贷款应为非负金额且最多保留两位小数');
  });

  it('拒绝超过100%的预计收益率', () => {
    expect(() => validateGroupDecisionInput({ expectedReturnRate: '100.0001' }))
      .toThrow('预计收益率应在0至100之间');
  });

  it('拒绝未定义的投资方式编码', () => {
    expect(() => validateGroupDecisionInput({ investmentMethod: 'UNSAFE_VALUE' }))
      .toThrow('投资方式取值无效');
  });
});
