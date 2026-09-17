import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { factories } from '@strapi/strapi';

const UID = 'api::dreamer-submission.dreamer-submission';
const EVENT_UID = 'api::workflow-event.workflow-event';

const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'startupName',
  'startDate',
];

const ALLOWED_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md']);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

class PublicSubmissionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const valueOf = (body: Record<string, unknown>, name: string) => {
  const value = body?.[name];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }

  return String(value || '').trim();
};

const optionalValueOf = (body: Record<string, unknown>, name: string) => valueOf(body, name) || null;

const normalizeConnectionSources = (body: Record<string, unknown>) => {
  const value = body?.connectionSource || body?.connectionSources;
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [String(value).trim()];
};

const getFile = (files: Record<string, any> = {}) => {
  const file = files.supportingFile;
  return Array.isArray(file) ? file[0] : file;
};

const getFilePath = (file: any) => file?.filepath || file?.path;

const getFileName = (file: any) =>
  String(file?.originalFilename || file?.name || basename(getFilePath(file) || 'supporting-file'));

const hasUsableFile = (file?: any) => Boolean(file && getFilePath(file) && Number(file.size || 0) > 0);

const getUsableFile = (files: Record<string, any> = {}) => {
  const file = getFile(files);
  return hasUsableFile(file) ? file : null;
};

const getFileExtension = (file: any) => {
  const fileName = getFileName(file).toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
};

const sanitizeFileName = (fileName: string, fallback = 'supporting-file') => {
  const originalExtension = extname(fileName).toLowerCase();
  const extension = originalExtension && ALLOWED_FILE_EXTENSIONS.has(originalExtension) ? originalExtension : '';
  const baseName = basename(fileName, originalExtension)
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s-]+$/g, '')
    .replace(/^[.\s-]+/g, '')
    .trim();
  const safeBaseName = baseName || fallback;
  const safeName = `${safeBaseName}${extension}`.slice(0, 240);

  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safeBaseName)) {
    return `${safeBaseName}-file${extension}`;
  }

  return safeName || `${fallback}${extension}`;
};

const withSafeUploadName = (file: any, fallback = 'supporting-file') => {
  if (!file) {
    return file;
  }

  const originalName = getFileName(file);
  const safeName = sanitizeFileName(originalName, fallback);

  return {
    ...file,
    originalFilename: safeName,
    name: safeName,
    _dofdOriginalFilename: originalName,
    _dofdSanitizedFilename: safeName,
  };
};

const validateUrl = (value: string | null, label: string) => {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new PublicSubmissionError(`${label} must be a valid http or https URL.`);
  }
};

const sanitizeError = (error: any) => ({
  message: String(error?.message || 'Unknown error'),
  status: error?.status || error?.statusCode || null,
  code: error?.code || error?.details?.code || null,
  name: error?.name || null,
});

const errorForLogs = (error: any) => ({
  name: error?.name || null,
  message: String(error?.message || 'Unknown error'),
  code: error?.code || error?.details?.code || null,
  status: error?.status || error?.statusCode || null,
  details: error?.details || null,
  stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 8) : null,
});

const endpointForLogs = (endpoint?: string) => {
  if (!endpoint) {
    return 'not configured';
  }

  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint;
  }
};

const fileForLogs = (file?: any) =>
  file
    ? {
        name: getFileName(file),
        originalFilename: file.originalFilename || null,
        uploadName: file.name || null,
        safeUploadName: file._dofdSanitizedFilename || null,
        originalUploadName: file._dofdOriginalFilename || null,
        extension: getFileExtension(file) || 'none',
        mime: file.mimetype || file.type || 'unknown',
        size: Number(file.size || 0),
        hasPath: Boolean(getFilePath(file)),
        pathBasename: getFilePath(file) ? basename(getFilePath(file)) : null,
      }
    : null;

const filenameCharacterDiagnostics = (file?: any) => {
  if (!file) {
    return null;
  }

  const name = getFileName(file);
  const suspicious = Array.from(name)
    .map((character, index) => ({
      index,
      character,
      codePoint: character.codePointAt(0),
    }))
    .filter(({ character, codePoint }) => {
      if (codePoint === undefined) {
        return false;
      }

      return codePoint < 32 || codePoint === 127 || ['/', '\\', ':', '*', '?', '"', '<', '>', '|'].includes(character);
    });

  return {
    name,
    length: name.length,
    suspicious,
    codePoints: Array.from(name).map((character) => character.codePointAt(0)),
  };
};

const bodyForLogs = (body: Record<string, unknown>) => ({
  firstName: valueOf(body, 'firstName'),
  lastName: valueOf(body, 'lastName'),
  email: valueOf(body, 'email'),
  startupName: valueOf(body, 'startupName'),
  startupWebsite: optionalValueOf(body, 'startupWebsite'),
  hasStartupVision: Boolean(optionalValueOf(body, 'startupVision')),
  hasFounderBackground: Boolean(optionalValueOf(body, 'founderBackground')),
});

const responseSnippet = (value: string) => {
  if (!value) {
    return '';
  }

  return value.length > 1200 ? `${value.slice(0, 1200)}... [truncated]` : value;
};

export default factories.createCoreService(UID, ({ strapi }) => ({
  async submitDreamerProfile(body: Record<string, unknown>, files: Record<string, any>) {
    strapi.log.info('[DofD submit] Received public form submission.');
    try {
      this.validateSubmission(body, files);
    } catch (error) {
      strapi.log.error(
        `[DofD submit] Phase failed: validate_submission ${JSON.stringify({
          error: errorForLogs(error),
          fields: bodyForLogs(body),
        supportingFile: fileForLogs(getFile(files)),
        filenameDiagnostics: filenameCharacterDiagnostics(getFile(files)),
      })}`
      );
      throw error;
    }

    const rawFile = getFile(files);
    const file = getUsableFile(files);
    if (rawFile && !file) {
      strapi.log.info(
        `[DofD submit] Ignoring empty or unusable applicant file placeholder: ${JSON.stringify({
          file: fileForLogs(rawFile),
          reason: 'missing_path_or_zero_size',
        })}`
      );
    }
    strapi.log.info(
      `[DofD submit] Validation passed: ${JSON.stringify({
        fields: bodyForLogs(body),
        rawSupportingFile: fileForLogs(rawFile),
        usableSupportingFile: fileForLogs(file),
      })}`
    );

    const submissionData = this.buildSubmissionData(body);
    let submission: any;
    try {
      submission = await strapi.db.query(UID).create({
        data: {
          ...submissionData,
          yoxaTriggerStatus: 'pending',
          reviewStatus: 'new',
        },
      });
    } catch (error) {
      strapi.log.error(
        `[DofD submit] Phase failed: create_submission ${JSON.stringify({
          error: errorForLogs(error),
          fields: bodyForLogs(body),
        })}`
      );
      throw error;
    }
    strapi.log.info(`[DofD submit] Created Dreamer Submission ${submission.documentId} / db id ${submission.id}.`);

    try {
      await this.createWorkflowEvent(submission, {
        eventType: 'submission_created',
        status: 'pending',
        summary: 'Dreamer form submission was saved in Strapi.',
        rawPayload: {
          submissionData,
          supportingFile: file
            ? {
                status: 'included',
                file: fileForLogs(file),
              }
            : {
                status: rawFile ? 'empty_or_unusable_skipped' : 'not_provided',
                file: fileForLogs(rawFile),
              },
        },
      });
    } catch (error) {
      strapi.log.error(
        `[DofD submit] Phase failed: create_submission_event ${JSON.stringify({
          submissionId: submission.documentId,
          error: errorForLogs(error),
        })}`
      );
      throw error;
    }
    strapi.log.info(`[DofD submit] Created submission_created timeline event for ${submission.documentId}.`);

    if (file) {
      strapi.log.info(
        `[DofD submit] Uploading applicant source file for ${submission.documentId}: ${JSON.stringify({
          file: fileForLogs(file),
          filenameDiagnostics: filenameCharacterDiagnostics(file),
        })}`
      );
      const uploadFile = withSafeUploadName(file, `dofd-source-${submission.documentId}`);
      if (uploadFile._dofdOriginalFilename !== uploadFile._dofdSanitizedFilename) {
        strapi.log.info(
          `[DofD submit] Sanitized applicant filename for ${submission.documentId}: ${JSON.stringify({
            original: uploadFile._dofdOriginalFilename,
            sanitized: uploadFile._dofdSanitizedFilename,
          })}`
        );
      }
      try {
        await strapi.plugin('upload').service('upload').upload({
          data: {
            refId: submission.id,
            ref: UID,
            field: 'supportingFile',
          },
          files: uploadFile,
        });
        strapi.log.info(`[DofD submit] Applicant source file stored for ${submission.documentId}.`);
      } catch (error) {
        strapi.log.error(
          `[DofD submit] Phase failed: upload_applicant_file ${JSON.stringify({
            submissionId: submission.documentId,
            error: errorForLogs(error),
            file: fileForLogs(file),
            filenameDiagnostics: filenameCharacterDiagnostics(file),
          })}`
        );
        throw error;
      }
    } else {
      strapi.log.info(`[DofD submit] No applicant source file included for ${submission.documentId}.`);
    }

    try {
      strapi.log.info(`[DofD submit] Triggering Yoxa workflow for ${submission.documentId}.`);
      const triggerResponse = await this.triggerYoxaWorkflow(submission, body, file);
      const updatedSubmission = await strapi.db.query(UID).update({
        where: { id: submission.id },
        data: {
          yoxaTriggerStatus: 'accepted',
          yoxaWorkflowRunId: triggerResponse.workflow_run_id || null,
          yoxaTriggerAttemptId: triggerResponse.trigger_attempt_id || null,
          yoxaTriggerError: null,
        },
      });

      await this.createWorkflowEvent(updatedSubmission, {
        eventType: 'trigger_accepted',
        status: 'accepted',
        summary: 'Yoxa accepted the workflow trigger.',
        rawPayload: triggerResponse,
        workflowRunId: triggerResponse.workflow_run_id || null,
        triggerAttemptId: triggerResponse.trigger_attempt_id || null,
      });
      strapi.log.info(
        `[DofD submit] Yoxa trigger accepted for ${submission.documentId}: ${JSON.stringify({
          workflowRunId: triggerResponse.workflow_run_id || null,
          triggerAttemptId: triggerResponse.trigger_attempt_id || null,
        })}`
      );
    } catch (error) {
      const sanitized = sanitizeError(error);
      strapi.log.error(
        `[DofD submit] Yoxa trigger failed for ${submission.documentId}: ${JSON.stringify({
          ...sanitized,
          endpoint: endpointForLogs(strapi.config.get('yoxa.triggerEndpoint') as string | undefined),
        })}`
      );
      const updatedSubmission = await strapi.db.query(UID).update({
        where: { id: submission.id },
        data: {
          yoxaTriggerStatus: 'failed',
          reviewStatus: 'failed',
          yoxaTriggerError: sanitized,
        },
      });

      await this.createWorkflowEvent(updatedSubmission, {
        eventType: 'trigger_failed',
        status: 'failed',
        summary: sanitized.message,
        rawPayload: sanitized,
      });
      strapi.log.info(`[DofD submit] Marked ${submission.documentId} as failed and wrote trigger_failed timeline event.`);

      throw new PublicSubmissionError('We could not submit the form right now. Please try again in a moment.', 502);
    }

    return {
      submissionId: submission.documentId,
    };
  },

  validateSubmission(body: Record<string, unknown>, files: Record<string, any>) {
    for (const field of REQUIRED_FIELDS) {
      if (!valueOf(body, field)) {
        throw new PublicSubmissionError(`${field} is required.`);
      }
    }

    const email = valueOf(body, 'email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new PublicSubmissionError('Email must be a valid email address.');
    }

    validateUrl(optionalValueOf(body, 'profileLink'), 'Professional profile link');
    validateUrl(optionalValueOf(body, 'startupWebsite'), 'Startup website');

    const file = getUsableFile(files);
    if (!file) {
      return;
    }

    if (Number(file.size || 0) > MAX_FILE_SIZE_BYTES) {
      throw new PublicSubmissionError('Supporting file must be 20MB or smaller.');
    }

    if (!ALLOWED_FILE_EXTENSIONS.has(getFileExtension(file))) {
      throw new PublicSubmissionError('Supporting file must be a PDF, DOC, DOCX, TXT, or Markdown file.');
    }
  },

  buildSubmissionData(body: Record<string, unknown>) {
    return {
      firstName: valueOf(body, 'firstName'),
      lastName: valueOf(body, 'lastName'),
      email: valueOf(body, 'email'),
      profileLink: optionalValueOf(body, 'profileLink'),
      startupName: valueOf(body, 'startupName'),
      startupWebsite: optionalValueOf(body, 'startupWebsite'),
      startDate: valueOf(body, 'startDate'),
      startupVision: optionalValueOf(body, 'startupVision'),
      founderBackground: optionalValueOf(body, 'founderBackground'),
      connectionSources: normalizeConnectionSources(body),
      referredBy: optionalValueOf(body, 'referredBy'),
      otherSource: optionalValueOf(body, 'otherSource'),
    };
  },

  buildTriggerText(submission: any, body: Record<string, unknown>) {
    const prefix = strapi.config.get('yoxa.triggerTextPrefix', 'Submitted external form');
    const lines = [
      prefix,
      '',
      `DofD Submission ID: ${submission.documentId}`,
      '',
      'Personal Information',
      `First Name: ${valueOf(body, 'firstName')}`,
      `Last Name: ${valueOf(body, 'lastName')}`,
      `Contact Email: ${valueOf(body, 'email')}`,
      `Professional Profile Link: ${optionalValueOf(body, 'profileLink') || 'Not provided'}`,
      '',
      'Startup Information',
      `Startup Name: ${valueOf(body, 'startupName')}`,
      `Startup Website: ${optionalValueOf(body, 'startupWebsite') || 'Not provided'}`,
      `Startup Start Date: ${valueOf(body, 'startDate')}`,
      `Startup Vision: ${optionalValueOf(body, 'startupVision') || 'Not provided'}`,
      `Founder Background: ${optionalValueOf(body, 'founderBackground') || 'Not provided'}`,
    ];

    return lines.join('\n');
  },

  async triggerYoxaWorkflow(submission: any, body: Record<string, unknown>, file?: any) {
    const endpoint = strapi.config.get('yoxa.triggerEndpoint') as string | undefined;
    const secret = strapi.config.get('yoxa.deploymentSecret') as string | undefined;

    strapi.log.info(
      `[DofD Yoxa] Preparing trigger request: ${JSON.stringify({
        submissionId: submission.documentId,
        endpoint: endpointForLogs(endpoint),
        hasEndpoint: Boolean(endpoint),
        hasSecret: Boolean(secret),
        supportingFile: fileForLogs(file),
      })}`
    );

    if (!endpoint || !secret) {
      throw new Error('Yoxa trigger endpoint and deployment secret must be configured.');
    }

    const triggerText = this.buildTriggerText(submission, body);
    strapi.log.debug(
      `[DofD Yoxa] Trigger text preview for ${submission.documentId}: ${JSON.stringify({
        length: triggerText.length,
        preview: triggerText.slice(0, 500),
      })}`
    );

    const idempotencyKey = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const startedAt = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Yoxa-Deployment-Secret': secret,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trigger_text: triggerText }),
    });

    const responseText = await response.text();
    strapi.log.info(
      `[DofD Yoxa] Trigger response for ${submission.documentId}: ${JSON.stringify({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt,
        body: responseSnippet(responseText),
      })}`
    );
    let parsed: any = null;

    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = { message: responseText };
    }

    if (!response.ok) {
      const error = new Error(parsed?.detail || parsed?.message || `Yoxa returned ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    return parsed || {};
  },

  async createWorkflowEvent(submission: any, data: Record<string, unknown>) {
    return strapi.db.query(EVENT_UID).create({
      data: {
        ...data,
        submission: submission.id,
      },
    });
  },
}));
