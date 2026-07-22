import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth-service.js';
import { GroupDecisionApplicationService } from './group-decision-application-service-20260722.js';
import { AppError, type GroupDecisionApplicationInput } from './types.js';
import { objectBody, optionalText, pagination, positiveInteger, requiredId } from './validation.js';

function canReadAll(permissions: string[]): boolean {
  return permissions.includes('investment.group_decision.read_all');
}

function parseInput(value: unknown, requireVersion: boolean): GroupDecisionApplicationInput {
  const body = objectBody(value);
  const majorProject = body.majorProject;
  if (majorProject !== undefined && majorProject !== null && typeof majorProject !== 'boolean') {
    throw new AppError('重大项目格式无效', 400, 'VALIDATION_ERROR');
  }
  return {
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined,
    applicationDate: body.applicationDate as string | null | undefined,
    applicationYear: body.applicationYear as string | number | null | undefined,
    projectName: body.projectName as string | null | undefined,
    projectCode: body.projectCode as string | null | undefined,
    projectLeaderUserId: body.projectLeaderUserId as string | null | undefined,
    plannedStartDate: body.plannedStartDate as string | null | undefined,
    plannedEndDate: body.plannedEndDate as string | null | undefined,
    investmentEntityId: body.investmentEntityId as string | null | undefined,
    investmentDirection: body.investmentDirection as string | null | undefined,
    domesticOverseas: body.domesticOverseas as string | null | undefined,
    investmentMethod: body.investmentMethod as string | null | undefined,
    majorProject: majorProject as boolean | null | undefined,
    currencyCode: body.currencyCode as string | null | undefined,
    projectTotalInvestment: body.projectTotalInvestment as string | number | null | undefined,
    plannedInvestment: body.plannedInvestment as string | number | null | undefined,
    expectedReturnRate: body.expectedReturnRate as string | number | null | undefined,
    fundingCompanyOwned: body.fundingCompanyOwned as string | number | null | undefined,
    fundingGroupRequested: body.fundingGroupRequested as string | number | null | undefined,
    fundingSpecialBond: body.fundingSpecialBond as string | number | null | undefined,
    fundingGovernment: body.fundingGovernment as string | number | null | undefined,
    fundingLoan: body.fundingLoan as string | number | null | undefined,
    fundingOther: body.fundingOther as string | number | null | undefined,
    annualPlannedInvestment: body.annualPlannedInvestment as string | number | null | undefined
  };
}

export async function registerGroupDecisionApplicationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: GroupDecisionApplicationService
) {
  app.get('/api/v1/group-decision-applications', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, ['investment.group_decision.read', 'investment.group_decision.read_all']);
    const query = objectBody(request.query ?? {});
    const mode = query.mode ?? 'mine';
    if (mode !== 'mine' && mode !== 'todo' && mode !== 'all') {
      throw new AppError('列表类型无效', 400, 'VALIDATION_ERROR');
    }
    return {
      success: true,
      data: await service.list(
        context.user,
        canReadAll(context.user.permissions),
        mode,
        pagination(query)
      )
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/group-decision-applications/:id', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, ['investment.group_decision.read', 'investment.group_decision.read_all']);
    return {
      success: true,
      data: await service.get(
        requiredId(request.params.id, '集团决策申请ID'),
        context.user,
        canReadAll(context.user.permissions)
      )
    };
  });

  app.post('/api/v1/group-decision-applications', async (request, reply) => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.group_decision.create');
    const data = await service.create(parseInput(request.body, false), context.user);
    await auth.audit(context.user.id, 'CREATE', 'GROUP_DECISION_APPLICATION', data.id, 'SUCCESS', request, null);
    return reply.status(201).send({ success: true, data });
  });

  app.put<{ Params: { id: string } }>('/api/v1/group-decision-applications/:id', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.group_decision.update');
    const id = requiredId(request.params.id, '集团决策申请ID');
    const data = await service.update(id, parseInput(request.body, true), context.user);
    await auth.audit(context.user.id, 'UPDATE', 'GROUP_DECISION_APPLICATION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/group-decision-applications/:id/submit', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.group_decision.submit');
    const id = requiredId(request.params.id, '集团决策申请ID');
    const data = await service.submit(id, context.user);
    await auth.audit(context.user.id, 'SUBMIT', 'GROUP_DECISION_APPLICATION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/group-decision-applications/:id/approve', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requireAnyPermission(context, [
      'investment.group_decision.approve_department',
      'investment.group_decision.approve_supervising'
    ]);
    const body = objectBody(request.body ?? {});
    const id = requiredId(request.params.id, '集团决策申请ID');
    const data = await service.approve(id, context.user, optionalText(body.comment, '审批意见', 2000));
    await auth.audit(context.user.id, 'APPROVE', 'GROUP_DECISION_APPLICATION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/group-decision-applications/:id/return', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requireAnyPermission(context, [
      'investment.group_decision.approve_department',
      'investment.group_decision.approve_supervising'
    ]);
    const body = objectBody(request.body ?? {});
    const id = requiredId(request.params.id, '集团决策申请ID');
    const data = await service.returnToInitiator(id, context.user, optionalText(body.comment, '审批意见', 2000));
    await auth.audit(context.user.id, 'RETURN', 'GROUP_DECISION_APPLICATION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });
}
