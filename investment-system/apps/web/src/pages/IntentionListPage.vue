<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchIntentions } from '../api';
import { hasPermission } from '../auth';
import type { IntentionDetail } from '../types';

const mode = ref<'mine' | 'todo' | 'all'>('mine');
const items = ref<IntentionDetail[]>([]);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const statusLabels: Record<string, string> = { PENDING_SEND: '待发', IN_REVIEW: '审核中', APPROVED: '已通过', RETURNED: '已退回' };

async function load(next = mode.value, nextPage = page.value) {
  mode.value = next; page.value = nextPage; loading.value = true; error.value = '';
  try { const result = await fetchIntentions(next, nextPage, pageSize); items.value = result.items; total.value = result.total; }
  catch (value) { error.value = value instanceof Error ? value.message : '加载失败'; }
  finally { loading.value = false; }
}

onMounted(() => load());
</script>

<template>
  <section class="page-card">
    <div class="page-heading">
      <div><h1>投资意向</h1><p>查看本人发起的申请和待本人办理的审批。</p></div>
      <RouterLink v-if="hasPermission('investment.intention.create')" class="button primary" to="/intentions/new">新建投资意向</RouterLink>
    </div>
    <div class="list-toolbar">
      <div class="tabs-inline">
        <button :class="{ active: mode === 'mine' }" @click="load('mine', 1)">我的发起</button>
        <button v-if="hasPermission('investment.intention.approve_department') || hasPermission('investment.intention.approve_supervising')" :class="{ active: mode === 'todo' }" @click="load('todo', 1)">我的待办</button>
        <button v-if="hasPermission('investment.intention.read_all')" :class="{ active: mode === 'all' }" @click="load('all', 1)">全部</button>
      </div>
    </div>
    <div v-if="error" class="form-error">{{ error }}</div>
    <table class="data-table">
      <thead><tr><th>单据编号</th><th>项目名称</th><th>申请人</th><th>投资主体</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-if="!loading && !items.length"><td colspan="7" class="empty-cell">暂无数据</td></tr>
        <tr v-for="item in items" :key="item.id">
          <td>{{ item.applicationNo }}</td><td>{{ item.projectName || '—' }}</td><td>{{ item.applicantName || '—' }}</td>
          <td>{{ item.investmentEntityName || '—' }}</td><td><span class="status-pill">{{ statusLabels[item.status] }}</span></td>
          <td>{{ item.updatedAt }}</td><td><RouterLink :to="`/intentions/${item.id}`">查看/办理</RouterLink></td>
        </tr>
      </tbody>
    </table>
    <div class="pagination"><span>共 {{ total }} 条</span><button :disabled="page <= 1 || loading" @click="load(mode, page - 1)">上一页</button><span>{{ page }} / {{ totalPages }}</span><button :disabled="page >= totalPages || loading" @click="load(mode, page + 1)">下一页</button></div>
  </section>
</template>
