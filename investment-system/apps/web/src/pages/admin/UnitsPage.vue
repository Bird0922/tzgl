<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { apiRequest } from '../../api';
import { hasPermission } from '../../auth';
import type { Paged, UnitItem } from '../../types';

const items = ref<UnitItem[]>([]); const error = ref(''); const busy = ref(false);
const empty = () => ({ id: '', parentId: '', code: '', name: '', status: 'ACTIVE', sortOrder: 0, version: 0 });
const form = reactive(empty());
const treeItems = computed(() => {
  const children = new Map<string, UnitItem[]>();
  for (const item of items.value) {
    const key = item.parentId && items.value.some(parent => parent.id === item.parentId) ? item.parentId : '';
    children.set(key, [...(children.get(key) ?? []), item]);
  }
  const result: Array<UnitItem & { depth: number }> = [];
  const visit = (parentId: string, depth: number) => {
    for (const item of children.get(parentId) ?? []) {
      result.push({ ...item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit('', 0);
  return result;
});

async function load() { try { items.value = (await apiRequest<Paged<UnitItem>>('/admin/units?pageSize=100')).items; } catch (e) { error.value = e instanceof Error ? e.message : '加载失败'; } }
function reset() { Object.assign(form, empty()); }
function edit(item: UnitItem) { Object.assign(form, { ...item, parentId: item.parentId ?? '' }); }
async function save() {
  busy.value = true; error.value = '';
  try {
    const body = { parentId: form.parentId || null, code: form.code, name: form.name, status: form.status, sortOrder: form.sortOrder, ...(form.id ? { version: form.version } : {}) };
    await apiRequest(form.id ? `/admin/units/${form.id}` : '/admin/units', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    reset(); await load();
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; } finally { busy.value = false; }
}
async function remove(item: UnitItem) { if (!confirm(`确认删除单位“${item.name}”？`)) return; try { await apiRequest(`/admin/units/${item.id}`, { method: 'DELETE' }); await load(); } catch (e) { error.value = e instanceof Error ? e.message : '删除失败'; } }
onMounted(load);
</script>
<template><section class="page-card"><div class="page-heading"><div><h1>单位管理</h1><p>维护多级单位树，存在下级或业务引用时不能删除。</p></div><button v-if="hasPermission('admin.unit.manage')" @click="reset">新建单位</button></div><div v-if="error" class="form-error">{{ error }}</div><div class="admin-layout"><table class="data-table"><thead><tr><th>单位编码</th><th>单位名称</th><th>上级单位</th><th>状态</th><th>排序</th><th>操作</th></tr></thead><tbody><tr v-for="item in treeItems" :key="item.id"><td>{{ item.code }}</td><td><span class="tree-name" :style="{ paddingLeft: `${item.depth * 22}px` }"><span v-if="item.depth" aria-hidden="true">└</span>{{ item.name }}</span></td><td>{{ items.find(x => x.id === item.parentId)?.name || '—' }}</td><td>{{ item.status === 'ACTIVE' ? '启用' : '停用' }}</td><td>{{ item.sortOrder }}</td><td><button class="link-button" @click="edit(item)">编辑</button><button v-if="hasPermission('admin.unit.manage')" class="link-button danger-text" @click="remove(item)">删除</button></td></tr></tbody></table><form v-if="hasPermission('admin.unit.manage')" class="admin-form side-form" @submit.prevent="save"><h2>{{ form.id ? '编辑单位' : '新建单位' }}</h2><label>单位编码<input v-model="form.code" required maxlength="64"></label><label>单位名称<input v-model="form.name" required maxlength="200"></label><label>上级单位<select v-model="form.parentId"><option value="">根单位</option><option v-for="item in treeItems.filter(x => x.id !== form.id)" :key="item.id" :value="item.id">{{ '　'.repeat(item.depth) }}{{ item.name }}</option></select></label><label>状态<select v-model="form.status"><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label><label>排序号<input v-model.number="form.sortOrder" type="number" min="0"></label><div class="form-actions"><button type="button" @click="reset">取消</button><button class="primary" :disabled="busy">保存</button></div></form></div></section></template>
