<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { changePassword } from '../auth';

const router = useRouter();
const busy = ref(false);
const error = ref('');
const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' });

async function submit() {
  if (form.newPassword !== form.confirmPassword) { error.value = '两次输入的新密码不一致'; return; }
  busy.value = true; error.value = '';
  try {
    await changePassword(form.currentPassword, form.newPassword);
    await router.push('/login');
  } catch (value) {
    error.value = value instanceof Error ? value.message : '修改密码失败';
  } finally { busy.value = false; }
}
</script>

<template>
  <section class="page-card narrow-card">
    <div class="page-heading"><div><h1>修改初始密码</h1><p>修改成功后需要重新登录。</p></div></div>
    <form class="admin-form" @submit.prevent="submit">
      <label>当前密码<input v-model="form.currentPassword" type="password" required maxlength="128" autocomplete="current-password"></label>
      <label>新密码<input v-model="form.newPassword" type="password" required maxlength="128" autocomplete="new-password"></label>
      <label>确认新密码<input v-model="form.confirmPassword" type="password" required maxlength="128" autocomplete="new-password"></label>
      <small>密码至少12位，并包含大小写字母、数字、特殊字符中的至少三类。</small>
      <div v-if="error" class="form-error">{{ error }}</div>
      <div class="form-actions"><button class="primary" :disabled="busy">保存新密码</button></div>
    </form>
  </section>
</template>
