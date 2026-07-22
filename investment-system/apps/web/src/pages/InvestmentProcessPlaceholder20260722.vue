<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { findInvestmentProcess } from '../investmentNavigation20260722';

const route = useRoute();
const process = computed(() => findInvestmentProcess(String(route.params.processKey ?? '')));
</script>

<template>
  <section class="process-placeholder page-card">
    <div class="process-placeholder-icon">{{ process?.stage.index ?? '—' }}</div>
    <span class="process-placeholder-stage">{{ process?.stage.title ?? '投资流程' }}</span>
    <h1>{{ process?.item.title ?? '流程功能' }}</h1>
    <p>{{ process?.item.description ?? '该流程功能尚未配置。' }}</p>
    <div class="process-placeholder-status">流程页面正在建设中</div>
    <div class="process-placeholder-actions">
      <RouterLink class="button primary" to="/portal">返回空间首页</RouterLink>
      <RouterLink class="button" to="/intentions">进入已上线流程</RouterLink>
    </div>
  </section>
</template>
