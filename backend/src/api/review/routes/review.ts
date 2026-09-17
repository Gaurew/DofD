export default {
  routes: [
    {
      method: 'GET',
      path: '/review/submissions',
      handler: 'review.listSubmissions',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/review/submissions/:documentId',
      handler: 'review.getSubmission',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/review/submissions/:documentId/decision',
      handler: 'review.recordDecision',
      config: {
        auth: false,
      },
    },
  ],
};
