<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  apiRequest,
  approveGroupDecisionApplication,
  createGroupDecisionApplication,
  fetchGroupDecisionApplication,
  groupDecisionPayloadFromForm,
  returnGroupDecisionApplication,
  submitGroupDecisionApplication,
  updateGroupDecisionApplication
} from './api';
import { authState, hasPermission } from './auth';
import type {
  DirectoryUser,
  GroupDecisionApplicationDetail,
  GroupDecisionApplicationForm,
  UnitItem
} from './types';

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const route = useRoute();
const router = useRouter();
const currentDate = today();
const detail = ref<GroupDecisionApplicationDetail | null>(null);
const units = ref<UnitItem[]>([]);
const users = ref<DirectoryUser[]>([]);
const reviewComment = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const form = reactive<GroupDecisionApplicationForm>({
  applicationDate: currentDate,
  applicationYear: currentDate.slice(0, 4),
  projectName: '',
  projectCode: '',
  projectLeaderUserId: '',
  plannedStartDate: '',
  plannedEndDate: '',
  investmentEntityId: '',
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

const id = computed(() => route.params.id && route.params.id !== 'new' ? String(route.params.id) : '');
const currentDirectoryUser = computed(() => users.value.find(user => user.id === authState.user?.id));
const currentStatus = computed(() => detail.value?.status ?? 'PENDING_SEND');
const currentStage = computed(() => detail.value?.currentStage ?? 0);
const statusLabel = computed(() => ({
  PENDING_SEND: '待发', IN_REVIEW: '审核中', APPROVED: '已通过', RETURNED: '已退回'
}[currentStatus.value]));
const editable = computed(() => !detail.value
  ? hasPermission('investment.group_decision.create')
  : hasPermission('investment.group_decision.update') && detail.value.applicantUserId === authState.user?.id &&
    ['PENDING_SEND', 'RETURNED'].includes(detail.value.status));
const reviewable = computed(() => detail.value?.status === 'IN_REVIEW' &&
  detail.value.currentApproverUserId === authState.user?.id &&
  (detail.value.currentStage === 1
    ? hasPermission('investment.group_decision.approve_department')
    : detail.value.currentStage === 2 && hasPermission('investment.group_decision.approve_supervising')));

function apply(value: GroupDecisionApplicationDetail) {
  detail.value = value;
  Object.assign(form, {
    applicationDate: value.applicationDate ?? '',
    applicationYear: String(value.applicationYear ?? ''),
    projectName: value.projectName ?? '',
    projectCode: value.projectCode ?? '',
    projectLeaderUserId: value.projectLeaderUserId ?? '',
    plannedStartDate: value.plannedStartDate ?? '',
    plannedEndDate: value.plannedEndDate ?? '',
    investmentEntityId: value.investmentEntityId ?? '',
    investmentDirection: value.investmentDirection ?? '',
    domesticOverseas: value.domesticOverseas ?? '',
    investmentMethod: value.investmentMethod ?? '',
    majorProject: value.majorProject === null ? '' : value.majorProject ? 'yes' : 'no',
    currencyCode: value.currencyCode ?? 'CNY',
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

async function load() {
  error.value = '';
  try {
    if (id.value) apply(await fetchGroupDecisionApplication(id.value));
    if (!id.value || editable.value) {
      [units.value, users.value] = await Promise.all([
        apiRequest<UnitItem[]>('/directory/units'),
        apiRequest<DirectoryUser[]>('/directory/users')
      ]);
    }
  } catch (value) {
    error.value = value instanceof Error ? value.message : '加载失败';
  }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  error.value = '';
  try {
    await action();
  } catch (value) {
    error.value = value instanceof Error ? value.message : '操作失败';
  } finally {
    busy.value = false;
  }
}

async function persist(showMessage = true) {
  const saved = detail.value
    ? await updateGroupDecisionApplication(
      detail.value.id,
      groupDecisionPayloadFromForm(form, detail.value.version)
    )
    : await createGroupDecisionApplication(groupDecisionPayloadFromForm(form));
  apply(saved);
  if (!id.value) await router.replace(`/group-decisions/${saved.id}`);
  if (showMessage) message.value = '已保存待发';
  return saved;
}

function save() {
  return run(async () => { await persist(); });
}

function submit() {
  return run(async () => {
    const saved = await persist(false);
    apply(await submitGroupDecisionApplication(saved.id));
    message.value = '已提交至经办部门负责人';
  });
}

function approve() {
  return run(async () => {
    const beforeStage = currentStage.value;
    apply(await approveGroupDecisionApplication(detail.value!.id, reviewComment.value));
    reviewComment.value = '';
    message.value = beforeStage === 1 ? '已流转至经办部门分管领导' : '审批已完成';
  });
}

function returnBack() {
  return run(async () => {
    apply(await returnGroupDecisionApplication(detail.value!.id, reviewComment.value));
    reviewComment.value = '';
    message.value = '已退回经办人';
  });
}

onMounted(load);
</script>

<template>
  <div class="toolbar form-page-toolbar">
    <div class="breadcrumb">投资决策 / <strong>集团决策申请</strong></div>
    <span class="status-chip">{{ statusLabel }}</span>
  </div>
  <div v-if="error" class="form-error page-message">{{ error }}</div>
  <div v-if="message" class="form-success page-message">{{ message }}</div>

  <article class="document">
    <header class="document-title">
      <h1>集团决策申请</h1>
      <div class="document-no"><span>No</span><strong>{{ detail?.applicationNo ?? '保存后生成' }}</strong></div>
    </header>

    <div class="document-meta">
      <div class="meta-item"><label>申请人</label><div class="meta-value">{{ detail?.applicantName ?? authState.user?.name }}</div></div>
      <div class="meta-item"><label>申请单位</label><div class="meta-value">{{ detail?.applicantUnitName ?? currentDirectoryUser?.unitName ?? '由人员组织关系带出' }}</div></div>
      <div class="meta-item"><label>申请日期</label><input v-model="form.applicationDate" type="date" :disabled="!editable"></div>
    </div>

    <form class="document-body" @submit.prevent>
      <section class="section">
        <div class="section-heading"><h2>申请信息</h2></div>
        <div class="form-grid">
          <label class="field span-6"><span>申请年度</span><input v-model="form.applicationYear" type="number" min="2000" max="2100" :disabled="!editable"></label>
          <label class="field span-6"><span>申请部门</span><input :value="detail?.applicantDepartmentName ?? currentDirectoryUser?.departmentName ?? '由人员组织关系带出'" disabled></label>
        </div>
      </section>

      <section class="section">
        <div class="section-heading"><h2>项目信息</h2><span>未标注字段可留空</span></div>
        <div class="form-grid">
          <label class="field span-6"><span>项目名称</span><input v-model="form.projectName" maxlength="255" :disabled="!editable"></label>
          <label class="field span-3"><span>项目编码</span><input v-model="form.projectCode" maxlength="64" :disabled="!editable"></label>
          <label class="field span-3"><span>项目负责人</span><select v-model="form.projectLeaderUserId" :disabled="!editable"><option value="">请选择</option><option v-if="detail?.projectLeaderUserId && !users.some(user => user.id === detail?.projectLeaderUserId)" :value="detail.projectLeaderUserId">{{ detail.projectLeaderName }}</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}（{{ user.departmentName }}）</option></select></label>

          <label class="field span-3"><span>计划开始</span><input v-model="form.plannedStartDate" type="date" :disabled="!editable"></label>
          <label class="field span-3"><span>计划结束</span><input v-model="form.plannedEndDate" type="date" :disabled="!editable"></label>
          <label class="field span-6"><span>投资主体</span><select v-model="form.investmentEntityId" :disabled="!editable"><option value="">请选择</option><option v-if="detail?.investmentEntityId && !units.some(unit => unit.id === detail?.investmentEntityId)" :value="detail.investmentEntityId">{{ detail.investmentEntityName }}</option><option v-for="unit in units" :key="unit.id" :value="unit.id">{{ unit.name }}</option></select></label>

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
          <div class="workflow-route"><template v-for="(step, index) in ['经办人', '经办部门负责人', '经办部门分管领导']" :key="step"><div class="workflow-step" :class="{ done: currentStage > index, active: currentStage === index && currentStage < 3 }"><div class="step-icon">{{ index + 1 }}</div><strong>{{ step }}</strong></div><div v-if="index < 2" class="workflow-line" :class="{ done: currentStage > index }"></div></template></div>
          <label v-if="reviewable" class="review-comment"><span>审批意见</span><textarea v-model="reviewComment" maxlength="2000"></textarea></label>
          <div v-if="detail?.history.length" class="history"><h3>流转记录</h3><table><thead><tr><th>操作</th><th>办理人</th><th>意见</th><th>时间</th></tr></thead><tbody><tr v-for="item in detail.history" :key="item.id"><td>{{ { SUBMIT: '发送', APPROVE: '同意', RETURN: '退回' }[item.action] }}</td><td>{{ item.operatorName }}</td><td>{{ item.comment || '—' }}</td><td>{{ item.createdAt }}</td></tr></tbody></table></div>
        </div>
      </section>
    </form>
  </article>

  <div class="inline-action-bar">
    <template v-if="editable"><button :disabled="busy" @click="save">保存待发</button><button class="primary" :disabled="busy || !hasPermission('investment.group_decision.submit')" @click="submit">提交审批</button></template>
    <template v-if="reviewable"><button class="danger" :disabled="busy" @click="returnBack">退回</button><button class="success" :disabled="busy" @click="approve">同意</button></template>
  </div>
</template>
