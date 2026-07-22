<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { authState, login } from '../auth';

const router = useRouter();
const busy = ref(false);
const error = ref('');
const form = reactive({ username: '', password: '' });

async function submit() {
  busy.value = true; error.value = '';
  try {
    await login(form.username, form.password);
    await router.push(authState.user?.mustChangePassword ? '/change-password' : '/');
  } catch (value) {
    error.value = value instanceof Error ? value.message : '登录失败';
  } finally { busy.value = false; }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <img class="auth-logo" src="/assets/seeyon_official_logo_color_20260722_c7a1.svg" alt="致远互联">
      <h1>投资管理系统</h1>
      <p>请使用管理员创建的人员账号登录</p>
      <label>登录名<input v-model="form.username" required maxlength="100" autocomplete="username"></label>
      <label>密码<input v-model="form.password" required type="password" maxlength="128" autocomplete="current-password"></label>
      <div v-if="error" class="form-error">{{ error }}</div>
      <button class="primary" :disabled="busy">{{ busy ? '正在登录…' : '登录' }}</button>
    </form>
  </main>
</template>
