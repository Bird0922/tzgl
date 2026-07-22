<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { authState, hasPermission, logout } from './auth';
import {
  findInvestmentProcess,
  investmentStageMenus,
  type InvestmentProcessMenuItem
} from './investmentNavigation20260722';

const route = useRoute();
const router = useRouter();
const publicPage = computed(() => Boolean(route.meta.public));
const showAdmin = computed(() => hasPermission('admin.access'));
const adminPage = computed(() => route.path.startsWith('/admin/'));
const activeStage = computed(() => {
  if (route.meta.stage) return String(route.meta.stage);
  const processKey = String(route.params.processKey ?? '');
  return processKey ? findInvestmentProcess(processKey)?.stage.key ?? '' : '';
});
const adminEntryRoute = computed(() => [
  ['admin.unit.read', '/admin/units'],
  ['admin.department.read', '/admin/departments'],
  ['admin.position.read', '/admin/positions'],
  ['admin.role.read', '/admin/roles'],
  ['admin.user.read', '/admin/users']
].find(([permission]) => hasPermission(permission))?.[1] ?? '/no-access');

function canOpen(item: InvestmentProcessMenuItem) {
  return !item.permissions?.length || item.permissions.some(permission => hasPermission(permission));
}

async function signOut() {
  await logout();
  await router.push('/login');
}
</script>

<template>
  <RouterView v-if="publicPage" />
  <div v-else class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/portal" aria-label="返回投资管理空间首页">
        <span class="brand-logo">
          <img src="/assets/seeyon_official_logo_white_20260722_c7a1.svg" alt="致远互联">
        </span>
        <span class="brand-divider" aria-hidden="true"></span>
        <span class="product-identity">
          <strong>投资管理系统</strong>
          <span>协同运营管理平台</span>
        </span>
      </RouterLink>
      <div class="header-actions">
        <RouterLink v-if="showAdmin" class="admin-entry" :to="adminEntryRoute">后台管理</RouterLink>
        <div class="header-user">
          <span class="user-copy">
            <strong>{{ authState.user?.name }}</strong>
            <span>投资管理</span>
          </span>
          <span class="avatar">{{ authState.user?.name.slice(0, 1) }}</span>
          <button type="button" class="header-link" @click="signOut">退出</button>
        </div>
      </div>
    </header>
    <nav class="global-nav" aria-label="投资业务一级菜单">
      <div class="global-nav-inner">
        <RouterLink class="portal-nav-link" to="/portal">空间首页</RouterLink>
        <div v-for="stage in investmentStageMenus" :key="stage.key" class="nav-group">
          <button type="button" class="primary-menu" :class="{ active: activeStage === stage.key }" aria-haspopup="true">
            {{ stage.title }}<span aria-hidden="true">⌄</span>
          </button>
          <div class="submenu-panel">
            <div class="submenu-heading"><strong>{{ stage.title }}</strong><span>{{ stage.description }}</span></div>
            <template v-for="item in stage.items" :key="item.key">
              <RouterLink v-if="canOpen(item)" :to="item.path" class="submenu-link">
                <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
                <em :class="item.status">{{ item.status === 'available' ? '已上线' : '建设中' }}</em>
              </RouterLink>
              <span v-else class="submenu-link disabled" aria-disabled="true">
                <span><strong>{{ item.title }}</strong><small>当前账号无此功能权限</small></span>
                <em>无权限</em>
              </span>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <div class="shell-body" :class="{ 'admin-shell-body': adminPage }">
      <aside v-if="adminPage" class="sidebar">
        <div class="menu-title">后台管理</div>
        <RouterLink v-if="hasPermission('admin.unit.read')" to="/admin/units">单位管理</RouterLink>
        <RouterLink v-if="hasPermission('admin.department.read')" to="/admin/departments">部门管理</RouterLink>
        <RouterLink v-if="hasPermission('admin.position.read')" to="/admin/positions">岗位管理</RouterLink>
        <RouterLink v-if="hasPermission('admin.role.read')" to="/admin/roles">角色管理</RouterLink>
        <RouterLink v-if="hasPermission('admin.user.read')" to="/admin/users">人员管理</RouterLink>
      </aside>
      <main class="shell-content" :class="{ 'portal-content': route.path === '/portal' }"><RouterView /></main>
    </div>
  </div>
</template>
