import assert from 'node:assert/strict';

const baseUrl = process.env.STRAPI_BASE_URL || 'http://localhost:1337';
const runLiveYoxaTest = process.env.RUN_LIVE_YOXA_TEST === 'true';
const providedSubmissionId = process.env.TEST_SUBMISSION_ID || '';

const sampleFields = {
  firstName: 'Inaya',
  lastName: 'Kahn',
  email: 'ceo@foodboxwebsite.in',
  profileLink: 'https://linkedin.com/in/example',
  startupName: 'Foodbox Example Ltd.',
  startupWebsite: 'https://foodboxwebsite.in',
  startDate: '2026-01-15',
  startupVision: 'A practical food access platform for urban families.',
  founderBackground: 'Founder has experience in logistics and community programs.',
  referredBy: 'Demo referral',
  otherSource: 'Demo script',
};

const makeFile = () =>
  new File(['Demo pitch profile for Democracy of Dreams integration testing.'], 'demo-pitch.txt', {
    type: 'text/plain',
  });

const makeForm = ({ omitField, includeFile = true } = {}) => {
  const form = new FormData();

  for (const [key, value] of Object.entries(sampleFields)) {
    if (key !== omitField) {
      form.append(key, value);
    }
  }

  form.append('connectionSource', 'Internet Search');
  form.append('connectionSource', 'LinkedIn');

  if (includeFile) {
    form.append('supportingFile', makeFile());
  }

  return form;
};

const postForm = async (form) => {
  const response = await fetch(`${baseUrl}/api/dreamer-submissions/submit`, {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }

  return { response, body };
};

const postJson = async (path, payload) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : {},
  };
};

const postReport = async (submissionId) => {
  const form = new FormData();
  form.append('submissionId', submissionId);
  form.append('sourceTool', 'test-report-upload');
  form.append(
    'file',
    new File(['<html><body><h1>Generated report</h1></body></html>'], 'generated-report.html', {
      type: 'text/html',
    })
  );

  const response = await fetch(`${baseUrl}/api/yoxa-tools/reports`, {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : {},
  };
};

console.log(`Testing Strapi API at ${baseUrl}`);

{
  const { response, body } = await postForm(makeForm({ omitField: 'firstName' }));
  assert.equal(response.status, 400, 'missing firstName should return 400');
  assert.equal(body.ok, false, 'missing firstName should return ok=false');
}

let submissionId = providedSubmissionId;

if (runLiveYoxaTest) {
  const { response, body } = await postForm(makeForm({ includeFile: false, omitField: 'startupVision' }));
  assert.equal(response.status, 200, 'valid live submission should return 200');
  assert.equal(body.ok, true, 'valid live submission should return ok=true');
  assert.ok(body.submissionId, 'valid live submission should return submissionId for debug tracing');
  submissionId = body.submissionId;
} else {
  console.log('Skipping live Yoxa trigger test. Set RUN_LIVE_YOXA_TEST=true to enable it.');
}

if (submissionId) {
  {
    const { response, body } = await postReport(submissionId);
    assert.equal(response.status, 200, 'report upload should return 200');
    assert.equal(body.success, true, 'report upload should be successful');
    assert.ok(body.reportId, 'report upload should return reportId');
  }

  const { response, body } = await postJson('/api/yoxa-tools/workflow-output', {
    submissionId,
    toolName: 'workflow-output',
    status: 'completed',
    summary: 'Demo generated output received.',
    outputText: 'The Yoxa workflow produced a demo onboarding summary.',
    outputJson: {
      score: 87,
      recommendation: 'Invite to the next Dreamer onboarding step.',
    },
    payload: {
      source: 'scripts/test-api.mjs',
    },
  });

  assert.equal(response.status, 200, 'workflow-output callback should return 200');
  assert.equal(body.accepted, true, 'workflow-output callback should be accepted');
  assert.ok(body.eventId, 'workflow-output callback should return eventId');
} else {
  console.log('Skipping connector callback storage test. Set TEST_SUBMISSION_ID or RUN_LIVE_YOXA_TEST=true.');
}

console.log('API checks completed.');
