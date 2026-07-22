export interface InvestmentProcessMenuItem {
  key: string;
  title: string;
  description: string;
  path: string;
  status: 'available' | 'planned';
  permissions?: string[];
}

export interface InvestmentStageMenu {
  key: 'registration' | 'investigation' | 'decision' | 'implementation';
  index: string;
  title: string;
  description: string;
  items: InvestmentProcessMenuItem[];
}

export const investmentStageMenus: InvestmentStageMenu[] = [
  {
    key: 'registration',
    index: '01',
    title: '登记立项',
    description: '完成项目意向登记、立项申请与项目归集。',
    items: [
      {
        key: 'equity-intention-create',
        title: '股权投资意向登记',
        description: '发起股权投资意向并提交审批。',
        path: '/intentions/new',
        status: 'available',
        permissions: ['investment.intention.create']
      },
      {
        key: 'equity-intention-list',
        title: '投资意向台账',
        description: '查看本人发起、待办及全部投资意向。',
        path: '/intentions',
        status: 'available',
        permissions: ['investment.intention.read', 'investment.intention.read_all']
      },
      {
        key: 'project-initiation',
        title: '项目立项申请',
        description: '提交正式投资项目立项审批。',
        path: '/process/project-initiation',
        status: 'available'
      },
      {
        key: 'group-approval',
        title: '集团审批备案',
        description: '提交集团审批申请并上传决议文件。',
        path: '/process/group-approval',
        status: 'available'
      },
      {
        key: 'project-approval',
        title: '投资立项批复',
        description: '登记集团审批结果并形成投资立项批复。',
        path: '/process/project-approval',
        status: 'planned'
      }
    ]
  },
  {
    key: 'investigation',
    index: '02',
    title: '调查论证',
    description: '开展尽职调查、可行性研究和风险评估。',
    items: [
      {
        key: 'due-diligence',
        title: '尽职调查申请',
        description: '发起尽职调查并组织专业机构协同。',
        path: '/process/due-diligence',
        status: 'planned'
      },
      {
        key: 'feasibility-study',
        title: '可行性研究审批',
        description: '提交可行性研究成果进行评审。',
        path: '/process/feasibility-study',
        status: 'planned'
      },
      {
        key: 'risk-assessment',
        title: '风险评估审查',
        description: '识别投资风险并形成审查意见。',
        path: '/process/risk-assessment',
        status: 'planned'
      }
    ]
  },
  {
    key: 'decision',
    index: '03',
    title: '投资决策',
    description: '完成投资决策申请、会议审议与结果登记。',
    items: [
      {
        key: 'investment-decision',
        title: '投资决策申请',
        description: '汇总论证成果并提交投资决策。',
        path: '/process/investment-decision',
        status: 'planned'
      },
      {
        key: 'committee-review',
        title: '投资委员会审议',
        description: '组织投资委员会材料审阅和表决。',
        path: '/process/committee-review',
        status: 'planned'
      },
      {
        key: 'decision-result',
        title: '决策结果登记',
        description: '登记决策结论及后续执行要求。',
        path: '/process/decision-result',
        status: 'planned'
      }
    ]
  },
  {
    key: 'implementation',
    index: '04',
    title: '组织实施',
    description: '推进协议、出资和项目实施过程协同。',
    items: [
      {
        key: 'agreement-approval',
        title: '投资协议审批',
        description: '提交投资协议文本及关键条款审批。',
        path: '/process/agreement-approval',
        status: 'planned'
      },
      {
        key: 'capital-contribution',
        title: '出资申请',
        description: '依据决策和协议发起出资审批。',
        path: '/process/capital-contribution',
        status: 'planned'
      },
      {
        key: 'implementation-progress',
        title: '实施进度报告',
        description: '跟踪投资项目实施进展和重大事项。',
        path: '/process/implementation-progress',
        status: 'planned'
      }
    ]
  }
];

export function findInvestmentProcess(processKey: string) {
  for (const stage of investmentStageMenus) {
    const item = stage.items.find(candidate => candidate.key === processKey);
    if (item) return { stage, item };
  }
  return null;
}
