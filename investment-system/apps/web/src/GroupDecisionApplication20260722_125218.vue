<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  approveGroupDecisionApplication,
  createGroupDecisionApplication,
  getGlobalApprovalPolicy,
  groupDecisionPayloadFromForm,
  returnGroupDecisionApplication,
  submitGroupDecisionApplication,
  updateGroupDecisionApplication
} from './api';
import type {
  Actor,
  ApprovalPolicy,
  GroupDecisionApplicationDetail,
  GroupDecisionApplicationForm
} from './types';

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const currentDate = today();
const form = reactive<GroupDecisionApplicationForm>({
  applicationDate: currentDate,
  applicationYear: currentDate.slice(0, 4),
  projectName: '',
  projectCode: '',
  projectLeaderUserId: '',
  projectLeaderName: '',
  plannedStartDate: '',
  plannedEndDate: '',
  investmentEntityId: 'org-yuanwang',
  investmentEntityName: '远望实业集团有限公司',
  investmentDirection: '',
  domesticOverseas: '',
  investmentMethod: '',
  majorProject: '',
  currencyCode: 'CNY',
  projectTotalInvestment: '',
  plannedInvestment: '',
  expectedReturnRate: '',
  fundingCompanyOwned: '',
  fundingGroupRequested: '',
  fundingSpecialBond: '',
  fundingGovernment: '',
  fundingLoan: '',
  fundingOther: '',
  annualPlannedInvestment: ''
});

const detail = ref<GroupDecisionApplicationDetail | null>(null);
const approvalPolicy = ref<ApprovalPolicy | null>(null);
const mode = ref<'initiator' | 'reviewer'>('initiator');
const reviewComment = ref('');
const busy = ref(false);
const toast = ref('');
let toastTimer: number | undefined;

const statusLabels: Record<string, string> = {
  PENDING_SEND: '待发',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  RETURNED: '已退回'
};

const actionLabels: Record<string, string> = {
  SUBMIT: '发送',
  APPROVE: '同意',
  RETURN: '退回'
};

const initiatorActor: Actor = {
  id: 'user-admin',
  name: '综合管理员',
  role: 'initiator',
  unitId: 'org-yuanwang',
  unitName: '远望实业集团有限公司',
  departmentId: 'dept-collaboration-cloud',
  departmentName: '协同云体验'
};

const currentStatus = computed(() => detail.value?.status ?? 'PENDING_SEND');
const currentStage = computed(() => detail.value?.currentStage ?? 0);
const statusLabel = computed(() => statusLabels[currentStatus.value]);
const editable = computed(() => ['PENDING_SEND', 'RETURNED'].includes(currentStatus.value));
const reviewable = computed(() => currentStatus.value === 'IN_REVIEW');
const approvalStages = computed(() => approvalPolicy.value?.stages ?? []);
const reviewerActor = computed<Actor>(() => {
  const stage = approvalStages.value.find(item => item.stage === currentStage.value);
  const role = stage?.role === 'division_leader' || currentStage.value === 2
    ? 'division_leader'
    : 'department_head';
  return {
    id: `user-${role.replace('_', '-')}`,
    name: stage?.name ?? (role === 'division_leader' ? '经办部门分管领导' : '经办部门负责人'),
    role,
    unitId: initiatorActor.unitId,
    unitName: initiatorActor.unitName,
    departmentId: initiatorActor.departmentId,
    departmentName: initiatorActor.departmentName
  };
});

onMounted(async () => {
  try {
    approvalPolicy.value = await getGlobalApprovalPolicy(initiatorActor);
  } catch (error) {
    notify(error instanceof Error ? error.message : '审批策略加载失败');
  }
});

function notify(message: string) {
  window.clearTimeout(toastTimer);
  toast.value = message;
  toastTimer = window.setTimeout(() => { toast.value = ''; }, 2400);
}

function applyDetail(value: GroupDecisionApplicationDetail) {
  detail.value = value;
  Object.assign(form, {
    applicationDate: value.applicationDate ?? '',
    applicationYear: String(value.applicationYear ?? ''),
    projectName: value.projectName ?? '',
    projectCode: value.projectCode ?? '',
    projectLeaderUserId: value.projectLeaderUserId ?? '',
    projectLeaderName: value.projectLeaderName ?? '',
    plannedStartDate: value.plannedStartDate ?? '',
    plannedEndDate: value.plannedEndDate ?? '',
    investmentEntityId: value.investmentEntityId ?? '',
    investmentEntityName: value.investmentEntityName ?? '',
    investmentDirection: value.investmentDirection ?? '',
    domesticOverseas: value.domesticOverseas ?? '',
    investmentMethod: value.investmentMethod ?? '',
    majorProject: value.majorProject === null ? '' : value.majorProject ? 'yes' : 'no',
    currencyCode: value.currencyCode ?? '',
    projectTotalInvestment: value.projectTotalInvestment ?? '',
    plannedInvestment: value.plannedInvestment ?? '',
    expectedReturnRate: value.expectedReturnRate ?? '',
    fundingCompanyOwned: value.fundingCompanyOwned ?? '',
    fundingGroupRequested: value.fundingGroupRequested ?? '',
    fundingSpecialBond: value.fundingSpecialBond ?? '',
    fundingGovernment: value.fundingGovernment ?? '',
    fundingLoan: value.fundingLoan ?? '',
    fundingOther: value.fundingOther ?? '',
    annualPlannedInvestment: value.annualPlannedInvestment ?? ''
  });
}

async function persistDraft(showMessage = true): Promise<GroupDecisionApplicationDetail> {
  const payload = groupDecisionPayloadFromForm(form);
  const saved = detail.value
    ? await updateGroupDecisionApplication(detail.value.id, payload, initiatorActor)
    : await createGroupDecisionApplication(payload, initiatorActor);
  applyDetail(saved);
  if (showMessage) notify('已保存待发');
  return saved;
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
  } catch (error) {
    notify(error instanceof Error ? error.message : '操作失败');
  } finally {
    busy.value = false;
  }
}

function saveDraft() {
  return run(async () => { await persistDraft(); });
}

function send() {
  return run(async () => {
    const saved = await persistDraft(false);
    applyDetail(await submitGroupDecisionApplication(saved.id, initiatorActor));
    notify('已发送至经办部门负责人');
  });
}

function approve() {
  if (!detail.value) return;
  return run(async () => {
    const beforeStage = currentStage.value;
    applyDetail(await approveGroupDecisionApplication(
      detail.value!.id,
      reviewComment.value,
      reviewerActor.value
    ));
    reviewComment.value = '';
    notify(beforeStage === 1 ? '已流转至经办部门分管领导' : '审批已完成');
  });
}

function returnBack() {
  if (!detail.value) return;
  return run(async () => {
    applyDetail(await returnGroupDecisionApplication(
      detail.value!.id,
      reviewComment.value,
      reviewerActor.value
    ));
    reviewComment.value = '';
    mode.value = 'initiator';
    notify('已退回经办人');
  });
}
</script>

<template>
  <header class="app-header">
    <div class="brand"><span class="brand-mark">投</span><span>投资管理系统</span></div>
    <div class="header-user"><span class="avatar">综</span><span>综合管理员</span></div>
  </header>

  <main class="workspace">
    <div class="toolbar">
      <div class="breadcrumb">投资决策 / <strong>集团决策申请</strong></div>
      <div class="toolbar-right">
        <span class="status-chip" :class="currentStatus.toLowerCase()">{{ statusLabel }}</span>
        <span class="mode-label">办理身份</span>
        <div class="segmented">
          <button type="button" :class="{ active: mode === 'initiator' }" @click="mode = 'initiator'">经办人</button>
          <button type="button" :class="{ active: mode === 'reviewer' }" @click="mode = 'reviewer'">审核人</button>
        </div>
      </div>
    </div>

    <article class="document">
      <header class="document-title">
        <h1>集团决策申请</h1>
        <div class="document-no"><span>No</span><strong>{{ detail?.applicationNo ?? '保存后生成' }}</strong></div>
      </header>

      <div class="document-meta">
        <div class="meta-item"><label>申请人</label><div class="meta-value">{{ detail?.applicantName ?? initiatorActor.name }}</div></div>
        <div class="meta-item"><label>申请单位</label><div class="meta-value">{{ detail?.applicantUnitName ?? initiatorActor.unitName }}</div></div>
        <div class="meta-item"><label>申请日期</label><input v-model="form.applicationDate" type="date" :disabled="!editable"></div>
      </div>

      <form class="document-body" @submit.prevent>
        <section class="section">
          <div class="section-heading"><h2>申请信息</h2></div>
          <div class="form-grid">
            <label class="field span-6"><span>申请年度</span><input v-model="form.applicationYear" type="number" min="2000" max="2100" :disabled="!editable"></label>
            <label class="field span-6"><span>申请部门</span><input :value="detail?.applicantDepartmentName ?? initiatorActor.departmentName" disabled></label>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>项目信息</h2><span>业务字段可按实际项目填写</span></div>
          <div class="form-grid">
            <label class="field span-6"><span>项目名称</span><input v-model="form.projectName" maxlength="255" :disabled="!editable" placeholder="请输入项目名称"></label>
            <label class="field span-3"><span>项目编码</span><input v-model="form.projectCode" maxlength="64" :disabled="!editable" placeholder="请输入或选择项目编码"></label>
            <label class="field span-3"><span>项目负责人</span><input v-model="form.projectLeaderName" maxlength="128" :disabled="!editable" placeholder="请输入项目负责人"></label>

            <label class="field span-3"><span>计划开始</span><input v-model="form.plannedStartDate" type="date" :disabled="!editable"></label>
            <label class="field span-3"><span>计划结束</span><input v-model="form.plannedEndDate" type="date" :disabled="!editable"></label>
            <label class="field span-6"><span>投资主体</span><input v-model="form.investmentEntityName" maxlength="255" :disabled="!editable" placeholder="请输入或选择投资主体"></label>

            <label class="field span-3"><span>投资方向</span><select v-model="form.investmentDirection" :disabled="!editable"><option value="">请选择</option><option value="STRATEGIC">战略性投资</option><option value="FINANCIAL">财务性投资</option><option value="INDUSTRIAL">产业协同投资</option></select></label>
            <label class="field span-3"><span>境内外</span><select v-model="form.domesticOverseas" :disabled="!editable"><option value="">请选择</option><option value="DOMESTIC">境内</option><option value="OVERSEAS">境外</option></select></label>
            <label class="field span-3"><span>投资方式</span><select v-model="form.investmentMethod" :disabled="!editable"><option value="">请选择</option><option value="EQUITY">股权投资</option><option value="FIXED_ASSET">固定资产投资</option><option value="FUND">基金投资</option><option value="OTHER">其他</option></select></label>
            <div class="field span-3"><span>重大项目</span><div class="radio-box"><label><input v-model="form.majorProject" type="radio" value="yes" :disabled="!editable"> 是</label><label><input v-model="form.majorProject" type="radio" value="no" :disabled="!editable"> 否</label></div></div>

            <label class="field span-3"><span>投资币种</span><select v-model="form.currencyCode" :disabled="!editable"><option value="CNY">人民币（CNY）</option><option value="USD">美元（USD）</option><option value="EUR">欧元（EUR）</option><option value="HKD">港币（HKD）</option></select></label>
            <label class="field span-3"><span>项目总投资</span><div class="unit-input"><input v-model="form.projectTotalInvestment" type="number" min="0" step="0.01" :disabled="!editable"><em>元</em></div></label>
            <label class="field span-3"><span>计划投资额</span><div class="unit-input"><input v-model="form.plannedInvestment" type="number" min="0" step="0.01" :disabled="!editable"><em>元</em></div></label>
            <label class="field span-3"><span>预计收益率</span><div class="unit-input"><input v-model="form.expectedReturnRate" type="number" min="0" max="100" step="0.0001" :disabled="!editable"><em>%</em></div></label>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>资金计划</h2></div>
          <div class="funding-table-wrap">
            <table class="funding-plan-table">
              <thead><tr><th>项目公司自有资金</th><th>申请集团资金</th><th>项目专项债</th><th>政府资金</th><th>贷款</th><th>其他资金</th><th>本年计划投资额</th></tr></thead>
              <tbody><tr>
                <td><input v-model="form.fundingCompanyOwned" aria-label="项目公司自有资金" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.fundingGroupRequested" aria-label="申请集团资金" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.fundingSpecialBond" aria-label="项目专项债" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.fundingGovernment" aria-label="政府资金" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.fundingLoan" aria-label="贷款" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.fundingOther" aria-label="其他资金" type="number" min="0" step="0.01" :disabled="!editable"></td>
                <td><input v-model="form.annualPlannedInvestment" aria-label="本年计划投资额" type="number" min="0" step="0.01" :disabled="!editable"></td>
              </tr></tbody>
            </table>
          </div>
          <p class="decision-hint">提示：选择由集团进行投资决策的项目发起本流程；权属企业自主决策的项目请发起投资议案提报流程。</p>
        </section>

        <section class="section">
          <div class="section-heading"><h2>审批信息</h2></div>
          <div class="workflow-card">
            <div class="workflow-route">
              <template v-for="(step, index) in approvalStages" :key="step.stage">
                <div class="workflow-step" :class="{ done: currentStage > step.stage, active: currentStage === step.stage && currentStage < (approvalPolicy?.completedStage ?? 3) }">
                  <div class="step-icon">{{ index + 1 }}</div><strong>{{ step.name }}</strong><small>{{ step.action === 'SUBMIT' ? initiatorActor.name : '审核' }}</small>
                </div>
                <div v-if="index < approvalStages.length - 1" class="workflow-line" :class="{ done: currentStage > step.stage }"></div>
              </template>
            </div>

            <label v-if="mode === 'reviewer'" class="review-comment"><span>审批意见</span><textarea v-model="reviewComment" maxlength="2000" placeholder="请输入审批意见（非必填）"></textarea></label>

            <div v-if="detail?.history.length" class="history">
              <h3>流转记录</h3>
              <table><thead><tr><th>操作</th><th>办理人</th><th>意见</th><th>时间</th></tr></thead><tbody><tr v-for="item in detail.history" :key="item.id"><td>{{ actionLabels[item.action] }}</td><td>{{ item.operatorName }}</td><td>{{ item.comment || '—' }}</td><td>{{ item.createdAt }}</td></tr></tbody></table>
            </div>
          </div>
        </section>
      </form>
    </article>
  </main>

  <footer class="action-bar">
    <template v-if="mode === 'initiator'">
      <button type="button" :disabled="busy || !editable" @click="saveDraft">保存待发</button>
      <button type="button" class="primary" :disabled="busy || !editable" @click="send">发送</button>
    </template>
    <template v-else>
      <button type="button" class="danger" :disabled="busy || !reviewable" @click="returnBack">退回</button>
      <button type="button" class="success" :disabled="busy || !reviewable" @click="approve">同意</button>
    </template>
  </footer>
  <div class="toast" :class="{ show: toast }">{{ toast }}</div>
</template>
