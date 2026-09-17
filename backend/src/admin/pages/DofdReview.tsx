import * as React from 'react';
import './DofdReview.css';

type ReviewStatus = 'new' | 'reports_generated' | 'approved' | 'rejected' | 'failed';

type WorkflowReport = {
  documentId: string;
  originalFilename: string;
  fileType: 'pdf' | 'html';
  sourceTool?: string | null;
  receivedAt: string;
  file?: {
    name: string;
    url: string;
    mime?: string;
    size?: number;
  } | null;
};

type WorkflowEvent = {
  documentId: string;
  eventType: string;
  status?: string;
  toolName?: string;
  summary?: string;
  createdAt: string;
};

type Submission = {
  documentId: string;
  firstName: string;
  lastName: string;
  email: string;
  profileLink?: string | null;
  startupName: string;
  startupWebsite?: string | null;
  startDate?: string | null;
  startupVision?: string | null;
  founderBackground?: string | null;
  connectionSources?: string[];
  referredBy?: string | null;
  otherSource?: string | null;
  reviewStatus: ReviewStatus;
  decision?: 'approved' | 'rejected' | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  yoxaTriggerStatus?: string | null;
  yoxaWorkflowRunId?: string | null;
  yoxaTriggerError?: {
    message?: string;
    status?: number | null;
  } | null;
  latestOutputSummary?: string | null;
  supportingFile?: {
    name: string;
    url: string;
    mime?: string;
    size?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  reports?: WorkflowReport[];
  events?: WorkflowEvent[];
  contentManagerUrl?: string;
};

type ListResponse = {
  data: Submission[];
  metrics: Record<ReviewStatus, number>;
};

const QUEUES: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'reports_generated', label: 'Reports Generated' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

const KPI_LABELS: Array<{ value: ReviewStatus; label: string }> = [
  ...QUEUES,
];

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const statusLabel = (status?: string | null) => {
  if (!status) {
    return 'New';
  }

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const assetUrl = (url?: string | null) => {
  if (!url) {
    return null;
  }

  return url.startsWith('http') ? url : `${window.location.origin}${url}`;
};

const emptyMetrics = () =>
  KPI_LABELS.reduce(
    (acc, item) => ({
      ...acc,
      [item.value]: 0,
    }),
    {} as Record<ReviewStatus, number>
  );

const fullName = (submission: Submission) =>
  [submission.firstName, submission.lastName].filter(Boolean).join(' ') || 'Unnamed applicant';

const DofdReview = () => {
  const [selectedStatuses, setSelectedStatuses] = React.useState<ReviewStatus[]>([]);
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<Submission[]>([]);
  const [metrics, setMetrics] = React.useState<Record<ReviewStatus, number>>(emptyMetrics());
  const [selected, setSelected] = React.useState<Submission | null>(null);
  const [note, setNote] = React.useState('');
  const [isChangingDecision, setIsChangingDecision] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchList = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedStatuses.length) {
        params.set('status', selectedStatuses.join(','));
      }
      if (search.trim()) {
        params.set('q', search.trim());
      }

      const response = await fetch(`/api/review/submissions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Could not load submissions.');
      }

      const payload = (await response.json()) as ListResponse;
      setItems(payload.data || []);
      setMetrics({ ...emptyMetrics(), ...(payload.metrics || {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load submissions.');
    } finally {
      setLoading(false);
    }
  }, [selectedStatuses, search]);

  const fetchDetail = React.useCallback(async (documentId: string | null) => {
    if (!documentId) {
      setSelected(null);
      return;
    }

    setDetailLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/review/submissions/${documentId}`);
      if (!response.ok) {
        throw new Error('Could not load submission detail.');
      }

      const payload = (await response.json()) as { data: Submission };
      setSelected(payload.data);
      setNote(payload.data.decisionNote || '');
      setIsChangingDecision(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load submission detail.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  React.useEffect(() => {
    if (selected) {
      return;
    }
    const timer = setInterval(() => {
      fetchList();
    }, 15000);
    return () => clearInterval(timer);
  }, [selected, fetchList]);

  const selectedId = selected?.documentId || null;

  React.useEffect(() => {
    if (!selectedId) {
      return;
    }
    const timer = setInterval(() => {
      fetchDetail(selectedId);
    }, 7000);
    return () => clearInterval(timer);
  }, [selectedId, fetchDetail]);

  const recordDecision = async (decision: 'approved' | 'rejected') => {
    if (!selected) {
      return;
    }

    setDetailLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/review/submissions/${selected.documentId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          note,
          decidedBy: 'Strapi reviewer',
        }),
      });

      if (!response.ok) {
        throw new Error('Could not record decision.');
      }

      const payload = (await response.json()) as { data: Submission };
      setSelected(payload.data);
      setIsChangingDecision(false);
      await fetchList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record decision.');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleStatus = (status: ReviewStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    );
  };

  const openSubmission = (documentId: string) => {
    fetchDetail(documentId);
  };

  const closeDetail = () => {
    setSelected(null);
    setNote('');
    setIsChangingDecision(false);
  };

  const detailMode = Boolean(selected || detailLoading);

  return (
    <main className={`dofd-review ${detailMode ? 'dofd-review--detail-mode' : ''}`}>
      <header className="dofd-review__header">
        <div>
          <p className="dofd-review__eyebrow">Democracy of Dreams CRM</p>
          <h1>DofD Review Dashboard</h1>
          <p>Review submissions, generated workflow reports, timeline events, and final decisions.</p>
        </div>
        <a className="dofd-review__ghost-link" href="/admin/content-manager/collection-types/api::dreamer-submission.dreamer-submission">
          Open Content Manager
        </a>
      </header>

      {!detailMode ? (
        <>
          <section className="dofd-review__metrics" aria-label="Review metrics">
            {KPI_LABELS.map((item) => (
              <div key={item.value} className="dofd-review__metric">
                <span>{item.label}</span>
                <strong>{metrics[item.value] || 0}</strong>
              </div>
            ))}
          </section>

          <section className="dofd-review__overview">
            <div className="dofd-review__toolbar">
              <div className="dofd-review__chips" aria-label="Status filters">
                {QUEUES.map((item) => (
                  <button
                    key={item.value}
                    className={selectedStatuses.includes(item.value) ? 'is-active' : ''}
                    type="button"
                    onClick={() => toggleStatus(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
                {selectedStatuses.length ? (
                  <button className="dofd-review__chip-clear" type="button" onClick={() => setSelectedStatuses([])}>
                    Clear
                  </button>
                ) : null}
              </div>

              <input
                className="dofd-review__search"
                placeholder="Search name, startup, or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {loading ? <p className="dofd-review__muted">Loading submissions...</p> : null}
            {error ? <p className="dofd-review__error">{error}</p> : null}

            <div className="dofd-review__table-wrap">
              <table className="dofd-review__table">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Startup</th>
                    <th>Status</th>
                    <th>Yoxa</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.documentId} onClick={() => openSubmission(item.documentId)}>
                      <td>
                        <strong>{fullName(item)}</strong>
                        <span>{item.email}</span>
                      </td>
                      <td>
                        <strong>{item.startupName}</strong>
                        <span>{item.startupWebsite || 'No website'}</span>
                      </td>
                      <td>
                        <em className={`dofd-review__status dofd-review__status--${item.reviewStatus}`}>
                          {statusLabel(item.reviewStatus)}
                        </em>
                      </td>
                      <td>{statusLabel(item.yoxaTriggerStatus)}</td>
                      <td>{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length && !loading ? <p className="dofd-review__muted dofd-review__empty">No submissions match this view.</p> : null}
            </div>
          </section>
        </>
      ) : (
        <section className="dofd-review__detail" aria-label="Submission detail">
          <div className="dofd-review__detail-toolbar">
            <button className="dofd-review__ghost-link" type="button" onClick={closeDetail}>
              Back to applications
            </button>
            {selected?.contentManagerUrl ? (
              <a className="dofd-review__ghost-link" href={selected.contentManagerUrl}>
                Edit record
              </a>
            ) : null}
          </div>
          {detailLoading ? <p className="dofd-review__muted">Loading detail...</p> : null}

          {selected ? (
            <>
              <div className="dofd-review__detail-head">
                <div>
                  <span className={`dofd-review__status dofd-review__status--${selected.reviewStatus}`}>
                    {statusLabel(selected.reviewStatus)}
                  </span>
                  <h2>{selected.startupName}</h2>
                  <p>{fullName(selected)} · {selected.email}</p>
                </div>
              </div>

              <div className="dofd-review__grid">
                <article className="dofd-review__panel">
                  <h3>Dreamer Information</h3>
                  <dl>
                    <div><dt>Name</dt><dd>{fullName(selected)}</dd></div>
                    <div><dt>Email</dt><dd>{selected.email}</dd></div>
                    <div><dt>Profile</dt><dd>{selected.profileLink || 'Not provided'}</dd></div>
                    <div><dt>Referred by</dt><dd>{selected.referredBy || 'Not provided'}</dd></div>
                    <div><dt>Connection</dt><dd>{selected.connectionSources?.length ? selected.connectionSources.join(', ') : 'Not provided'}</dd></div>
                    <div><dt>Other source</dt><dd>{selected.otherSource || 'Not provided'}</dd></div>
                  </dl>
                  <h4>Founder background</h4>
                  <p>{selected.founderBackground || 'Not provided'}</p>
                </article>

                <article className="dofd-review__panel">
                  <h3>Startup Information</h3>
                  <dl>
                    <div><dt>Startup</dt><dd>{selected.startupName}</dd></div>
                    <div><dt>Website</dt><dd>{selected.startupWebsite || 'Not provided'}</dd></div>
                    <div><dt>Start date</dt><dd>{selected.startDate || 'Not provided'}</dd></div>
                    <div>
                      <dt>Source document</dt>
                      <dd>
                        {selected.supportingFile?.url ? (
                          <a href={assetUrl(selected.supportingFile.url) || '#'} target="_blank" rel="noreferrer">
                            {selected.supportingFile.name}
                          </a>
                        ) : (
                          'Not uploaded'
                        )}
                      </dd>
                    </div>
                    <div><dt>Submitted</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                  </dl>
                  <h4>Startup vision</h4>
                  <p>{selected.startupVision || 'Not provided'}</p>
                </article>

                <article className="dofd-review__panel">
                  <h3>Workflow State</h3>
                  <dl>
                    <div><dt>Submission ID</dt><dd>{selected.documentId}</dd></div>
                    <div><dt>Yoxa trigger</dt><dd>{statusLabel(selected.yoxaTriggerStatus)}</dd></div>
                    <div><dt>Workflow run</dt><dd>{selected.yoxaWorkflowRunId || 'Not returned'}</dd></div>
                    <div><dt>Latest output</dt><dd>{selected.latestOutputSummary || 'No output yet'}</dd></div>
                  </dl>
                  {selected.yoxaTriggerError ? (
                    <div className="dofd-review__failure">
                      <strong>Failure detail</strong>
                      <span>{selected.yoxaTriggerError.message || 'Unknown trigger error'}</span>
                      {selected.yoxaTriggerError.status ? <small>Status {selected.yoxaTriggerError.status}</small> : null}
                    </div>
                  ) : null}
                </article>
              </div>

              <article className="dofd-review__panel">
                <h3>Generated Reports</h3>
                <div className="dofd-review__reports">
                  {(selected.reports || []).map((report) => {
                    const href = assetUrl(report.file?.url);
                    return (
                      <a key={report.documentId} className="dofd-review__report" href={href || '#'} target="_blank" rel="noreferrer">
                        <span>{report.originalFilename || report.file?.name}</span>
                        <strong>{report.fileType.toUpperCase()}</strong>
                        <small>{formatDate(report.receivedAt)}</small>
                      </a>
                    );
                  })}
                  {!selected.reports?.length ? <p className="dofd-review__muted">No generated reports have been received yet.</p> : null}
                </div>
              </article>

              <article className="dofd-review__panel">
                <h3>Decision</h3>
                {selected.decision && !isChangingDecision ? (
                  <div className={`dofd-review__decision-card dofd-review__decision-card--${selected.decision}`}>
                    <span>{statusLabel(selected.decision)}</span>
                    <strong>
                      Decision recorded by {selected.decidedBy || 'reviewer'} on {formatDate(selected.decidedAt)}
                    </strong>
                    <p>{selected.decisionNote || 'No reviewer note was added.'}</p>
                    <button type="button" onClick={() => setIsChangingDecision(true)}>
                      Change Decision
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea
                      className="dofd-review__note"
                      placeholder="Optional reviewer note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <div className="dofd-review__actions">
                      <button className="dofd-review__approve" type="button" onClick={() => recordDecision('approved')}>
                        Approve
                      </button>
                      <button className="dofd-review__reject" type="button" onClick={() => recordDecision('rejected')}>
                        Reject
                      </button>
                    </div>
                  </>
                )}
              </article>

              <article className="dofd-review__panel">
                <h3>Timeline</h3>
                <ol className="dofd-review__timeline">
                  {(selected.events || []).map((event) => (
                    <li key={event.documentId}>
                      <strong>{statusLabel(event.eventType)}</strong>
                      <span>{event.summary || event.status || 'Workflow event'}</span>
                      <small>{formatDate(event.createdAt)}</small>
                    </li>
                  ))}
                </ol>
              </article>
            </>
          ) : null}
        </section>
      )}
    </main>
  );
};

export default DofdReview;
