import { createRouter, createWebHistory } from 'vue-router';
import { authState, hasPermission, loadSession, loadSetupStatus } from './auth';
import SetupPage from './pages/SetupPage.vue';
import LoginPage from './pages/LoginPage.vue';
import ChangePasswordPage from './pages/ChangePasswordPage.vue';
import NoAccessPage from './pages/NoAccessPage.vue';
import IntentionListPage from './pages/IntentionListPage.vue';
import IntentionFormPage from './pages/IntentionFormPage.vue';
import GroupDecisionApplicationPage from './GroupDecisionApplication20260722_125218.vue';
import UnitsPage from './pages/admin/UnitsPage.vue';
import DepartmentsPage from './pages/admin/DepartmentsPage.vue';
import PositionsPage from './pages/admin/PositionsPage.vue';
import RolesPage from './pages/admin/RolesPage.vue';
import UsersPage from './pages/admin/UsersPage.vue';

declare module 'vue-router' {
  interface RouteMeta { public?: boolean; permission?: string; anyPermission?: string[] }
}

function defaultRoute() {
  if (hasPermission('investment.intention.read') || hasPermission('investment.intention.read_all')) return '/intentions';
  if (hasPermission('investment.group_decision.read') || hasPermission('investment.group_decision.read_all')) return '/group-decisions/new';
  const adminRoutes: Array<[string, string]> = [
    ['admin.unit.read', '/admin/units'],
    ['admin.department.read', '/admin/departments'],
    ['admin.position.read', '/admin/positions'],
    ['admin.role.read', '/admin/roles'],
    ['admin.user.read', '/admin/users']
  ];
  return adminRoutes.find(([permission]) => hasPermission(permission))?.[1] ?? '/no-access';
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup', component: SetupPage, meta: { public: true } },
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/change-password', component: ChangePasswordPage },
    { path: '/', component: NoAccessPage },
    { path: '/no-access', component: NoAccessPage },
    { path: '/intentions', component: IntentionListPage, meta: { anyPermission: ['investment.intention.read', 'investment.intention.read_all'] } },
    { path: '/intentions/new', component: IntentionFormPage, meta: { permission: 'investment.intention.create' } },
    { path: '/intentions/:id', component: IntentionFormPage, meta: { anyPermission: ['investment.intention.read', 'investment.intention.read_all'] } },
    { path: '/group-decisions/new', component: GroupDecisionApplicationPage, meta: { permission: 'investment.group_decision.create' } },
    { path: '/group-decisions/:id', component: GroupDecisionApplicationPage, meta: { anyPermission: ['investment.group_decision.read', 'investment.group_decision.read_all'] } },
    { path: '/admin/units', component: UnitsPage, meta: { permission: 'admin.unit.read' } },
    { path: '/admin/departments', component: DepartmentsPage, meta: { permission: 'admin.department.read' } },
    { path: '/admin/positions', component: PositionsPage, meta: { permission: 'admin.position.read' } },
    { path: '/admin/roles', component: RolesPage, meta: { permission: 'admin.role.read' } },
    { path: '/admin/users', component: UsersPage, meta: { permission: 'admin.user.read' } }
  ]
});

router.beforeEach(async to => {
  if (authState.initialized === null) await loadSetupStatus();
  if (!authState.initialized) return to.path === '/setup' ? true : '/setup';
  if (to.path === '/setup') return '/login';
  if (!authState.ready) await loadSession();
  if (!authState.user) return to.path === '/login' ? true : '/login';
  if (to.path === '/login') return defaultRoute();
  if (authState.user.mustChangePassword && to.path !== '/change-password') return '/change-password';
  if (!authState.user.mustChangePassword && to.path === '/change-password') return defaultRoute();
  if (to.path === '/') return defaultRoute();
  if (to.meta.permission && !hasPermission(to.meta.permission)) return defaultRoute();
  if (to.meta.anyPermission && !to.meta.anyPermission.some(permission => hasPermission(permission))) return defaultRoute();
  return true;
});
