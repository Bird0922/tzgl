<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  API_BASE,
  approveIntention,
  createIntention,
  payloadFromForm,
  returnIntention,
  submitIntention,
  updateIntention,
  uploadFiles
} from './api';
import type { Actor, IntentionDetail, IntentionForm } from './types';

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const form = reactive<IntentionForm>({
  applicationDate: today(),
  projectName: '',
  investmentMethod: 'EQUITY',
  majorProject: '',
  plannedStartDate: '',
  plannedEndDate: '',
  projectLeaderUserId: 'user-admin',
  projectLeaderName: '综合管理员',
  contactPhone: '',
  projectLocation: '',
  projectSummary: '',
  mainContent: '',
  targetCompanyId: '',
  targetCompanyName: '',
  mainBusiness: '',
  investmentDirection: '',
  domesticOverseas: '',
  currencyCode: 'CNY',
  exchangeRate: '1.0000',
  plannedShareholdingRatio: '',
  projectTotalInvestment: '',
  plannedInvestment: '',
  expectedReturnRate: ''
});

const detail = ref<IntentionDetail | null>(null);
const mode = ref<'initiator' | 'reviewer'>('initiator');
const reviewComment = ref('');
const pendingFiles = ref<File[]>([]);
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

const currentStatus = computed(() => detail.value?.status ?? 'PENDING_SEND');
const currentStage = computed(() => detail.value?.currentStage ?? 0);
const statusLabel = computed(() => statusLabels[currentStatus.value]);
const editable = computed(() => ['PENDING_SEND', 'RETURNED'].includes(currentStatus.value));
const reviewable = computed(() => currentStatus.value === 'IN_REVIEW');

const initiatorActor: Actor = {
  id: 'user-admin',
  name: '综合管理员',
  role: 'initiator'
};

const reviewerActor = computed<Actor>(() => currentStage.value === 2
  ? { id: 'user-division-leader', name: '投资部门分管领导', role: 'division_leader' }
  : { id: 'user-department-head', name: '投资部门负责人', role: 'department_head' }
);

function notify(message: string) {
  window.clearTimeout(toastTimer);
  toast.value = message;
  toastTimer = window.setTimeout(() => { toast.value = ''; }, 2400);
}

function applyDetail(value: IntentionDetail) {
  detail.value = value;
  Object.assign(form, {
    applicationDate: value.applicationDate ?? '',
    projectName: value.projectName ?? '',
    investmentMethod: value.investmentMethod ?? 'EQUITY',
    majorProject: value.majorProject === null ? '' : value.majorProject ? 'yes' : 'no',
    plannedStartDate: value.plannedStartDate ?? '',
    plannedEndDate: value.plannedEndDate ?? '',
    projectLeaderUserId: value.projectLeaderUserId ?? '',
    projectLeaderName: value.projectLeaderName ?? '',
    contactPhone: value.contactPhone ?? '',
    projectLocation: value.projectLocation ?? '',
    projectSummary: value.projectSummary ?? '',
    mainContent: value.mainContent ?? '',
    targetCompanyId: value.targetCompanyId ?? '',
    targetCompanyName: value.targetCompanyName ?? '',
    mainBusiness: value.mainBusiness ?? '',
    investmentDirection: value.investmentDirection ?? '',
    domesticOverseas: value.domesticOverseas ?? '',
    currencyCode: value.currencyCode ?? '',
    exchangeRate: value.exchangeRate ?? '',
    plannedShareholdingRatio: value.plannedShareholdingRatio ?? '',
    projectTotalInvestment: value.projectTotalInvestment ?? '',
    plannedInvestment: value.plannedInvestment ?? '',
    expectedReturnRate: value.expectedReturnRate ?? ''
  });
}

async function persistDraft(showMessage = true): Promise<IntentionDetail> {
  const payload = payloadFromForm(form);
  let saved = detail.value
    ? await updateIntention(detail.value.id, payload, initiatorActor)
    : await createIntention(payload, initiatorActor);

  if (pendingFiles.value.length) {
    await uploadFiles(saved.id, pendingFiles.value, initiatorActor);
    pendingFiles.value = [];
    saved = await fetch(`${API_BASE}/investment-intentions/${saved.id}`)
      .then(response => response.json())
      .then(result => result.data as IntentionDetail);
  }
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
    applyDetail(await submitIntention(saved.id, initiatorActor));
    notify('已发送至投资部门负责人');
  });
}

function approve() {
  if (!detail.value) return;
  return run(async () => {
    const beforeStage = currentStage.value;
    applyDetail(await approveIntention(detail.value!.id, reviewComment.value, reviewerActor.value));
    reviewComment.value = '';
    notify(beforeStage === 1 ? '已流转至投资部门分管领导' : '审批已完成');
  });
}

function returnBack() {
  if (!detail.value) return;
  return run(async () => {
    applyDetail(await returnIntention(detail.value!.id, reviewComment.value, reviewerActor.value));
    reviewComment.value = '';
    mode.value = 'initiator';
    notify('已退回业务发起人');
  });
}

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  pendingFiles.value = Array.from(input.files ?? []);
}

function onTargetCompanyChange() {
  const companies: Record<string, { name: string; business: string }> = {
    'target-a': { name: '远望新能源科技有限公司', business: '新能源技术研发、设备制造与运营服务' },
    'target-b': { name: '华北产业发展有限公司', business: '产业园区投资建设与资产运营' },
    'target-c': { name: '海州先进制造有限公司', business: '先进制造、工业自动化及技术服务' }
  };
  const selected = companies[form.targetCompanyId];
  form.targetCompanyName = selected?.name ?? '';
  form.mainBusiness = selected?.business ?? '';
}

function fileSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <header class="app-header">
    <div class="brand"><span class="brand-mark">投</span><span>投资管理系统</span></div>
    <div class="header-user"><span class="avatar">综</span><span>综合管理员</span></div>
  </header>

  <main class="workspace">
    <div class="toolbar">
      <div class="breadcrumb">投资前期 / 登记立项 / <strong>股权投资意向登记</strong></div>
      <div class="toolbar-right">
        <span class="status-chip" :class="currentStatus.toLowerCase()">{{ statusLabel }}</span>
        <span class="mode-label">办理身份</span>
        <div class="segmented">
          <button type="button" :class="{ active: mode === 'initiator' }" @click="mode = 'initiator'">发起节点</button>
          <button type="button" :class="{ active: mode === 'reviewer' }" @click="mode = 'reviewer'">审核节点</button>
        </div>
      </div>
    </div>

    <article class="document">
      <header class="document-title">
        <h1>股权投资意向登记</h1>
        <div class="document-no"><span>No</span><strong>{{ detail?.applicationNo ?? '保存后生成' }}</strong></div>
      </header>

      <div class="document-meta">
        <div class="meta-item"><label>申请人</label><div class="meta-value">综合管理员</div></div>
        <div class="meta-item"><label>投资主体</label><div class="meta-value">远望实业集团有限公司</div></div>
        <div class="meta-item"><label>申请日期</label><input v-model="form.applicationDate" type="date" :disabled="!editable"></div>
      </div>

      <form class="document-body" @submit.prevent>
        <section class="section">
          <div class="section-heading"><h2>基础信息</h2><span>所有字段均为非必填</span></div>
          <div class="form-grid">
            <label class="field span-6"><span>项目名称</span><input v-model="form.projectName" :disabled="!editable" placeholder="请输入项目名称"></label>
            <label class="field span-3"><span>投资方式</span><select v-model="form.investmentMethod" :disabled="!editable"><option value="EQUITY">股权投资</option></select></label>
            <div class="field span-3"><span>重大项目</span><div class="radio-box"><label><input v-model="form.majorProject" type="radio" value="yes" :disabled="!editable"> 是</label><label><input v-model="form.majorProject" type="radio" value="no" :disabled="!editable"> 否</label></div></div>

            <label class="field span-3"><span>计划开始</span><input v-model="form.plannedStartDate" type="date" :disabled="!editable"></label>
            <label class="field span-3"><span>计划结束</span><input v-model="form.plannedEndDate" type="date" :disabled="!editable"></label>
            <label class="field span-3"><span>项目负责人</span><select v-model="form.projectLeaderName" :disabled="!editable"><option value="">请选择</option><option>综合管理员</option><option>投资经理</option><option>投资部门负责人</option></select></label>
            <label class="field span-3"><span>联系电话</span><input v-model="form.contactPhone" :disabled="!editable" placeholder="请输入联系电话"></label>

            <label class="field span-6"><span>项目地点</span><input v-model="form.projectLocation" :disabled="!editable" placeholder="请输入项目地点"></label>
            <div class="field span-6 upload-field"><span>调研报告</span><div class="upload-area"><input type="file" multiple :disabled="!editable" @change="onFiles"><small>单个文件不超过 20 MB</small></div></div>
            <div v-if="pendingFiles.length || detail?.attachments.length" class="attachment-list span-12">
              <span v-for="file in pendingFiles" :key="file.name" class="file-chip">待上传 · {{ file.name }}</span>
              <a v-for="file in detail?.attachments ?? []" :key="file.id" class="file-chip saved" :href="`${API_BASE}/attachments/${file.id}/download`">{{ file.originalName }} · {{ fileSize(file.fileSize) }}</a>
            </div>

            <label class="field textarea-field span-12"><span>项目概述</span><textarea v-model="form.projectSummary" :disabled="!editable" placeholder="项目背景和投资的必要性"></textarea></label>
            <label class="field textarea-field span-12"><span>主要内容</span><textarea v-model="form.mainContent" :disabled="!editable" placeholder="项目的主要内容及相关说明"></textarea></label>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>投资情况</h2></div>
          <div class="form-grid">
            <label class="field span-6"><span>标的企业</span><select v-model="form.targetCompanyId" :disabled="!editable" @change="onTargetCompanyChange"><option value="">请选择投资企业</option><option value="target-a">远望新能源科技有限公司</option><option value="target-b">华北产业发展有限公司</option><option value="target-c">海州先进制造有限公司</option></select></label>
            <label class="field span-6"><span>主营业务</span><input v-model="form.mainBusiness" :disabled="!editable" placeholder="选择标的企业后自动带出"></label>

            <label class="field span-3"><span>投资方向</span><select v-model="form.investmentDirection" :disabled="!editable"><option value="">请选择</option><option value="strategic">战略性投资</option><option value="financial">财务性投资</option><option value="industrial">产业协同投资</option></select></label>
            <label class="field span-3"><span>境内外</span><select v-model="form.domesticOverseas" :disabled="!editable"><option value="">请选择</option><option value="DOMESTIC">境内</option><option value="OVERSEAS">境外</option></select></label>
            <label class="field span-3"><span>投资币种</span><select v-model="form.currencyCode" :disabled="!editable"><option value="CNY">人民币（CNY）</option><option value="USD">美元（USD）</option><option value="EUR">欧元（EUR）</option><option value="HKD">港币（HKD）</option></select></label>
            <label class="field span-3"><span>投资汇率</span><input v-model="form.exchangeRate" type="number" step="0.0001" :disabled="!editable"></label>

            <label class="field span-3"><span>计划占股比</span><div class="unit-input"><input v-model="form.plannedShareholdingRatio" type="number" step="0.01" :disabled="!editable"><em>%</em></div></label>
            <label class="field span-3"><span>项目总投资额</span><div class="unit-input"><input v-model="form.projectTotalInvestment" type="number" step="0.01" :disabled="!editable"><em>元</em></div></label>
            <label class="field span-3"><span>计划投资额</span><div class="unit-input"><input v-model="form.plannedInvestment" type="number" step="0.01" :disabled="!editable"><em>元</em></div></label>
            <label class="field span-3"><span>预计收益率</span><div class="unit-input"><input v-model="form.expectedReturnRate" type="number" step="0.01" :disabled="!editable"><em>%</em></div></label>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>审批信息</h2></div>
          <div class="workflow-card">
            <div class="workflow-route">
              <template v-for="(step, index) in ['业务发起人', '投资部门负责人', '投资部门分管领导']" :key="step">
                <div class="workflow-step" :class="{ done: currentStage > index, active: currentStage === index && currentStage < 3 }">
                  <div class="step-icon">{{ index + 1 }}</div><strong>{{ step }}</strong><small>{{ index === 0 ? '综合管理员' : '审核' }}</small>
                </div>
                <div v-if="index < 2" class="workflow-line" :class="{ done: currentStage > index }"></div>
              </template>
            </div>

            <label v-if="mode === 'reviewer'" class="review-comment"><span>审批意见</span><textarea v-model="reviewComment" placeholder="请输入审批意见（非必填）"></textarea></label>

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

