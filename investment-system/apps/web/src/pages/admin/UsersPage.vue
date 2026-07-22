<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { apiRequest } from '../../api';
import { hasPermission } from '../../auth';
import type { DepartmentItem, Paged, PositionItem, RoleItem, UnitItem, UserItem } from '../../types';

const items = ref<UserItem[]>([]);
const units = ref<UnitItem[]>([]);
const departments = ref<DepartmentItem[]>([]);
const positions = ref<PositionItem[]>([]);
const roles = ref<RoleItem[]>([]);
const error = ref('');
const busy = ref(false);
const query = ref('');
const filterUnitId = ref('');
const filterDepartmentId = ref('');
const filterStatus = ref('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);

const empty = () => ({
  id: '', employeeNo: '', username: '', displayName: '', mobile: '', email: '',
  unitId: '', departmentId: '', positionId: '', status: 'ACTIVE',
  roleIds: [] as string[], password: '', version: 0
});
const form = reactive(empty());
const availableDepartments = computed(() => departments.value.filter(item => item.unitId === form.unitId));
const availablePositions = computed(() => positions.value.filter(item => item.departmentId === form.departmentId));
const filterDepartments = computed(() => departments.value.filter(item => !filterUnitId.value || item.unitId === filterUnitId.value));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

async function loadUsers() {
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
  if (query.value.trim()) params.set('q', query.value.trim());
  if (filterUnitId.value) params.set('unitId', filterUnitId.value);
  if (filterDepartmentId.value) params.set('departmentId', filterDepartmentId.value);
  if (filterStatus.value) params.set('status', filterStatus.value);
  const result = await apiRequest<Paged<UserItem>>(`/admin/users?${params}`);
  items.value = result.items;
  total.value = result.total;
}

async function load() {
  error.value = '';
  try {
    const [unitList, departmentList, positionList, roleList] = await Promise.all([
      apiRequest<Paged<UnitItem>>('/admin/units?status=ACTIVE&pageSize=100'),
      apiRequest<Paged<DepartmentItem>>('/admin/departments?status=ACTIVE&pageSize=100'),
      apiRequest<Paged<PositionItem>>('/admin/positions?status=ACTIVE&pageSize=100'),
      apiRequest<Paged<RoleItem>>('/admin/roles?pageSize=100&status=ACTIVE')
    ]);
    units.value = unitList.items;
    departments.value = departmentList.items;
    positions.value = positionList.items;
    roles.value = roleList.items;
    await loadUsers();
  } catch (value) {
    error.value = value instanceof Error ? value.message : '加载失败';
  }
}

function applyFilters() {
  page.value = 1;
  void loadUsers().catch(value => { error.value = value instanceof Error ? value.message : '加载失败'; });
}

function reset() { Object.assign(form, empty()); }

function edit(item: UserItem) {
  Object.assign(form, {
    id: item.id,
    employeeNo: item.employeeNo,
    username: item.username,
    displayName: item.displayName,
    mobile: item.mobile ?? '',
    email: item.email ?? '',
    unitId: item.unitId ?? '',
    departmentId: item.departmentId ?? '',
    positionId: item.positionId ?? '',
    status: item.status,
    roleIds: [...item.roleIds],
    password: '',
    version: item.version
  });
}

async function save() {
  busy.value = true;
  error.value = '';
  try {
    const body = {
      employeeNo: form.employeeNo,
      username: form.username,
      displayName: form.displayName,
      mobile: form.mobile || null,
      email: form.email || null,
      departmentId: form.departmentId,
      positionId: form.positionId,
      status: form.status,
      roleIds: form.roleIds,
      ...(!form.id ? { password: form.password } : {}),
      ...(form.id ? { version: form.version } : {})
    };
    await apiRequest(form.id ? `/admin/users/${form.id}` : '/admin/users', {
      method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body)
    });
    reset();
    await loadUsers();
  } catch (value) {
    error.value = value instanceof Error ? value.message : '保存失败';
  } finally {
    busy.value = false;
  }
}

async function resetPassword(item: UserItem) {
  const password = prompt(`请输入“${item.displayName}”的新临时密码`);
  if (!password) return;
  try {
    await apiRequest(`/admin/users/${item.id}/reset-password`, {
      method: 'POST', body: JSON.stringify({ password })
    });
    alert('密码已重置，用户下次登录必须修改密码。');
  } catch (value) {
    error.value = value instanceof Error ? value.message : '重置失败';
  }
}

async function remove(item: UserItem) {
  if (!confirm(`确认删除人员“${item.displayName}”？`)) return;
  try {
    await apiRequest(`/admin/users/${item.id}`, { method: 'DELETE' });
    if (items.value.length === 1 && page.value > 1) page.value -= 1;
    await loadUsers();
  } catch (value) {
    error.value = value instanceof Error ? value.message : '删除失败';
  }
}

async function changePage(next: number) {
  page.value = next;
  try { await loadUsers(); }
  catch (value) { error.value = value instanceof Error ? value.message : '加载失败'; }
}

onMounted(load);
</script>

<template>
  <section class="page-card">
    <div class="page-heading">
      <div><h1>人员管理</h1><p>人员即登录账号，必须归属一个部门和岗位，可分配多个角色。</p></div>
      <button v-if="hasPermission('admin.user.manage')" @click="reset">新建人员</button>
    </div>
    <form class="filter-toolbar" @submit.prevent="applyFilters">
      <label>搜索<input v-model="query" maxlength="100" placeholder="编号、姓名或登录名"></label>
      <label>单位<select v-model="filterUnitId" @change="filterDepartmentId = ''"><option value="">全部单位</option><option v-for="unit in units" :key="unit.id" :value="unit.id">{{ unit.name }}</option></select></label>
      <label>部门<select v-model="filterDepartmentId"><option value="">全部部门</option><option v-for="department in filterDepartments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label>
      <label>状态<select v-model="filterStatus"><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>
      <button class="primary">查询</button>
    </form>
    <div v-if="error" class="form-error">{{ error }}</div>
    <div class="admin-layout">
      <div class="table-panel">
        <table class="data-table">
          <thead><tr><th>人员编号</th><th>姓名</th><th>登录名</th><th>单位/部门</th><th>岗位</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-if="!items.length"><td colspan="8" class="empty-cell">暂无人员</td></tr>
            <tr v-for="item in items" :key="item.id">
              <td>{{ item.employeeNo }}</td><td>{{ item.displayName }}</td><td>{{ item.username }}</td>
              <td>{{ item.unitName ? `${item.unitName} / ${item.departmentName}` : '未配置' }}</td>
              <td>{{ item.positionName || '未配置' }}</td><td>{{ item.roles.map(role => role.name).join('、') || '—' }}</td>
              <td>{{ item.status === 'ACTIVE' ? '启用' : '停用' }}</td>
              <td><button class="link-button" @click="edit(item)">编辑</button><button v-if="hasPermission('admin.user.manage')" class="link-button" @click="resetPassword(item)">重置密码</button><button v-if="hasPermission('admin.user.manage')" class="link-button danger-text" @click="remove(item)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div class="pagination"><span>共 {{ total }} 条</span><button :disabled="page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ totalPages }}</span><button :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button></div>
      </div>
      <form v-if="hasPermission('admin.user.manage')" class="admin-form side-form wide-side-form" @submit.prevent="save">
        <h2>{{ form.id ? '编辑人员' : '新建人员' }}</h2>
        <div class="two-column-form">
          <label>人员编号<input v-model="form.employeeNo" required maxlength="64"></label>
          <label>人员姓名<input v-model="form.displayName" required maxlength="100"></label>
          <label>登录名<input v-model="form.username" required maxlength="100"></label>
          <label v-if="!form.id">初始密码<input v-model="form.password" required type="password" minlength="12" maxlength="128" autocomplete="new-password"></label>
          <label>手机号码<input v-model="form.mobile" maxlength="32"></label>
          <label>电子邮箱<input v-model="form.email" type="email" maxlength="200"></label>
          <label>单位<select v-model="form.unitId" required @change="form.departmentId = ''; form.positionId = ''"><option value="">请选择</option><option v-for="unit in units" :key="unit.id" :value="unit.id">{{ unit.name }}</option></select></label>
          <label>部门<select v-model="form.departmentId" required @change="form.positionId = ''"><option value="">请选择</option><option v-for="department in availableDepartments" :key="department.id" :value="department.id">{{ department.name }}</option></select></label>
          <label>岗位<select v-model="form.positionId" required><option value="">请选择</option><option v-for="position in availablePositions" :key="position.id" :value="position.id">{{ position.name }}</option></select></label>
          <label>状态<select v-model="form.status"><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>
        </div>
        <fieldset><legend>角色</legend><label v-for="role in roles" :key="role.id" class="check-row"><input v-model="form.roleIds" type="checkbox" :value="role.id"><span>{{ role.name }}</span></label></fieldset>
        <div class="form-actions"><button type="button" @click="reset">取消</button><button class="primary" :disabled="busy">保存</button></div>
      </form>
    </div>
  </section>
</template>
