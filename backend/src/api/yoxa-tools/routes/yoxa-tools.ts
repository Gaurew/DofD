export default {
  routes: [
    {
      method: 'POST',
      path: '/yoxa-tools/workflow-output',
      handler: 'yoxa-tools.workflowOutput',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/yoxa-tools/reports',
      handler: 'yoxa-tools.uploadReport',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/yoxa-tools/submission-context',
      handler: 'yoxa-tools.submissionContext',
      config: {
        auth: false,
      },
    },
  ],
};
