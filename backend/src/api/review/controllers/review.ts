const SUBMISSION_UID = 'api::dreamer-submission.dreamer-submission';
const REPORT_UID = 'api::workflow-report.workflow-report';
const EVENT_UID = 'api::workflow-event.workflow-event';

const STATUSES = ['new', 'reports_generated', 'approved', 'rejected', 'failed'];
const QUEUE_STATUS = new Set(STATUSES);
const DECISIONS = new Set(['approved', 'rejected']);

const asObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const stringOrNull = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const includesSearch = (submission: any, query: string) => {
  if (!query) {
    return true;
  }

  const haystack = [
    submission.firstName,
    submission.lastName,
    submission.email,
    submission.startupName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
};

const getUploadUrl = (file: any) => {
  if (!file?.url) {
    return null;
  }

  return file.url.startsWith('http') ? file.url : file.url;
};

const getEffectiveReviewStatus = (submission: any) => {
  if (submission.reviewStatus) {
    return submission.reviewStatus;
  }

  if (submission.yoxaTriggerStatus === 'failed' || submission.yoxaTriggerStatus === 'connector_error') {
    return 'failed';
  }

  return 'new';
};

const serializeFile = (file: any) =>
  file
    ? {
        id: file.id,
        name: file.name,
        url: getUploadUrl(file),
        mime: file.mime,
        size: file.size,
      }
    : null;

const serializeReport = (report: any) => ({
  id: report.id,
  documentId: report.documentId,
  originalFilename: report.originalFilename,
  fileType: report.fileType,
  sourceTool: report.sourceTool,
  receivedAt: report.receivedAt,
  file: serializeFile(report.file),
});

const serializeEvent = (event: any) => ({
  id: event.id,
  documentId: event.documentId,
  eventType: event.eventType,
  status: event.status,
  toolName: event.toolName,
  summary: event.summary,
  workflowRunId: event.workflowRunId,
  triggerAttemptId: event.triggerAttemptId,
  createdAt: event.createdAt,
});

const serializeSubmission = (submission: any, reports: any[] = [], events: any[] = []) => ({
  id: submission.id,
  documentId: submission.documentId,
  firstName: submission.firstName,
  lastName: submission.lastName,
  email: submission.email,
  profileLink: submission.profileLink,
  startupName: submission.startupName,
  startupWebsite: submission.startupWebsite,
  startDate: submission.startDate,
  startupVision: submission.startupVision,
  founderBackground: submission.founderBackground,
  connectionSources: submission.connectionSources || [],
  referredBy: submission.referredBy,
  otherSource: submission.otherSource,
  reviewStatus: getEffectiveReviewStatus(submission),
  decision: submission.decision,
  decisionNote: submission.decisionNote,
  decidedAt: submission.decidedAt,
  decidedBy: submission.decidedBy,
  yoxaTriggerStatus: submission.yoxaTriggerStatus,
  yoxaWorkflowRunId: submission.yoxaWorkflowRunId,
  yoxaTriggerAttemptId: submission.yoxaTriggerAttemptId,
  yoxaTriggerError: submission.yoxaTriggerError,
  latestOutputSummary: submission.latestOutputSummary,
  latestOutputJson: submission.latestOutputJson,
  supportingFile: serializeFile(submission.supportingFile),
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
  reports: reports.map(serializeReport),
  events: events.map(serializeEvent),
  contentManagerUrl: `/admin/content-manager/collection-types/${SUBMISSION_UID}/${submission.documentId}`,
});

async function getSubmissionBundle(documentId: string) {
  const submission = await strapi.db.query(SUBMISSION_UID).findOne({
    where: { documentId },
    populate: {
      supportingFile: true,
    },
  });

  if (!submission) {
    return null;
  }

  const reports = await strapi.db.query(REPORT_UID).findMany({
    where: { submission: submission.id },
    populate: {
      file: true,
    },
    orderBy: { receivedAt: 'desc' },
  });

  const events = await strapi.db.query(EVENT_UID).findMany({
    where: { submission: submission.id },
    orderBy: { createdAt: 'desc' },
    limit: 50,
  });

  return { submission, reports, events };
}

export default {
  async listSubmissions(ctx) {
    const statusParam = stringOrNull(ctx.query.status);
    const query = stringOrNull(ctx.query.q) || '';
    const selectedStatuses = new Set(
      (statusParam || '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => QUEUE_STATUS.has(item))
    );

    const submissions = await strapi.db.query(SUBMISSION_UID).findMany({
      populate: {
        supportingFile: true,
      },
      orderBy: { createdAt: 'desc' },
      limit: 1000,
    });

    const filtered = submissions
      .filter((submission) => !selectedStatuses.size || selectedStatuses.has(getEffectiveReviewStatus(submission)))
      .filter((submission) => includesSearch(submission, query))
      .slice(0, 100);
    const metrics = STATUSES.reduce((acc, item) => ({ ...acc, [item]: 0 }), {});

    for (const row of submissions) {
      const key = getEffectiveReviewStatus(row);
      if (key in metrics) {
        metrics[key] += 1;
      }
    }

    ctx.body = {
      data: filtered.map((submission) => serializeSubmission(submission)),
      metrics,
    };
  },

  async getSubmission(ctx) {
    const bundle = await getSubmissionBundle(ctx.params.documentId);

    if (!bundle) {
      ctx.status = 404;
      ctx.body = { message: 'Submission not found.' };
      return;
    }

    ctx.body = {
      data: serializeSubmission(bundle.submission, bundle.reports, bundle.events),
    };
  },

  async recordDecision(ctx) {
    const body = asObject(ctx.request.body);
    const decision = stringOrNull(body.decision);

    if (!decision || !DECISIONS.has(decision)) {
      ctx.status = 400;
      ctx.body = { message: 'decision must be approved or rejected.' };
      return;
    }

    const bundle = await getSubmissionBundle(ctx.params.documentId);

    if (!bundle) {
      ctx.status = 404;
      ctx.body = { message: 'Submission not found.' };
      return;
    }

    const note = stringOrNull(body.note);
    const decidedAt = new Date().toISOString();
    const decidedBy = stringOrNull(body.decidedBy) || 'Strapi reviewer';
    const updated = await strapi.db.query(SUBMISSION_UID).update({
      where: { id: bundle.submission.id },
      data: {
        reviewStatus: decision,
        decision,
        decisionNote: note,
        decidedAt,
        decidedBy,
      },
    });

    await strapi.db.query(EVENT_UID).create({
      data: {
        eventType: 'decision_recorded',
        status: decision,
        toolName: 'dofd-review-dashboard',
        summary: `Reviewer decision recorded: ${decision}`,
        rawPayload: {
          decision,
          note,
          decidedAt,
          decidedBy,
        },
        submission: updated.id,
      },
    });

    const refreshed = await getSubmissionBundle(updated.documentId);

    ctx.body = {
      data: serializeSubmission(refreshed.submission, refreshed.reports, refreshed.events),
    };
  },
};
