export default {
  routes: [
    {
      method: 'POST',
      path: '/dreamer-submissions/submit',
      handler: 'dreamer-submission.submit',
      config: {
        auth: false,
      },
    },
  ],
};
