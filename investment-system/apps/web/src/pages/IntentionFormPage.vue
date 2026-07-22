<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  API_BASE, apiRequest, approveIntention, createIntention, fetchIntention,
  payloadFromForm, returnIntention, submitIntention, updateIntention, uploadFiles
} from '../api';
import { authState, hasPermission } from '../auth';
import type { DirectoryUser, IntentionDetail, IntentionForm, UnitItem } from '../types';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const route = useRoute();
const router = useRouter();
const detail = ref<IntentionDetail | null>(null);
const units = ref<UnitItem[]>([]);
const users = ref<DirectoryUser[]>([]);
const pendingFiles = ref<File[]>([]);
const reviewComment = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const form = reactive<IntentionForm>({
  applicationDate: today(), projectName: '', investmentEntityId: '', investmentMethod: 'EQUITY', majorProject: '',
  plannedStartDate: '', plannedEndDate: '', projectLeaderUserId: '', contactPhone: '', projectLocation: '',
  projectSummary: '', mainContent: '', targetCompanyId: '', targetCompanyName: '', mainBusiness: '',
  investmentDirection: '', domesticOverseas: '', currencyCode: 'CNY', exchangeRate: '1.0000',
  plannedShareholdingRatio: '', projectTotalInvestment: '', plannedInvestment: '', expectedReturnRate: ''
});

const id = computed(() => route.params.id && route.params.id !== 'new' ? String(route.params.id) : '');
const editable = computed(() => !detail.value
  ? hasPermission('investment.intention.create')
  : hasPermission('investment.intention.update') && detail.value.applicantUserId === authState.user?.id &&
    ['PENDING_SEND', 'RETURNED'].includes(detail.value.status));
const reviewable = computed(() => detail.value?.status === 'IN_REVIEW' &&
  detail.value.currentApproverUserId === authState.user?.id &&
  (detail.value.currentStage === 1
    ? hasPermission('investment.intention.approve_department')
    : detail.value.currentStage === 2 && hasPermission('investment.intention.approve_supervising')));
const statusLabel = computed(() => ({ PENDING_SEND: '待发', IN_REVIEW: '审核中', APPROVED: '已通过', RETURNED: '已退回' }[detail.value?.status ?? 'PENDING_SEND']));

function apply(value: IntentionDetail) {
  detail.value = value;
  Object.assign(form, {
    applicationDate: value.applicationDate ?? '', projectName: value.projectName ?? '',
    investmentEntityId: value.investmentEntityId ?? '', investmentMethod: value.investmentMethod ?? 'EQUITY',
    majorProject: value.majorProject === null ? '' : value.majorProject ? 'yes' : 'no',
    plannedStartDate: value.plannedStartDate ?? '', plannedEndDate: value.plannedEndDate ?? '',
    projectLeaderUserId: value.projectLeaderUserId ?? '', contactPhone: value.contactPhone ?? '',
    projectLocation: value.projectLocation ?? '', projectSummary: value.projectSummary ?? '', mainContent: value.mainContent ?? '',
    targetCompanyId: value.targetCompanyId ?? '', targetCompanyName: value.targetCompanyName ?? '', mainBusiness: value.mainBusiness ?? '',
    investmentDirection: value.investmentDirection ?? '', domesticOverseas: value.domesticOverseas ?? '',
    currencyCode: value.currencyCode ?? 'CNY', exchangeRate: value.exchangeRate ?? '',
    plannedShareholdingRatio: value.plannedShareholdingRatio ?? '', projectTotalInvestment: value.projectTotalInvestment ?? '',
    plannedInvestment: value.plannedInvestment ?? '', expectedReturnRate: value.expectedReturnRate ?? ''
  });
}

async function load() {
  error.value = '';
  try {
    if (id.value) apply(await fetchIntention(id.value));
    if (!id.value || editable.value) {
      [units.value, users.value] = await Promise.all([
        apiRequest<UnitItem[]>('/directory/units'), apiRequest<DirectoryUser[]>('/directory/users')
      ]);
    }
  } catch (value) { error.value = value instanceof Error ? value.message : '加载失败'; }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; message.value = ''; error.value = '';
  try { await action(); }
  catch (value) { error.value = value instanceof Error ? value.message : '操作失败'; }
  finally { busy.value = false; }
}

async function persist(showMessage = true) {
  const saved = detail.value
    ? await updateIntention(detail.value.id, payloadFromForm(form, detail.value.version))
    : await createIntention(payloadFromForm(form));
  apply(saved);
  if (!id.value) await router.replace(`/intentions/${saved.id}`);
  if (pendingFiles.value.length) {
    await uploadFiles(saved.id, pendingFiles.value);
    pendingFiles.value = [];
    apply(await fetchIntention(saved.id));
  }
  if (showMessage) message.value = '已保存待发';
  return saved;
}

function save() { return run(async () => { await persist(); }); }
function submit() { return run(async () => { const saved = await persist(false); apply(await submitIntention(saved.id)); message.value = '已提交审批'; }); }
function approve() { return run(async () => { apply(await approveIntention(detail.value!.id, reviewComment.value)); reviewComment.value = ''; message.value = '审批已完成'; }); }
function returnBack() { return run(async () => { apply(await returnIntention(detail.value!.id, reviewComment.value)); reviewComment.value = ''; message.value = '已退回申请人'; }); }

function onFiles(event: Event) { pendingFiles.value = Array.from((event.target as HTMLInputElement).files ?? []); }
function onTargetCompanyChange() {
  const companies: Record<string, { name: string; business: string }> = {
    'target-a': { name: '远望新能源科技有限公司', business: '新能源技术研发、设备制造与运营服务' },
    'target-b': { name: '华北产业发展有限公司', business: '产业园区投资建设与资产运营' },
    'target-c': { name: '海州先进制造有限公司', business: '先进制造、工业自动化及技术服务' }
  };
  form.targetCompanyName = companies[form.targetCompanyId]?.name ?? '';
  form.mainBusiness = companies[form.targetCompanyId]?.business ?? '';
}
function fileSize(size: number) { return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

onMounted(load);
</script>

<template>
  <div class="toolbar form-page-toolbar">
    <div class="breadcrumb"><RouterLink to="/intentions">投资意向</RouterLink> / <strong>{{ id ? '查看/办理' : '新建' }}</strong></div>
    <span class="status-chip">{{ statusLabel }}</span>
  </div>
  <div v-if="error" class="form-error page-message">{{ error }}</div>
  <div v-if="message" class="form-success page-message">{{ message }}</div>
  <article class="document">
    <header class="document-title"><h1>股权投资意向登记</h1><div class="document-no"><span>No</span><strong>{{ detail?.applicationNo ?? '保存后生成' }}</strong></div></header>
    <div class="document-meta">
      <div class="meta-item"><label>申请人</label><div class="meta-value">{{ authState.user?.name }}</div></div>
      <div class="meta-item"><label>投资主体</label><select v-model="form.investmentEntityId" :disabled="!editable"><option value="">请选择</option><option v-if="detail?.investmentEntityId && !units.some(unit => unit.id === detail?.investmentEntityId)" :value="detail.investmentEntityId">{{ detail.investmentEntityName }}</option><option v-for="unit in units" :key="unit.id" :value="unit.id">{{ unit.name }}</option></select></div>
      <div class="meta-item"><label>申请日期</label><input v-model="form.applicationDate" type="date" :disabled="!editable"></div>
    </div>
    <form class="document-body" @submit.prevent>
      <section class="section">
        <div class="section-heading"><h2>基础信息</h2><span>未标注字段可留空</span></div>
        <div class="form-grid">
          <label class="field span-6"><span>项目名称</span><input v-model="form.projectName" maxlength="300" :disabled="!editable"></label>
          <label class="field span-3"><span>投资方式</span><select v-model="form.investmentMethod" :disabled="!editable"><option value="EQUITY">股权投资</option></select></label>
          <div class="field span-3"><span>重大项目</span><div class="radio-box"><label><input v-model="form.majorProject" type="radio" value="yes" :disabled="!editable"> 是</label><label><input v-model="form.majorProject" type="radio" value="no" :disabled="!editable"> 否</label></div></div>
          <label class="field span-3"><span>计划开始</span><input v-model="form.plannedStartDate" type="date" :disabled="!editable"></label>
          <label class="field span-3"><span>计划结束</span><input v-model="form.plannedEndDate" type="date" :disabled="!editable"></label>
          <label class="field span-3"><span>项目负责人</span><select v-model="form.projectLeaderUserId" :disabled="!editable"><option value="">请选择</option><option v-if="detail?.projectLeaderUserId && !users.some(user => user.id === detail?.projectLeaderUserId)" :value="detail.projectLeaderUserId">{{ detail.projectLeaderName }}</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}（{{ user.departmentName }}）</option></select></label>
          <label class="field span-3"><span>联系电话</span><input v-model="form.contactPhone" maxlength="50" :disabled="!editable"></label>
          <label class="field span-6"><span>项目地点</span><input v-model="form.projectLocation" maxlength="500" :disabled="!editable"></label>
          <div class="field span-6 upload-field"><span>调研报告</span><div class="upload-area"><input type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" :disabled="!editable" @change="onFiles"><small>单个文件不超过20 MB</small></div></div>
          <div v-if="pendingFiles.length || detail?.attachments?.length" class="attachment-list span-12">
            <span v-for="file in pendingFiles" :key="file.name" class="file-chip">待上传 · {{ file.name }}</span>
            <a v-for="file in detail?.attachments ?? []" :key="file.id" class="file-chip saved" :href="`${API_BASE}/attachments/${file.id}/download`">{{ file.originalName }} · {{ fileSize(file.fileSize) }}</a>
          </div>
          <label class="field textarea-field span-12"><span>项目概述</span><textarea v-model="form.projectSummary" :disabled="!editable"></textarea></label>
          <label class="field textarea-field span-12"><span>主要内容</span><textarea v-model="form.mainContent" :disabled="!editable"></textarea></label>
        </div>
      </section>
      <section class="section">
        <div class="section-heading"><h2>投资情况</h2></div>
        <div class="form-grid">
          <label class="field span-6"><span>标的企业</span><select v-model="form.targetCompanyId" :disabled="!editable" @change="onTargetCompanyChange"><option value="">请选择</option><option value="target-a">远望新能源科技有限公司</option><option value="target-b">华北产业发展有限公司</option><option value="target-c">海州先进制造有限公司</option></select></label>
          <label class="field span-6"><span>主营业务</span><input v-model="form.mainBusiness" maxlength="1000" :disabled="!editable"></label>
          <label class="field span-3"><span>投资方向</span><select v-model="form.investmentDirection" :disabled="!editable"><option value="">请选择</option><option value="strategic">战略性投资</option><option value="financial">财务性投资</option><option value="industrial">产业协同投资</option></select></label>
          <label class="field span-3"><span>境内外</span><select v-model="form.domesticOverseas" :disabled="!editable"><option value="">请选择</option><option value="DOMESTIC">境内</option><option value="OVERSEAS">境外</option></select></label>
          <label class="field span-3"><span>投资币种</span><select v-model="form.currencyCode" :disabled="!editable"><option value="CNY">人民币</option><option value="USD">美元</option><option value="EUR">欧元</option><option value="HKD">港币</option></select></label>
          <label class="field span-3"><span>投资汇率</span><input v-model="form.exchangeRate" type="number" step="0.000001" :disabled="!editable"></label>
          <label class="field span-3"><span>计划占股比</span><div class="unit-input"><input v-model="form.plannedShareholdingRatio" type="number" step="0.0001" :disabled="!editable"><em>%</em></div></label>
          <label class="field span-3"><span>项目总投资额</span><div class="unit-input"><input v-model="form.projectTotalInvestment" type="number" step="0.01" :disabled="!editable"><em>元</em></div></label>
          <label class="field span-3"><span>计划投资额</span><div class="unit-input"><input v-model="form.plannedInvestment" type="number" step="0.01" :disabled="!editable"><em>元</em></div></label>
          <label class="field span-3"><span>预计收益率</span><div class="unit-input"><input v-model="form.expectedReturnRate" type="number" step="0.0001" :disabled="!editable"><em>%</em></div></label>
        </div>
      </section>
      <section class="section">
        <div class="section-heading"><h2>审批信息</h2></div>
        <div class="workflow-card">
          <div class="workflow-route"><template v-for="(step, index) in ['业务发起人', '部门负责人', '分管领导']" :key="step"><div class="workflow-step" :class="{ done: (detail?.currentStage ?? 0) > index, active: (detail?.currentStage ?? 0) === index && (detail?.currentStage ?? 0) < 3 }"><div class="step-icon">{{ index + 1 }}</div><strong>{{ step }}</strong></div><div v-if="index < 2" class="workflow-line" :class="{ done: (detail?.currentStage ?? 0) > index }"></div></template></div>
          <label v-if="reviewable" class="review-comment"><span>审批意见</span><textarea v-model="reviewComment" maxlength="2000"></textarea></label>
          <div v-if="detail?.history?.length" class="history"><h3>流转记录</h3><table><thead><tr><th>操作</th><th>办理人</th><th>意见</th><th>时间</th></tr></thead><tbody><tr v-for="item in detail.history" :key="item.id"><td>{{ { SUBMIT: '发送', APPROVE: '同意', RETURN: '退回' }[item.action] }}</td><td>{{ item.operatorName }}</td><td>{{ item.comment || '—' }}</td><td>{{ item.createdAt }}</td></tr></tbody></table></div>
        </div>
      </section>
    </form>
  </article>
  <div class="inline-action-bar">
    <template v-if="editable"><button :disabled="busy || !(detail ? hasPermission('investment.intention.update') : hasPermission('investment.intention.create'))" @click="save">保存待发</button><button class="primary" :disabled="busy || !hasPermission('investment.intention.submit')" @click="submit">提交审批</button></template>
    <template v-if="reviewable"><button class="danger" :disabled="busy" @click="returnBack">退回</button><button class="success" :disabled="busy" @click="approve">同意</button></template>
  </div>
</template>
