<script setup lang="ts">
import { computed } from 'vue';
import { authState, hasPermission } from '../auth';
import { investmentStageMenus, type InvestmentProcessMenuItem } from '../investmentNavigation20260722';

const canCreateIntention = computed(() => hasPermission('investment.intention.create'));
const canReadIntentions = computed(() => hasPermission('investment.intention.read') || hasPermission('investment.intention.read_all'));
const canUseAdmin = computed(() => hasPermission('admin.access'));

function canOpen(item: InvestmentProcessMenuItem) {
  return !item.permissions?.length || item.permissions.some(permission => hasPermission(permission));
}
</script>

<template>
  <div class="portal-page">
    <section class="portal-hero">
      <div class="portal-hero-copy">
        <span class="portal-kicker">INVESTMENT COLLABORATION SPACE</span>
        <h1>投资全生命周期协同管理空间</h1>
        <p>围绕登记立项、调查论证、投资决策和组织实施，统一流程入口与业务办理体验。</p>
        <div class="portal-hero-actions">
          <RouterLink v-if="canCreateIntention" class="portal-primary-action" to="/intentions/new">发起股权投资意向</RouterLink>
          <RouterLink v-if="canReadIntentions" class="portal-secondary-action" to="/intentions">查看投资意向台账</RouterLink>
        </div>
      </div>
      <div class="portal-welcome-card">
        <span>欢迎进入</span>
        <strong>{{ authState.user?.name }}</strong>
        <p>投资管理系统 · 协同运营管理平台</p>
      </div>
    </section>

    <div class="portal-main-grid">
      <section class="portal-lifecycle-panel">
        <div class="portal-section-heading">
          <div><span>PROCESS CENTER</span><h2>投资流程中心</h2></div>
          <p>按投资业务阶段进入对应流程功能</p>
        </div>
        <div class="lifecycle-grid">
          <article v-for="stage in investmentStageMenus" :key="stage.key" class="lifecycle-card">
            <header>
              <span class="lifecycle-index">{{ stage.index }}</span>
              <div><h3>{{ stage.title }}</h3><p>{{ stage.description }}</p></div>
            </header>
            <div class="lifecycle-links">
              <template v-for="item in stage.items" :key="item.key">
                <RouterLink v-if="canOpen(item)" :to="item.path" class="lifecycle-link">
                  <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
                  <em :class="item.status">{{ item.status === 'available' ? '已上线' : '建设中' }}</em>
                </RouterLink>
                <span v-else class="lifecycle-link disabled" aria-disabled="true">
                  <span><strong>{{ item.title }}</strong><small>当前账号无此功能权限</small></span>
                  <em>无权限</em>
                </span>
              </template>
            </div>
          </article>
        </div>
      </section>

      <aside class="portal-side-column">
        <section class="portal-side-card">
          <div class="portal-side-title"><span class="side-title-mark"></span><h2>我的工作台</h2></div>
          <RouterLink v-if="canReadIntentions" class="workbench-entry" to="/intentions">
            <span class="workbench-icon">意</span>
            <span><strong>投资意向</strong><small>我的发起、我的待办和全部台账</small></span>
            <em>进入</em>
          </RouterLink>
          <div v-else class="portal-empty">当前账号暂无投资流程权限</div>
        </section>

        <section class="portal-side-card">
          <div class="portal-side-title"><span class="side-title-mark green"></span><h2>空间说明</h2></div>
          <ul class="portal-notices">
            <li><span>01</span>股权投资意向登记和投资意向台账已上线。</li>
            <li><span>02</span>其他流程入口已按投资阶段预留。</li>
            <li><span>03</span>流程功能上线后直接替换建设中页面。</li>
          </ul>
          <RouterLink v-if="canUseAdmin" class="portal-admin-link" to="/admin/units">进入后台管理</RouterLink>
        </section>
      </aside>
    </div>
  </div>
</template>
