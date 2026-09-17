# DofD Strapi + Yoxa Architecture

## Implementation Layers

```mermaid
flowchart TD
  A["Content Types<br/>define database shape"] --> B["Custom API Controllers<br/>create/update/query records"]
  B --> C["Custom Admin View<br/>renders reviewer workflow"]
  C --> B

  B --> D["Yoxa Trigger<br/>send initial submission"]
  D --> E["Yoxa Workflow Runs"]
  E --> F["Yoxa Connector Calls Back"]
  F --> B
```


## Code-Level System Map

```mermaid
flowchart LR
  subgraph Frontend["frontend/"]
    Form["Static Dreamer Form<br/>index.html + styles.css"]
  end

  subgraph Backend["backend/ Strapi 5 App"]
    subgraph ContentTypes["Strapi Content Types"]
      DS["Dreamer Submission<br/>applicant + startup + Yoxa state"]
      WR["Workflow Report<br/>generated PDF/HTML files"]
      WE["Workflow Event<br/>timeline logs"]
      Upload["Upload Plugin / Media Library<br/>source docs + reports"]
    end

    subgraph PublicAPIs["Custom Public APIs"]
      SubmitAPI["POST /api/dreamer-submissions/submit"]
      ReportAPI["POST /api/yoxa-tools/reports"]
      OutputAPI["POST /api/yoxa-tools/workflow-output"]
    end

    subgraph ReviewAPIs["Custom Review APIs"]
      ListAPI["GET /api/review/submissions"]
      DetailAPI["GET /api/review/submissions/:documentId"]
      DecisionAPI["POST /api/review/submissions/:documentId/decision"]
    end

    AdminView["Custom Strapi Admin View<br/>DofD Review Dashboard<br/>React + TypeScript + CSS"]
  end

  Yoxa["Yoxa<br/>external workflow process"]

  Form -->|"multipart form data"| SubmitAPI
  SubmitAPI -->|"create record"| DS
  SubmitAPI -->|"store applicant file"| Upload
  SubmitAPI -->|"create timeline event"| WE
  SubmitAPI -->|"trigger_text + file"| Yoxa

  Yoxa -->|"generated PDF/HTML + submissionId"| ReportAPI
  ReportAPI -->|"create report record"| WR
  ReportAPI -->|"store generated file"| Upload
  ReportAPI -->|"create report_received event"| WE
  ReportAPI -->|"update reviewStatus"| DS

  Yoxa -->|"optional JSON callback"| OutputAPI
  OutputAPI -->|"create connector/output event"| WE
  OutputAPI -->|"update latest output fields"| DS

  AdminView --> ListAPI
  AdminView --> DetailAPI
  AdminView --> DecisionAPI

  ListAPI --> DS
  DetailAPI --> DS
  DetailAPI --> WR
  DetailAPI --> WE
  DecisionAPI --> DS
  DecisionAPI --> WE

  WR --> Upload
  DS --> Upload
```

## Code Locations

- Content types: `backend/src/api/*/content-types/*/schema.json`
- Public Yoxa/form APIs: `backend/src/api/dreamer-submission` and `backend/src/api/yoxa-tools`
- Review dashboard APIs: `backend/src/api/review`
- Custom Strapi admin screen: `backend/src/admin/pages/DofdReview.tsx`
- Dashboard styling: `backend/src/admin/pages/DofdReview.css`
