<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

withDefaults(defineProps<{ standalone?: boolean }>(), {
  standalone: false
});

type YesNo = '' | 'yes' | 'no';
type AttachmentGroup = 'applicationMaterials' | 'researchReports';

interface ProjectMember {
  id: number;
  name: string;
  department: string;
  position: string;
  contact: string;
  projectRole: string;
  taskAssignment: string;
}

const allowedAttachmentExtensions = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'
]);
const maxAttachmentCount = 10;
const maxAttachmentSize = 20 * 1024 * 1024;

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const form = reactive({
  applicantName: '综合管理员',
  applicationYear: String(new Date().getFullYear()),
  investmentMethod: '股权投资',
  applicationDate: localDate(),
  applicationUnit: '远望实业集团有限公司',
  receivingUnit: '远望实业集团有限公司',
  independentDecision: '' as YesNo,
  projectName: '',
  projectCode: '',
  majorProject: '' as YesNo,
  investmentEntity: '',
  projectLeader: '',
  contactPhone: '',
  plannedStartDate: '',
  plannedEndDate: '',
  investmentType: '',
  hasPartners: '' as YesNo,
  projectLocation: '',
  investmentTarget: '',
  mainBusiness: '',
  investmentDirection: '',
  domesticOverseas: '',
  currencyCode: 'CNY',
  exchangeRate: '1.0000',
  plannedShareholdingRatio: '',
  projectTotalInvestment: '',
  expectedReturnRate: '',
  projectOverview: '',
  mainContent: '',
  fundAndCostPlan: '',
  expectedReturns: '',
  promotionPlan: '',
  riskControlMeasures: ''
});

const fundingSources = reactive({
  companyOwnFunds: '',
  groupFunds: '',
  specialBonds: '',
  governmentFunds: '',
  loans: '',
  otherFunds: ''
});

const fundingFields: Array<{ key: keyof typeof fundingSources; label: string }> = [
  { key: 'companyOwnFunds', label: '项目公司自有资金' },
  { key: 'groupFunds', label: '申请集团资金' },
  { key: 'specialBonds', label: '项目专项债' },
  { key: 'governmentFunds', label: '政府资金' },
  { key: 'loans', label: '贷款' },
  { key: 'otherFunds', label: '其他资金' }
];

let memberSequence = 1;
function createMember(): ProjectMember {
  return {
    id: memberSequence++,
    name: '',
    department: '',
    position: '',
    contact: '',
    projectRole: '',
    taskAssignment: ''
  };
}

const members = ref<ProjectMember[]>([createMember()]);
const selectedMemberId = ref<number | null>(members.value[0].id);
const applicationMaterials = ref<File[]>([]);
const researchReports = ref<File[]>([]);
const toast = ref('');
const toastTone = ref<'normal' | 'error' | 'success'>('normal');
let toastTimer: number | undefined;

const totalFunding = computed(() => Object.values(fundingSources)
  .reduce((total, value) => total + (Number(value) || 0), 0));

const formattedTotalFunding = computed(() => new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(totalFunding.value));

function notify(message: string, tone: 'normal' | 'error' | 'success' = 'normal') {
  window.clearTimeout(toastTimer);
  toast.value = message;
  toastTone.value = tone;
  toastTimer = window.setTimeout(() => {
    toast.value = '';
  }, 2800);
}

function validateDates(): boolean {
  if (form.plannedStartDate && form.plannedEndDate && form.plannedStartDate > form.plannedEndDate) {
    notify('计划结束日期不能早于计划开始日期', 'error');
    return false;
  }
  return true;
}

function validateForSubmit(): boolean {
  if (!validateDates()) return false;
  if (totalFunding.value <= 0) {
    notify('投资资金来源不能全为 0，请正确填写资金来源', 'error');
    return false;
  }
  return true;
}

function saveDraft() {
  if (!validateDates()) return;
  notify('页面数据校验通过；后端接入后可保存待发', 'success');
}

function submitApplication() {
  if (!validateForSubmit()) return;
  notify('表单校验通过；审批提交将在后端流程接入后启用', 'success');
}

function attachmentFiles(group: AttachmentGroup) {
  return group === 'applicationMaterials' ? applicationMaterials : researchReports;
}

function onAttachmentChange(group: AttachmentGroup, event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  const target = attachmentFiles(group);
  const remaining = maxAttachmentCount - target.value.length;

  if (remaining <= 0) {
    notify(`每类附件最多上传 ${maxAttachmentCount} 个`, 'error');
    input.value = '';
    return;
  }

  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of selected.slice(0, remaining)) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!allowedAttachmentExtensions.has(extension) || file.size > maxAttachmentSize) {
      rejected.push(file.name);
      continue;
    }
    accepted.push(file);
  }

  target.value = [...target.value, ...accepted];
  input.value = '';
  if (selected.length > remaining || rejected.length) {
    notify('部分附件因数量、大小或扩展名不符合要求而未添加', 'error');
  } else if (accepted.length) {
    notify(`已添加 ${accepted.length} 个待上传附件`);
  }
}

function removeAttachment(group: AttachmentGroup, index: number) {
  const target = attachmentFiles(group);
  target.value = target.value.filter((_, fileIndex) => fileIndex !== index);
}

function addMember() {
  const member = createMember();
  members.value.push(member);
  selectedMemberId.value = member.id;
}

function copySelectedMember() {
  const selected = members.value.find(member => member.id === selectedMemberId.value);
  if (!selected) {
    notify('请先选择需要复制的项目组员', 'error');
    return;
  }
  const copy = { ...selected, id: memberSequence++ };
  members.value.push(copy);
  selectedMemberId.value = copy.id;
}

function removeSelectedMember() {
  if (selectedMemberId.value === null) {
    notify('请先选择需要删除的项目组员', 'error');
    return;
  }
  members.value = members.value.filter(member => member.id !== selectedMemberId.value);
  if (!members.value.length) members.value.push(createMember());
  selectedMemberId.value = members.value[0].id;
}

function clearMembers() {
  members.value = [createMember()];
  selectedMemberId.value = members.value[0].id;
}
</script>

<template>
  <div class="project-application-shell" :class="{ 'is-standalone': standalone }">
    <header v-if="standalone" class="app-header project-app-header">
      <div class="brand">
        <span class="brand-logo">
          <img
            src="/assets/seeyon_official_logo_white_20260722_c7a1.svg"
            alt="致远互联"
          >
        </span>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="product-identity">
          <strong>投资管理系统</strong>
          <span>协同运营管理平台</span>
        </span>
      </div>
      <div class="header-user">
        <span class="user-copy"><strong>综合管理员</strong><span>投资管理</span></span>
        <span class="avatar" aria-hidden="true">综</span>
      </div>
    </header>

    <main class="workspace">
      <div class="toolbar">
        <div class="breadcrumb">投资前期 / 登记立项 / <strong>股权投资立项申报</strong></div>
        <span class="status-chip">待发</span>
      </div>

      <article class="document project-application-document">
        <header class="document-title project-application-title">
          <div class="title-copy">
            <span>PROJECT INITIATION APPLICATION</span>
            <h1>股权投资立项申报</h1>
          </div>
          <div class="document-no"><span>No</span><strong>保存后生成</strong></div>
        </header>

        <form class="document-body" @submit.prevent>
          <section class="application-meta-card" aria-labelledby="application-meta-title">
            <h2 id="application-meta-title" class="sr-only">申报信息</h2>
            <div class="form-grid meta-form-grid">
              <label class="field span-3"><span>申报人</span><input :value="form.applicantName" disabled></label>
              <label class="field span-3"><span>申报年度</span><div class="unit-input"><input v-model="form.applicationYear" type="number" min="2000" max="2100"><em>年</em></div></label>
              <label class="field span-3"><span>投资方式</span><input :value="form.investmentMethod" disabled></label>
              <label class="field span-3"><span>申报日期</span><input v-model="form.applicationDate" type="date"></label>
              <label class="field span-6"><span>申报单位</span><input :value="form.applicationUnit" disabled></label>
              <label class="field span-6"><span>收报单位</span><input :value="form.receivingUnit" disabled></label>
              <div class="field span-3"><span>自主决策</span><div class="radio-box"><label><input v-model="form.independentDecision" type="radio" value="yes"> 是</label><label><input v-model="form.independentDecision" type="radio" value="no"> 否</label></div></div>
              <div class="field span-9 upload-field">
                <span>申报材料</span>
                <div class="upload-area">
                  <input id="application-materials" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg" @change="onAttachmentChange('applicationMaterials', $event)">
                  <small>最多 10 个，单个不超过 20 MB</small>
                </div>
              </div>
              <div v-if="applicationMaterials.length" class="attachment-list span-12">
                <span v-for="(file, index) in applicationMaterials" :key="`${file.name}-${file.lastModified}`" class="file-chip">
                  {{ file.name }}
                  <button type="button" :aria-label="`移除申报材料 ${file.name}`" @click="removeAttachment('applicationMaterials', index)">×</button>
                </span>
              </div>
            </div>
            <p class="funding-warning" role="note">注意：【投资资金来源】不能全为 0，请按资金来源正确填写。</p>
          </section>

          <section class="section">
            <div class="section-heading"><h2>项目信息</h2><span>立项申报核心信息</span></div>
            <div class="form-grid">
              <label class="field span-6"><span>项目名称</span><input v-model.trim="form.projectName" maxlength="300" placeholder="请输入项目名称"></label>
              <label class="field span-3"><span>项目编码</span><input :value="form.projectCode || '保存后生成'" disabled></label>
              <div class="field span-3"><span>重大项目</span><div class="radio-box"><label><input v-model="form.majorProject" type="radio" value="yes"> 是</label><label><input v-model="form.majorProject" type="radio" value="no"> 否</label></div></div>

              <label class="field span-6"><span>投资主体</span><select v-model="form.investmentEntity"><option value="">请选择投资主体</option><option>远望实业集团有限公司</option><option>远望产业投资有限公司</option></select></label>
              <label class="field span-3"><span>项目负责人</span><select v-model="form.projectLeader"><option value="">请选择</option><option>综合管理员</option><option>投资经理</option><option>投资部门负责人</option></select></label>
              <label class="field span-3"><span>联系电话</span><input v-model.trim="form.contactPhone" maxlength="50" inputmode="tel" placeholder="请输入联系电话"></label>

              <label class="field span-3"><span>计划开始</span><input v-model="form.plannedStartDate" type="date"></label>
              <label class="field span-3"><span>计划结束</span><input v-model="form.plannedEndDate" type="date"></label>
              <label class="field span-3"><span>投资类型</span><select v-model="form.investmentType"><option value="">请选择</option><option value="new">新设投资</option><option value="increase">增资扩股</option><option value="acquisition">股权收购</option><option value="other">其他股权投资</option></select></label>
              <div class="field span-3"><span>有无合作方</span><div class="radio-box"><label><input v-model="form.hasPartners" type="radio" value="yes"> 有</label><label><input v-model="form.hasPartners" type="radio" value="no"> 无</label></div></div>

              <label class="field span-6"><span>项目地点</span><input v-model.trim="form.projectLocation" maxlength="500" placeholder="请输入项目地点"></label>
              <div class="field span-6 upload-field">
                <span>调研报告</span>
                <div class="upload-area">
                  <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg" @change="onAttachmentChange('researchReports', $event)">
                  <small>最多 10 个，单个不超过 20 MB</small>
                </div>
              </div>
              <div v-if="researchReports.length" class="attachment-list span-12">
                <span v-for="(file, index) in researchReports" :key="`${file.name}-${file.lastModified}`" class="file-chip">
                  {{ file.name }}
                  <button type="button" :aria-label="`移除调研报告 ${file.name}`" @click="removeAttachment('researchReports', index)">×</button>
                </span>
              </div>

              <label class="field span-6"><span>投资对象</span><input v-model.trim="form.investmentTarget" maxlength="300" placeholder="请输入投资对象"></label>
              <label class="field span-6"><span>主营业务</span><input v-model.trim="form.mainBusiness" maxlength="1000" placeholder="请输入投资对象的主营业务"></label>

              <label class="field span-3"><span>投资方向</span><select v-model="form.investmentDirection"><option value="">请选择</option><option value="strategic">战略性投资</option><option value="financial">财务性投资</option><option value="industrial">产业协同投资</option></select></label>
              <label class="field span-3"><span>境内外</span><select v-model="form.domesticOverseas"><option value="">请选择</option><option value="DOMESTIC">境内</option><option value="OVERSEAS">境外</option></select></label>
              <label class="field span-3"><span>投资币种</span><select v-model="form.currencyCode"><option value="CNY">人民币（CNY）</option><option value="USD">美元（USD）</option><option value="EUR">欧元（EUR）</option><option value="HKD">港币（HKD）</option></select></label>
              <label class="field span-3"><span>投资汇率</span><input v-model="form.exchangeRate" type="number" min="0.000001" step="0.000001"></label>

              <label class="field span-3"><span>计划占股比</span><div class="unit-input"><input v-model="form.plannedShareholdingRatio" type="number" min="0" max="100" step="0.01"><em>%</em></div></label>
              <label class="field span-3"><span>项目总投资</span><div class="unit-input"><input v-model="form.projectTotalInvestment" type="number" min="0" step="0.01"><em>元</em></div></label>
              <div class="field span-3"><span>计划投资额</span><div class="readonly-amount" aria-live="polite">{{ formattedTotalFunding }} 元</div></div>
              <label class="field span-3"><span>预计收益率</span><div class="unit-input"><input v-model="form.expectedReturnRate" type="number" step="0.01"><em>%</em></div></label>
            </div>
          </section>

          <section class="section">
            <div class="section-heading"><h2>项目描述</h2><span>说明投资必要性、收益与风险</span></div>
            <div class="description-grid">
              <label class="description-field"><span>项目概述</span><textarea v-model.trim="form.projectOverview" maxlength="4000" placeholder="项目背景和投资的必要性"></textarea></label>
              <label class="description-field"><span>主要内容</span><textarea v-model.trim="form.mainContent" maxlength="4000" placeholder="项目的主要内容及其说明"></textarea></label>
              <label class="description-field"><span>所需资金及费用计划</span><textarea v-model.trim="form.fundAndCostPlan" maxlength="4000" placeholder="说明资金需求、费用构成及使用计划"></textarea></label>
              <label class="description-field"><span>预期收益</span><textarea v-model.trim="form.expectedReturns" maxlength="4000" placeholder="新增产能、销售收入、利润、投资收益率等"></textarea></label>
              <label class="description-field"><span>推进计划</span><textarea v-model.trim="form.promotionPlan" maxlength="4000" placeholder="说明项目推进阶段、关键节点及计划安排"></textarea></label>
              <label class="description-field"><span>投资风险及防控措施</span><textarea v-model.trim="form.riskControlMeasures" maxlength="4000" placeholder="说明主要风险、应对策略及防控措施"></textarea></label>
            </div>
          </section>

          <section class="section">
            <div class="section-heading"><h2>资金来源</h2><span>合计将自动计入计划投资额</span></div>
            <div class="funding-grid">
              <label v-for="field in fundingFields" :key="field.key" class="funding-field">
                <span>{{ field.label }}</span>
                <div class="unit-input"><input v-model="fundingSources[field.key]" type="number" min="0" step="0.01"><em>元</em></div>
              </label>
            </div>
            <div class="funding-total"><span>资金来源合计</span><strong>{{ formattedTotalFunding }} 元</strong></div>
          </section>

          <section class="section member-section">
            <div class="section-heading"><h2>项目组员</h2><span>点击行后可复制或删除</span></div>
            <div class="member-toolbar" role="toolbar" aria-label="项目组员操作">
              <button type="button" class="primary" @click="addMember">＋ 新建</button>
              <button type="button" @click="copySelectedMember">复制</button>
              <button type="button" @click="removeSelectedMember">删除</button>
              <button type="button" class="danger-text" @click="clearMembers">删除全部</button>
              <button type="button" disabled title="人员目录接入后启用">导入数据</button>
            </div>
            <div class="member-table-wrap">
              <table class="member-table">
                <thead><tr><th>序号</th><th>姓名</th><th>部门</th><th>职位</th><th>联系方式</th><th>项目角色</th><th>任务分工</th></tr></thead>
                <tbody>
                  <tr
                    v-for="(member, index) in members"
                    :key="member.id"
                    :class="{ selected: selectedMemberId === member.id }"
                    @click="selectedMemberId = member.id"
                    @focusin="selectedMemberId = member.id"
                  >
                    <td>{{ index + 1 }}</td>
                    <td><input v-model.trim="member.name" maxlength="100" :aria-label="`第 ${index + 1} 行姓名`"></td>
                    <td><input v-model.trim="member.department" maxlength="200" :aria-label="`第 ${index + 1} 行部门`"></td>
                    <td><input v-model.trim="member.position" maxlength="100" :aria-label="`第 ${index + 1} 行职位`"></td>
                    <td><input v-model.trim="member.contact" maxlength="100" :aria-label="`第 ${index + 1} 行联系方式`"></td>
                    <td><input v-model.trim="member.projectRole" maxlength="100" :aria-label="`第 ${index + 1} 行项目角色`"></td>
                    <td><input v-model.trim="member.taskAssignment" maxlength="1000" :aria-label="`第 ${index + 1} 行任务分工`"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </form>
      </article>
    </main>

    <footer class="action-bar">
      <button type="button" @click="saveDraft">保存待发</button>
      <button type="button" class="primary" @click="submitApplication">提交审批</button>
    </footer>
    <div class="toast" :class="[{ show: toast }, toastTone]" role="status" aria-live="polite">{{ toast }}</div>
  </div>
</template>

<style scoped>
:global(body:has(.project-application-shell)) {
  min-width: 0;
  color: #202a44;
  background:
    radial-gradient(circle at 7% -4%, rgba(103, 57, 223, .11), transparent 360px),
    radial-gradient(circle at 95% 8%, rgba(46, 103, 232, .09), transparent 420px),
    #f4f5f9;
}

.project-application-shell {
  min-height: 100%;
  --brand-navy: #1f2774;
  --brand-navy-deep: #10194f;
  --brand-green: #90be20;
  --primary: #315fd8;
  --primary-dark: #244bb8;
  --line: #dfe3ec;
  --field: #fffdf4;
  --muted: #758097;
}

.project-application-shell.is-standalone { min-height: 100vh; }

.project-app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 66px;
  padding: 0 32px;
  background: linear-gradient(105deg, var(--brand-navy-deep), var(--brand-navy) 45%, #172260);
  box-shadow: 0 4px 16px rgba(18, 25, 79, .2);
}

.project-app-header::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #6f38e8, #a44ef4 48%, #3d7bf0);
}

.brand { height: 100%; gap: 18px; }
.brand-logo { width: 116px; height: 42px; display: flex; align-items: center; }
.brand-logo img { display: block; width: 116px; height: auto; }
.brand-divider { width: 1px; height: 28px; background: rgba(255, 255, 255, .24); }
.product-identity, .user-copy { display: flex; flex-direction: column; gap: 4px; line-height: 1; }
.product-identity strong { font-size: 17px; letter-spacing: 1px; }
.product-identity span, .user-copy span { color: rgba(255, 255, 255, .62); font-size: 11px; }
.header-user { min-width: 178px; justify-content: flex-end; }
.user-copy { align-items: flex-end; }
.avatar { width: 36px; height: 36px; border: 1px solid rgba(255, 255, 255, .28); background: linear-gradient(145deg, rgba(255, 255, 255, .28), rgba(255, 255, 255, .1)); }

.workspace { padding: 18px 24px 96px; }
.toolbar, .document { width: min(1580px, calc(100vw - 48px)); }
.toolbar { min-height: 42px; margin-bottom: 12px; }
.breadcrumb { position: relative; padding-left: 20px; font-size: 13px; }
.breadcrumb::before { content: ""; position: absolute; left: 0; top: 50%; width: 8px; height: 8px; border: 3px solid var(--brand-green); border-radius: 50%; transform: translateY(-50%); box-shadow: 0 0 0 4px rgba(144, 190, 32, .12); }
.breadcrumb strong { color: var(--brand-navy); }
.status-chip { border: 1px solid #edda94; color: #8b630f; background: #fff8dc; }

.project-application-document { border: 1px solid rgba(31, 39, 116, .1); border-radius: 10px; box-shadow: 0 16px 42px rgba(31, 39, 116, .1); }
.project-application-title { position: relative; min-height: 104px; overflow: hidden; padding: 0 38px; background: radial-gradient(circle at 16% 120%, rgba(147, 79, 244, .78), transparent 260px), radial-gradient(circle at 82% -80%, rgba(63, 126, 255, .75), transparent 310px), linear-gradient(105deg, var(--brand-navy-deep), #202b7d 48%, #172260); }
.project-application-title::before, .project-application-title::after { content: ""; position: absolute; border: 1px solid rgba(255, 255, 255, .12); border-radius: 50%; }
.project-application-title::before { width: 190px; height: 190px; left: -68px; top: -126px; }
.project-application-title::after { width: 260px; height: 260px; right: -92px; bottom: -212px; }
.title-copy { position: relative; z-index: 1; grid-column: 2; text-align: center; }
.title-copy span { color: rgba(255, 255, 255, .56); font-size: 10px; letter-spacing: 3.2px; }
.title-copy h1 { margin: 8px 0 0; font-size: 28px; letter-spacing: 3px; text-shadow: 0 3px 16px rgba(4, 8, 35, .22); }
.project-application-title h1::before { content: none; }
.document-no { position: relative; z-index: 1; min-height: 42px; padding: 0 15px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 8px; background: rgba(255, 255, 255, .08); backdrop-filter: blur(8px); }

.document-body { padding: 18px 38px 34px; }
.application-meta-card { padding: 18px 20px 16px; border: 1px solid #e3e6ee; border-radius: 9px; background: linear-gradient(180deg, #fbfcff, #f7f8fb); }
.meta-form-grid { row-gap: 14px; }
.section { margin-top: 20px; }
.section-heading { height: 42px; margin-bottom: 16px; border-bottom: 1px solid #e4e7ee; }
.section-heading h2 { height: 42px; padding: 0 18px; color: var(--brand-navy); background: transparent; font-size: 17px; }
.section-heading h2::before { content: ""; width: 4px; height: 18px; margin-right: 12px; border-radius: 2px; background: linear-gradient(180deg, var(--brand-green), #6e9d13); box-shadow: 0 0 0 4px rgba(144, 190, 32, .1); }
.section-heading > span { color: var(--muted); }

.form-grid { gap: 14px 26px; }
.span-9 { grid-column: span 9; }
.field > span { min-width: 88px; color: #5b657a; }
.field input, .field select, .field textarea { border-color: #e5dfbd; border-radius: 6px; background: var(--field); }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #7995ea; background: #fff; box-shadow: 0 0 0 3px rgba(49, 95, 216, .12); }
.field input:disabled, .field select:disabled { color: #596276; background: #f1f2f5; border-color: #e0e3e8; }
.radio-box { border-color: #e5dfbd; border-radius: 6px; background: var(--field); }
.radio-box input { accent-color: var(--primary); }
.upload-area { border-color: #d6c878; border-radius: 6px; background: var(--field); }
.upload-area input { color: #4e5d75; }
.file-chip { align-items: center; gap: 7px; color: #425292; background: #eef1ff; }
.file-chip button { width: 18px; height: 18px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #7d4d5c; background: rgba(255, 255, 255, .72); }
.funding-warning { margin: 14px 0 0 94px; color: #d96b18; font-weight: 600; }
.readonly-amount { flex: 1; min-height: 42px; display: flex; align-items: center; padding: 0 12px; border: 1px solid #c8d3f5; border-radius: 6px; color: var(--brand-navy); background: #edf2ff; font-weight: 700; }

.description-grid { display: grid; gap: 12px; }
.description-field { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: start; }
.description-field > span { padding-top: 11px; color: #5b657a; text-align: right; }
.description-field textarea { min-height: 86px; padding: 10px 12px; border: 1px solid #e5dfbd; border-radius: 6px; outline: 0; background: var(--field); resize: vertical; line-height: 1.65; }
.description-field textarea:focus { border-color: #7995ea; background: #fff; box-shadow: 0 0 0 3px rgba(49, 95, 216, .12); }

.funding-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.funding-field { min-width: 0; padding: 0 10px 12px; border-right: 1px solid var(--line); background: #fafbfe; }
.funding-field:last-child { border-right: 0; }
.funding-field > span { min-height: 42px; display: flex; align-items: center; justify-content: center; color: #5b657a; text-align: center; }
.funding-field input { width: 100%; height: 40px; padding: 0 42px 0 10px; border: 1px solid #e5dfbd; border-radius: 6px; outline: 0; background: var(--field); }
.funding-field input:focus { border-color: #7995ea; background: #fff; box-shadow: 0 0 0 3px rgba(49, 95, 216, .12); }
.funding-total { display: flex; align-items: center; justify-content: flex-end; gap: 16px; padding: 12px 4px 0; color: #5b657a; }
.funding-total strong { color: var(--brand-navy); font-size: 18px; }

.member-toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.member-toolbar button { min-height: 36px; padding: 0 14px; border: 1px solid #c8cdda; border-radius: 6px; color: #3d4b5d; background: #fff; }
.member-toolbar button.primary { border-color: var(--primary); color: #fff; background: linear-gradient(100deg, var(--primary), #3977ed); }
.member-toolbar button.danger-text { color: #c84242; }
.member-toolbar button:disabled { cursor: not-allowed; opacity: .48; }
.member-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
.member-table { width: 100%; min-width: 1100px; border-collapse: collapse; }
.member-table th, .member-table td { padding: 7px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: center; }
.member-table th:last-child, .member-table td:last-child { border-right: 0; }
.member-table th { color: #5b657a; background: #f4f5f8; font-weight: 600; }
.member-table tbody tr:last-child td { border-bottom: 0; }
.member-table tbody tr.selected { background: #f1f4ff; }
.member-table td:first-child { width: 62px; color: var(--muted); }
.member-table input { width: 100%; height: 36px; padding: 0 9px; border: 1px solid #e5dfbd; border-radius: 5px; outline: 0; background: var(--field); }
.member-table input:focus { border-color: #7995ea; background: #fff; box-shadow: 0 0 0 3px rgba(49, 95, 216, .1); }

.action-bar { height: 68px; border-top-color: #e0e3eb; box-shadow: 0 -8px 28px rgba(31, 39, 116, .08); backdrop-filter: blur(10px); }
.action-bar button { border-color: #c8cdda; }
.action-bar button.primary { border-color: var(--primary); background: linear-gradient(100deg, var(--primary), #3977ed); box-shadow: 0 5px 14px rgba(49, 95, 216, .22); }
.toast { background: rgba(18, 25, 79, .95); }
.toast.error { background: rgba(161, 45, 45, .96); }
.toast.success { background: rgba(73, 111, 15, .96); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 1280px) {
  .form-grid { column-gap: 16px; }
  .field > span { min-width: 78px; }
  .funding-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .funding-field { border-bottom: 1px solid var(--line); }
  .funding-field:nth-child(3n) { border-right: 0; }
  .funding-field:nth-child(n + 4) { border-bottom: 0; }
}

@media (max-width: 1000px) {
  .project-app-header { padding: 0 18px; }
  .brand { gap: 12px; }
  .workspace { padding: 14px 14px 92px; }
  .toolbar, .document { width: 100%; }
  .project-application-title { padding: 0 24px; }
  .document-body { padding: 16px 24px 30px; }
  .span-3 { grid-column: span 6; }
  .span-6, .span-9 { grid-column: span 12; }
  .funding-warning { margin-left: 0; }
}

@media (max-width: 720px) {
  .project-app-header { height: 60px; }
  .brand-logo { width: 92px; }
  .brand-logo img { width: 92px; }
  .product-identity span, .user-copy { display: none; }
  .workspace { padding: 10px 8px 88px; }
  .toolbar { align-items: flex-start; gap: 8px; }
  .project-application-title { min-height: 92px; grid-template-columns: 1fr; justify-items: center; padding: 14px 16px; }
  .title-copy { grid-column: 1; }
  .title-copy h1 { font-size: 22px; }
  .document-no { grid-column: 1; justify-self: center; min-height: 34px; margin-top: 8px; }
  .document-body { padding: 12px 14px 26px; }
  .application-meta-card { padding: 14px 12px; }
  .span-3, .span-6, .span-9, .span-12 { grid-column: span 12; }
  .field { align-items: flex-start; flex-direction: column; gap: 6px; }
  .field > span { min-width: 0; text-align: left; }
  .field .unit-input, .field .radio-box, .field .upload-area, .readonly-amount { width: 100%; }
  .attachment-list { padding-left: 0; }
  .description-field { grid-template-columns: 1fr; gap: 6px; }
  .description-field > span { padding: 0; text-align: left; }
  .funding-grid { grid-template-columns: 1fr; }
  .funding-field { border-right: 0; border-bottom: 1px solid var(--line) !important; }
  .funding-field:last-child { border-bottom: 0 !important; }
  .action-bar button { min-width: 104px; padding: 0 14px; }
}
</style>
