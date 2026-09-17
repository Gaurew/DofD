import { factories } from '@strapi/strapi';

const errorForLogs = (error: any) => ({
  name: error?.name || null,
  message: String(error?.message || 'Unknown error'),
  code: error?.code || error?.details?.code || null,
  status: error?.status || error?.statusCode || null,
  details: error?.details || null,
  stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 8) : null,
});

export default factories.createCoreController('api::dreamer-submission.dreamer-submission', ({ strapi }) => ({
  async submit(ctx) {
    try {
      strapi.log.info('[DofD submit controller] POST /api/dreamer-submissions/submit received.');
      const service = strapi.service('api::dreamer-submission.dreamer-submission') as any;
      const result = await service.submitDreamerProfile(ctx.request.body, ctx.request.files);

      ctx.body = {
        ok: true,
        message: 'Thank you. Your dream profile has been submitted successfully.',
        submissionId: result.submissionId,
      };
    } catch (error) {
      const status = Number(error?.status || 500);
      strapi.log.error(
        `[DofD submit controller] Submission failed: ${JSON.stringify({
          status,
          error: errorForLogs(error),
        })}`
      );
      const message =
        status >= 500
          ? 'We could not submit the form right now. Please try again in a moment.'
          : error.message;

      ctx.status = status;
      ctx.body = {
        ok: false,
        message,
      };
    }
  },
}));
