<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { authState, hasPermission, logout } from './auth';

const route = useRoute();
const router = useRouter();
const publicPage = computed(() => Boolean(route.meta.public));
const showAdmin = computed(() => hasPermission('admin.access'));
const showInvestment = computed(() => hasPermission('investment.intention.read') || hasPermission('investment.intention.read_all'));

async function signOut() {
  await logout();
  await router.push('/login');
}
</script>

<template>
  <RouterView v-if="publicPage" />
  <div v-else class="app-shell">
    <header class="app-header">
      <div class="brand">
        <img class="seeyon-logo seeyon-logo-white" src="/assets/seeyon_official_logo_white_20260722_c7a1.svg" alt="致远互联">
        <span>投资管理系统</span>
      </div>
      <div class="header-user">
        <span class="avatar">{{ authState.user?.name.slice(0, 1) }}</span>
        <span>{{ authState.user?.name }}</span>
        <button type="button" class="header-link" @click="signOut">退出</button>
      </div>
    </header>
    <div class="shell-body">
      <aside class="sidebar">
        <template v-if="showInvestment">
          <div class="menu-title">投资管理</div>
          <RouterLink to="/intentions">投资意向</RouterLink>
        </template>
        <template v-if="showAdmin">
          <div class="menu-title">后台管理</div>
          <RouterLink v-if="hasPermission('admin.unit.read')" to="/admin/units">单位管理</RouterLink>
          <RouterLink v-if="hasPermission('admin.department.read')" to="/admin/departments">部门管理</RouterLink>
          <RouterLink v-if="hasPermission('admin.position.read')" to="/admin/positions">岗位管理</RouterLink>
          <RouterLink v-if="hasPermission('admin.role.read')" to="/admin/roles">角色管理</RouterLink>
          <RouterLink v-if="hasPermission('admin.user.read')" to="/admin/users">人员管理</RouterLink>
        </template>
      </aside>
      <main class="shell-content"><RouterView /></main>
    </div>
  </div>
</template>
