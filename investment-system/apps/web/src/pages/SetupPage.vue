<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { initializeSystem } from '../auth';

const router = useRouter();
const busy = ref(false);
const error = ref('');
const form = reactive({ employeeNo: '', username: '', displayName: '', password: '', confirmPassword: '' });

async function submit() {
  if (form.password !== form.confirmPassword) { error.value = '两次输入的密码不一致'; return; }
  busy.value = true; error.value = '';
  try {
    await initializeSystem({
      employeeNo: form.employeeNo,
      username: form.username,
      displayName: form.displayName,
      password: form.password
    });
    await router.push('/');
  } catch (value) {
    error.value = value instanceof Error ? value.message : '初始化失败';
  } finally { busy.value = false; }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <img class="auth-logo" src="/assets/seeyon_official_logo_color_20260722_c7a1.svg" alt="致远互联">
      <h1>初始化投资管理系统</h1>
      <p>仅允许在服务器本机首次执行。管理员可登录后继续创建组织和岗位。</p>
      <label>人员编号<input v-model="form.employeeNo" required maxlength="64" autocomplete="off"></label>
      <label>管理员姓名<input v-model="form.displayName" required maxlength="100" autocomplete="name"></label>
      <label>登录名<input v-model="form.username" required maxlength="100" autocomplete="username"></label>
      <label>管理员密码<input v-model="form.password" required type="password" maxlength="128" autocomplete="new-password"></label>
      <label>确认密码<input v-model="form.confirmPassword" required type="password" maxlength="128" autocomplete="new-password"></label>
      <small>密码至少12位，并包含大小写字母、数字、特殊字符中的至少三类。</small>
      <div v-if="error" class="form-error">{{ error }}</div>
      <button class="primary" :disabled="busy">{{ busy ? '正在初始化…' : '完成初始化' }}</button>
    </form>
  </main>
</template>
