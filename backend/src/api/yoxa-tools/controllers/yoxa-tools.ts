import { basename, extname } from 'node:path';

const SUBMISSION_UID = 'api::dreamer-submission.dreamer-submission';
const EVENT_UID = 'api::workflow-event.workflow-event';
const REPORT_UID = 'api::workflow-report.workflow-report';
const REPORT_FILE_EXTENSIONS = new Set(['.pdf', '.html', '.htm']);
const TOOL_API_KEY_HEADER = 'x-dofd-yoxa-tool-key';

const getConfiguredToolApiKey = () => {
  const raw =
    process.env.YOXA_TOOL_API_KEY ||
    (typeof strapi !== 'undefined' ? (strapi.config.get('yoxa.toolApiKey') as string | undefined) : undefined) ||
    '';
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed.startsWith('replace-with-')) {
    return '';
  }
  return trimmed;
};

const isToolAuthorized = (ctx) => {
  const expected = getConfiguredToolApiKey();
  if (!expected) {
    return true;
  }
  const provided = String(ctx.request.headers?.[TOOL_API_KEY_HEADER] || '').trim();
  return provided.length > 0 && provided === expected;
};

const unauthorizedBody = (ctx, message: string) => {
  ctx.status = 401;
  ctx.body = {
    success: false,
    found: false,
    accepted: false,
    message,
  };
};

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

const parseJsonObject = (value: unknown) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(String(value));
    return asObject(parsed);
  } catch {
    return {};
  }
};

const mergedMetadata = (body: Record<string, unknown>) => ({
  ...parseJsonObject(body.metadata),
  ...parseJsonObject(body.payload),
  ...parseJsonObject(body.json),
  ...parseJsonObject((body as Record<string, unknown>).arguments_json),
  ...body,
});

const getUploadedFiles = (files: Record<string, any> = {}) =>
  Object.values(files)
    .flat()
    .filter((file) => Boolean(file && getFilePath(file) && Number(file.size || 0) > 0));

const getFileName = (file: any) => String(file?.originalFilename || file?.name || 'generated-report.pdf');

const getFilePath = (file: any) => file?.filepath || file?.path;

const getFileExtension = (file: any) => {
  const fileName = getFileName(file).toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
};

const isPdfFile = (file: any) => {
  const mimeType = String(file?.mimetype || file?.type || '').toLowerCase();
  return mimeType === 'application/pdf' || getFileExtension(file) === '.pdf';
};

const isHtmlFile = (file: any) => {
  const mimeType = String(file?.mimetype || file?.type || '').toLowerCase();
  return ['text/html', 'application/xhtml+xml'].includes(mimeType) || ['.html', '.htm'].includes(getFileExtension(file));
};

const getReportFileType = (file: any) => {
  if (isPdfFile(file)) {
    return 'pdf';
  }

  if (isHtmlFile(file)) {
    return 'html';
  }

  return null;
};

const sanitizeReportFileName = (fileName: string, fileType: 'pdf' | 'html') => {
  const originalExtension = extname(fileName).toLowerCase();
  const extension = REPORT_FILE_EXTENSIONS.has(originalExtension)
    ? originalExtension
    : fileType === 'pdf'
      ? '.pdf'
      : '.html';
  const baseName = basename(fileName, originalExtension)
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s-]+$/g, '')
    .replace(/^[.\s-]+/g, '')
    .trim();
  const safeBaseName = baseName || 'generated-report';

  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safeBaseName)) {
    return `${safeBaseName}-file${extension}`;
  }

  return `${safeBaseName}${extension}`.slice(0, 240);
};

const withSafeReportUploadName = (file: any, fileType: 'pdf' | 'html') => {
  const originalName = getFileName(file);
  const safeName = sanitizeReportFileName(originalName, fileType);

  return {
    ...file,
    originalFilename: safeName,
    name: safeName,
    _dofdOriginalFilename: originalName,
    _dofdSanitizedFilename: safeName,
  };
};

export default {
  async workflowOutput(ctx) {
    if (!isToolAuthorized(ctx)) {
      unauthorizedBody(ctx, 'Invalid or missing tool API key.');
      return;
    }
    const body = asObject(ctx.request.body);
    const submissionId = stringOrNull(body.submissionId);

    if (!submissionId) {
      ctx.status = 400;
      ctx.body = {
        accepted: false,
        message: 'submissionId is required.',
      };
      return;
    }

    const submission = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId },
    });

    if (!submission) {
      ctx.status = 404;
      ctx.body = {
        accepted: false,
        message: 'Submission not found.',
      };
      return;
    }

    const status = stringOrNull(body.status) || 'output_received';
    const isError = status === 'error' || status === 'failed' || status === 'connector_error';
    const outputJson = body.outputJson ?? body.payload ?? null;
    const outputText = stringOrNull(body.outputText);
    const summary = stringOrNull(body.summary) || 'Yoxa workflow output received.';
    const workflowRunId = stringOrNull(body.workflowRunId);
    const triggerAttemptId = stringOrNull(body.triggerAttemptId);

    const event = await strapi.db.query(EVENT_UID).create({
      data: {
        eventType: isError ? 'connector_error' : 'connector_output',
        status,
        toolName: stringOrNull(body.toolName) || 'workflow-output',
        summary,
        outputText,
        outputJson,
        rawPayload: body,
        workflowRunId,
        triggerAttemptId,
        submission: submission.id,
      },
    });

    await strapi.db.query(SUBMISSION_UID).update({
      where: { id: submission.id },
      data: {
        yoxaTriggerStatus: isError ? 'connector_error' : 'output_received',
        yoxaWorkflowRunId: workflowRunId || submission.yoxaWorkflowRunId,
        yoxaTriggerAttemptId: triggerAttemptId || submission.yoxaTriggerAttemptId,
        latestOutputSummary: summary,
        latestOutputText: outputText,
        latestOutputJson: outputJson,
      },
    });

    ctx.body = {
      accepted: true,
      submissionId,
      eventId: event.documentId,
    };
  },

  async uploadReport(ctx) {
    if (!isToolAuthorized(ctx)) {
      unauthorizedBody(ctx, 'Invalid or missing tool API key.');
      return;
    }
    const body = mergedMetadata(asObject(ctx.request.body));
    const submissionId = stringOrNull(body.submissionId);

    if (!submissionId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: 'submissionId is required.',
      };
      return;
    }

    const submission = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId },
    });

    if (!submission) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: 'Submission not found.',
      };
      return;
    }

    const files = getUploadedFiles(ctx.request.files);
    const reportFile = files.find((file) => Boolean(getReportFileType(file)));

    if (!reportFile) {
      ctx.body = {
        success: true,
        message: 'Connection Check OK',
        submissionId,
        reportId: null,
        fileName: null,
        fileUrl: null,
        eventId: null,
      };
      return;
    }

    const fileType = getReportFileType(reportFile);
    const sourceTool = stringOrNull(body.sourceTool) || stringOrNull(body.toolName) || null;
    const uploadFile = withSafeReportUploadName(reportFile, fileType);

    const report = await strapi.db.query(REPORT_UID).create({
      data: {
        submission: submission.id,
        originalFilename: uploadFile._dofdOriginalFilename,
        fileType,
        sourceTool,
        receivedAt: new Date().toISOString(),
        rawMetadata: {
          ...body,
          file: {
            originalFilename: uploadFile._dofdOriginalFilename,
            sanitizedFilename: uploadFile._dofdSanitizedFilename,
            mime: reportFile?.mimetype || reportFile?.type || null,
            size: reportFile?.size || null,
          },
        },
      },
    });

    const uploadedFiles = await strapi.plugin('upload').service('upload').upload({
      data: {
        refId: report.id,
        ref: REPORT_UID,
        field: 'file',
      },
      files: uploadFile,
    });
    const uploadedFile = Array.isArray(uploadedFiles) ? uploadedFiles[0] : uploadedFiles;
    const fileName = uploadedFile?.name || getFileName(reportFile);
    const fileUrl = uploadedFile?.url || null;

    const event = await strapi.db.query(EVENT_UID).create({
      data: {
        eventType: 'report_received',
        status: 'received',
        toolName: sourceTool || 'report-upload',
        summary: `Generated report received: ${fileName}`,
        outputJson: {
          fileName,
          fileUrl,
          fileId: uploadedFile?.id || null,
          reportId: report.documentId,
          fileType,
          mimeType: uploadedFile?.mime || reportFile?.mimetype || reportFile?.type || null,
          size: uploadedFile?.size || reportFile?.size || null,
        },
        rawPayload: {
          body,
          uploadedFile: {
            id: uploadedFile?.id || null,
            name: fileName,
            url: fileUrl,
            mime: uploadedFile?.mime || null,
            size: uploadedFile?.size || null,
          },
        },
        submission: submission.id,
      },
    });

    await strapi.db.query(SUBMISSION_UID).update({
      where: { id: submission.id },
      data: {
        reviewStatus: 'reports_generated',
        yoxaTriggerStatus: 'output_received',
        latestOutputSummary: `Generated report received: ${fileName}`,
        latestOutputJson: {
          reportId: report.documentId,
          fileName,
          fileUrl,
          fileType,
        },
      },
    });

    ctx.body = {
      success: true,
      message: 'Upload Success',
      submissionId,
      reportId: report.documentId,
      fileName,
      fileUrl,
      eventId: event.documentId,
    };
  },

  async submissionContext(ctx) {
    if (!isToolAuthorized(ctx)) {
      unauthorizedBody(ctx, 'Invalid or missing tool API key.');
      return;
    }
    const body = mergedMetadata(asObject(ctx.request.body));
    const submissionId = stringOrNull(body.submissionId);

    if (!submissionId) {
      ctx.status = 400;
      ctx.body = {
        found: false,
        message: 'submissionId is required.',
      };
      return;
    }

    const submission = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId },
    });

    if (!submission) {
      ctx.status = 404;
      ctx.body = {
        found: false,
        message: 'Submission not found.',
      };
      return;
    }

    ctx.body = {
      found: true,
      submissionId,
      firstName: submission.firstName || null,
      lastName: submission.lastName || null,
      email: submission.email || null,
      profileLink: submission.profileLink || null,
      startupName: submission.startupName || null,
      startupWebsite: submission.startupWebsite || null,
      startDate: submission.startDate || null,
      startupVision: submission.startupVision || null,
      founderBackground: submission.founderBackground || null,
      connectionSources: submission.connectionSources || [],
      referredBy: submission.referredBy || null,
      otherSource: submission.otherSource || null,
      yoxaTriggerStatus: submission.yoxaTriggerStatus || null,
      reviewStatus: submission.reviewStatus || null,
      yoxaWorkflowRunId: submission.yoxaWorkflowRunId || null,
      createdAt: submission.createdAt || null,
    };
  },
};
