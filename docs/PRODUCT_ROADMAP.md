# Tarmeez — Product Roadmap & Delivery Strategy

**Version:** 0.1  
**Status:** Draft for product-owner review  
**Product:** Tarmeez  
**Planning basis:** Current Product Vision and Product Scope  
**Team capacity:** 1 Frontend Developer, 1 Backend Developer, 1 Database Specialist  
**Scheduling approach:** Outcome-based; no calendar dates or duration estimates are assigned until technical validation and team capacity are assessed.

---

## 1. Purpose

This roadmap turns the Tarmeez Product Vision and Product Scope into an ordered delivery strategy.

It defines:

- The major workstreams and product capabilities.
- The sequence of delivery phases and the outcomes expected from each.
- Dependencies and validation gates that must be passed before later work begins.
- How the three-person development team can divide responsibilities.
- How releases should progress from internal validation to real merchant use.

This is a product-level roadmap, not a sprint plan or a detailed task backlog. Epics, user stories, and implementation tasks should be created after the relevant phase has passed discovery and planning.

## 2. Product Direction

Tarmeez is a commerce and marketing intelligence platform for merchants who already operate online stores.

The initial store platforms are:

- Salla
- Zid

A merchant connects an existing store to Tarmeez, connects relevant advertising accounts, and—where technically supported—installs Tarmeez tracking on the storefront.

Tarmeez then brings together three distinct data domains:

1. **Commerce data:** stores, products, customers, orders, payments, and other available store data from Salla or Zid.
2. **Advertising data:** campaigns, spend, impressions, clicks, and other available metrics from advertising providers.
3. **Behavioural data:** storefront events such as visits, product views, add-to-cart actions, and checkout steps, subject to platform capabilities and applicable consent requirements.

The product's central value is to connect these domains into a coherent view of business and marketing performance. It should help merchants understand what is happening, why it may be happening, and where they can take action.

### Product principles that guide this roadmap

- Integrate existing stores; do not build a new store-creation platform in the initial scope.
- Build a shared data model rather than separate analytics implementations for every provider.
- Treat Salla and Zid as separate integrations that share a common internal integration framework.
- Start with reliable data access, synchronization, and read-oriented analytics.
- Do not promise complete customer journeys or perfectly accurate attribution until the required event and identity links have been proven.
- Add store-management write operations only after their API support, permissions, and side effects are understood.
- Prefer a small, verifiable end-to-end capability over several incomplete modules.

## 3. Planning Assumptions and Constraints

The roadmap is based on the following known information:

- The initial team has three technical members: frontend, backend, and database.
- There is no separately identified QA engineer, DevOps engineer, product manager, or designer in the current team.
- Salla and Zid are the first intended commerce integrations.
- The exact API coverage, app-review requirements, authorization flows, webhook behaviour, rate limits, and storefront tracking options still require verification.
- Advertising providers have not yet been finalized.
- Data sources and detailed field mappings are intentionally not treated as confirmed until researched and tested.

### Implications for a three-person team

- Work should be prioritized sequentially, with only limited parallel development.
- Each phase should have one clear delivery outcome and an explicit acceptance gate.
- The team must reserve capacity for code review, integration testing, bug fixing, deployment, and technical documentation.
- QA, security review, release coordination, and operational ownership must be shared responsibilities until dedicated roles are added.
- The database specialist should participate in domain and data-contract design early, not only receive database tasks after implementation has started.
- Avoid developing Salla and Zid integrations simultaneously from day one. First establish and validate the shared integration contract, then deliver one complete pilot integration, and apply the proven approach to the second platform.
- The first pilot platform must be selected after comparing access to test stores, API coverage, app requirements, and the ability to validate the required merchant workflows. This roadmap does not assume which platform will be first.

## 4. Product Workstreams

Workstreams represent ongoing areas of responsibility. They are not necessarily separate teams; the same three people will contribute across them.

| Workstream                     | Responsibility                                                                       | Main outcomes                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Product & UX                   | Product flows, merchant experience, requirements, acceptance criteria                | Clear onboarding, connection, dashboard, and error-handling journeys          |
| Platform Foundation            | Application foundation, authentication, tenancy, authorization, security, operations | A secure and maintainable multi-tenant SaaS foundation                        |
| Commerce Integrations          | Salla and Zid applications, authorization, APIs, webhooks, synchronization           | Reliable and revocable connections to merchants' existing stores              |
| Data Platform                  | Canonical data model, ingestion, normalization, history, quality, reconciliation     | Consistent, traceable data across providers                                   |
| Analytics & Reporting          | Metrics, definitions, aggregation, dashboards, reporting                             | Trustworthy commerce and marketing performance views                          |
| Storefront Tracking            | Tracking installation, event collection, identity and session handling               | Validated behavioural event collection                                        |
| Marketing Integrations         | Advertising account authorization and data ingestion                                 | Unified advertising performance data                                          |
| Attribution & Customer Journey | Event-to-order and campaign-to-order analysis                                        | Explainable attribution and customer journey analysis with stated limitations |
| Intelligence & Automation      | Insights, alerts, recommendations, and later automation                              | Actionable guidance based on sufficiently reliable data                       |
| Quality & Operations           | Testing, observability, support, release, privacy, and incident handling             | Safe and supportable operation in real merchant environments                  |

## 5. Delivery Roadmap

The phases below are ordered by dependency. Some preparation can happen in parallel, but a later phase must not be treated as complete until its entry conditions and acceptance criteria are met.

### Phase 0 — Product and Integration Discovery

**Goal:** Replace assumptions about external platforms and data availability with verified technical facts.

**Scope:**

- Review the official Salla and Zid developer documentation.
- Determine the process for creating, configuring, testing, reviewing, and publishing an app or integration on each platform.
- Verify authorization flows, permission scopes, token lifecycle, revocation, and merchant installation experience.
- Identify the APIs and webhooks required for the initial commerce use cases.
- Verify pagination, rate limits, retry behaviour, event delivery guarantees, historical data access, and deletion or update behaviour.
- Obtain access to test stores or suitable sandboxes and perform small proof-of-concept requests.
- Investigate how a tracking script or SDK could be installed and maintained on each storefront.
- Identify candidate advertising providers and verify their authorization and reporting APIs.
- Identify privacy, consent, retention, and data-access obligations that need product and legal review.
- Define the first merchant pilot use cases and the first platform to integrate.

**Primary ownership:**

- Backend: API and authorization feasibility, webhook and synchronization proofs.
- Database: sample payload analysis, field mapping, data availability, and initial canonical-model proposal.
- Frontend: merchant connection-flow research, app installation UX, and onboarding prototype.
- Shared: product decisions, documentation, risks, and acceptance criteria.

**Deliverables:**

- Salla integration feasibility report.
- Zid integration feasibility report.
- Storefront tracking feasibility report for both platforms.
- Advertising-provider shortlist and feasibility notes.
- Initial canonical commerce data map.
- Open decisions and risk register.
- Selected first pilot platform, with documented reasons.

**Exit criteria / validation gate:**

- The team can demonstrate a real or sandbox authorization flow for the selected pilot platform, or has documented the exact blocker and an agreed alternative.
- Required data objects and access scopes are identified and supported by documentation or proof-of-concept results.
- Webhook and polling/synchronization options are understood well enough to design a reliable ingestion strategy.
- The tracking approach is classified as verified, unverified, or unsupported for each platform.
- No critical integration assumption is silently treated as a confirmed capability.

### Phase 1 — Platform Foundation

**Goal:** Establish the minimum secure platform needed to onboard merchants and build integrations.

**Scope:**

- Application environments and deployment workflow.
- Authentication and account lifecycle.
- Tenant/workspace model and strict tenant data isolation.
- User roles and permissions appropriate to the initial product.
- Merchant onboarding foundation.
- Integration connection records and provider-specific credential handling.
- Secure secrets storage, encryption strategy, and token lifecycle handling.
- Background job processing foundation for synchronization.
- Audit logging for important account and integration actions.
- Error handling, structured logs, basic monitoring, and operational health checks.
- Database migration and backup strategy.
- Automated checks in the development and release workflow.

**Primary ownership:**

- Frontend: authentication, onboarding shell, workspace navigation, connection-state UI.
- Backend: authentication APIs, tenant authorization, integration framework, job processing, security controls.
- Database: tenant-aware schema, constraints, indexes, migrations, backup and recovery design.
- Shared: environment setup, end-to-end checks, security review, and deployment verification.

**Deliverables:**

- A deployed application foundation.
- Working account and workspace flows.
- Enforced tenant isolation.
- A reusable integration connection model.
- Background job and observability foundation.
- Documented development, deployment, and recovery procedures.

**Exit criteria / validation gate:**

- Users from one workspace cannot access another workspace's data through the API.
- Authentication and authorization checks are covered by automated tests.
- Integration credentials are not exposed to the browser or ordinary application logs.
- A background job can be queued, processed, retried safely, and observed.
- Database changes are managed through a documented migration process.
- The team can deploy and verify the application in a repeatable way.

### Phase 2 — Shared Commerce Integration Framework and First Pilot

**Goal:** Connect one real merchant store end to end using a reusable integration architecture.

**Scope:**

- Implement the selected platform's app/integration setup.
- Complete merchant authorization and connection lifecycle.
- Handle token storage, refresh where applicable, expiry, revocation, and reconnection.
- Implement the first agreed read-oriented API integrations.
- Receive and validate relevant webhooks where available.
- Build initial synchronization jobs, pagination, retries, rate-limit handling, and idempotency.
- Record synchronization status, last successful sync, and actionable errors.
- Provide merchant-facing connection and sync status screens.
- Support disconnecting a store and handling the associated credentials and data according to the product's retention policy.

**Important architecture rule:**

Provider-specific API details should remain inside provider adapters. Shared application services should operate on normalized internal contracts wherever practical. Do not force Salla and Zid into identical assumptions where their actual behaviour differs.

**Primary ownership:**

- Backend: provider adapter, authorization, API clients, webhook endpoints, sync orchestration.
- Database: integration state, raw/landing data strategy where needed, normalized entities, uniqueness and idempotency constraints.
- Frontend: connect/disconnect flow, permission explanation, connection status, sync status, error and recovery states.

**Deliverables:**

- One working pilot-platform integration.
- A documented provider adapter contract.
- Initial commerce data ingestion.
- Merchant-visible connection and synchronization status.
- Integration tests using sandbox or controlled test data.

**Exit criteria / validation gate:**

- A test merchant can connect and disconnect a store.
- The system can retrieve the agreed initial data set.
- Repeated webhook deliveries or synchronization attempts do not create duplicate business records.
- Transient failures can be retried without corrupting data.
- Token expiry, revocation, and reconnection behaviour are tested or explicitly documented as unresolved.
- Data freshness and synchronization errors are visible to the merchant or support team.

### Phase 3 — Canonical Commerce Data and Second Store Integration

**Goal:** Establish consistent commerce data across both initial platforms.

**Scope:**

- Review and refine the canonical model using actual payloads from the first integration.
- Map the equivalent supported objects from the second platform.
- Implement the second platform as an independent provider adapter.
- Normalize provider-specific statuses, identifiers, currencies, timestamps, and relationships without discarding original provider references.
- Define how updates, cancellations, refunds, deleted records, and historical backfills are handled where supported.
- Add synchronization reconciliation and data-quality checks.
- Document field-level differences and unsupported fields between providers.

**Primary ownership:**

- Backend: second provider adapter, normalization services, reconciliation workflows.
- Database: canonical model, migrations, data-quality rules, indexes, and historical data strategy.
- Frontend: unified store connection management and platform-aware status/error presentation.

**Deliverables:**

- Salla and Zid connection paths, subject to successful platform approval and access.
- Shared normalized commerce data model.
- Provider mapping documentation.
- Reconciliation and data-quality reporting.

**Exit criteria / validation gate:**

- Test merchants can connect each supported platform through its verified flow.
- The same supported business concepts are represented consistently in the internal model.
- Provider-specific differences remain traceable.
- Synchronization and reconciliation tests cover create/update and relevant exceptional cases.
- The team can identify incomplete, stale, or failed data rather than silently presenting it as complete.

### Phase 4 — Commerce Analytics and Initial Merchant Dashboards

**Goal:** Turn synchronized commerce data into useful, explainable merchant reporting.

**Scope:**

- Agree on metric definitions before implementing dashboard calculations.
- Build initial sales, order, product, and customer reporting based only on available and validated fields.
- Define time zones, currency handling, date boundaries, refunds, cancellations, and order-status treatment.
- Build aggregation and query strategies appropriate to expected data volume.
- Provide date filters and clear loading, empty, partial-data, and error states.
- Show data freshness and explain metric definitions where ambiguity could mislead users.
- Validate dashboard totals against source-platform reports using controlled test cases.

**Primary ownership:**

- Frontend: dashboard layouts, charts/tables, filters, drill-downs, and data-state UX.
- Backend: analytics endpoints, metric calculation rules, access control, caching where justified.
- Database: analytical query design, aggregation strategy, indexes, and reconciliation against source records.

**Deliverables:**

- Initial commerce analytics dashboard.
- Agreed metric dictionary.
- Test cases comparing Tarmeez calculations with source data.
- Documented known differences and limitations.

**Exit criteria / validation gate:**

- Each displayed metric has a documented definition and source.
- Totals reconcile with source data for agreed test scenarios, with differences explained.
- Time zone, currency, refund, and cancellation rules are tested.
- Partial or stale data is not presented as complete without an indication.
- Dashboard access respects tenant boundaries.

### Phase 5 — Storefront Tracking and Behavioural Data

**Goal:** Prove that Tarmeez can collect useful storefront events reliably and responsibly.

**Scope:**

- Finalize the tracking feasibility results for Salla and Zid.
- Define an event taxonomy and versioned event schema.
- Implement the tracking script/SDK delivery and installation method supported by each platform.
- Collect an initial event set, subject to technical feasibility, such as page view, product view, add to cart, and checkout progression.
- Define session handling, event timestamps, deduplication, and anonymous identifiers.
- Define how consent choices affect collection and how consent state is represented.
- Establish event validation, ingestion limits, abuse protection, and retention rules.
- Provide internal diagnostics to verify that events are arriving and being associated with the correct store.

**Primary ownership:**

- Backend: event ingestion endpoint, validation, rate limiting, event processing, and diagnostics APIs.
- Database: event schema, storage strategy, partitioning/retention assessment, and query patterns.
- Frontend: merchant setup instructions, tracking status UI, and any storefront-facing integration code assigned to the frontend role.

**Deliverables:**

- Versioned event specification.
- Working tracking proof for each platform where supported.
- Event ingestion and validation pipeline.
- Tracking installation and troubleshooting guide.
- Consent and retention decisions documented.

**Exit criteria / validation gate:**

- Events can be captured on a controlled storefront and attributed to the correct Tarmeez store.
- Duplicate, malformed, delayed, and out-of-order events are handled deliberately.
- The team can diagnose whether tracking is installed and receiving events.
- Consent behaviour and data retention are documented and tested.
- Unsupported events or platform limitations are clearly stated.

### Phase 6 — Advertising Integrations

**Goal:** Bring advertising performance data into the same reporting foundation as commerce data.

**Scope:**

- Select the first advertising provider based on target-merchant demand and verified API feasibility.
- Implement account authorization, permissions, token lifecycle, and disconnect flows.
- Ingest agreed account, campaign, ad group/ad set, ad, and performance data where supported.
- Handle reporting windows, attribution settings returned by the provider, currencies, time zones, and data restatements.
- Build scheduled synchronization, retries, rate-limit handling, and data freshness monitoring.
- Add merchant-facing advertising account and sync status screens.

**Primary ownership:**

- Backend: advertising provider adapter, authorization, reporting ingestion, and sync orchestration.
- Database: advertising entities, metric storage, dimensional mapping, and historical data strategy.
- Frontend: account connection, campaign reporting views, filters, and sync status.

**Deliverables:**

- First verified advertising integration.
- Normalized advertising data model.
- Campaign performance reporting.
- Provider-specific metric definitions and limitations.

**Exit criteria / validation gate:**

- A test advertising account can be connected and disconnected.
- The agreed reporting data can be retrieved and refreshed.
- Provider metrics preserve their original meaning and attribution settings.
- Currency, time zone, and reporting-window behaviour are tested.
- Data freshness and API errors are observable.

### Phase 7 — Attribution and Customer Journey

**Goal:** Connect behavioural, commerce, and advertising data to produce useful, explainable analysis.

**Prerequisites:**

- Commerce synchronization is reliable.
- Storefront event collection has been validated for the relevant platforms.
- At least one advertising integration is working.
- Identity, session, consent, and data-retention rules have been reviewed.

**Scope:**

- Define the supported identity and event-to-order linking approach.
- Define attribution models and the meaning of each report.
- Connect eligible sessions/events to orders using only available and permitted identifiers.
- Build initial journey and conversion-funnel reporting.
- Compare advertising-reported conversions with Tarmeez-observed conversions without assuming they should match.
- Explain missing identifiers, consent restrictions, cross-device limitations, browser restrictions, and other sources of attribution uncertainty.
- Provide diagnostics for unmatched events and orders.

**Primary ownership:**

- Backend: identity resolution rules, attribution processing, and analytics APIs.
- Database: event/order relationship model, attribution facts, and query performance.
- Frontend: journey visualization, funnel reports, attribution comparisons, and explanatory UI.

**Deliverables:**

- Documented attribution methodology.
- Initial customer journey and funnel views.
- Initial campaign-to-order analysis where data supports it.
- Known-limitations documentation.

**Exit criteria / validation gate:**

- Attribution results can be explained and reproduced from underlying data.
- The product distinguishes observed facts from modeled or inferred results.
- Unmatched and unavailable data is represented honestly.
- Consent and identity rules are enforced.
- Marketing claims do not imply complete or guaranteed attribution.

### Phase 8 — Insights, Alerts, and Recommendations

**Goal:** Help merchants interpret the data and identify actions worth investigating.

**Scope:**

- Start with deterministic, explainable rules based on validated metrics.
- Add alerts for meaningful changes, anomalies, and operational data problems.
- Provide recommendations with evidence, context, and clear limitations.
- Track whether an insight was viewed or acted upon where useful.
- Evaluate AI-assisted summaries only after data quality and metric definitions are stable.
- Keep generated explanations grounded in accessible data and avoid presenting guesses as facts.

**Primary ownership:**

- Backend: insight rules, alert generation, notification services, and later AI orchestration.
- Database: historical baselines, insight records, alert state, and evaluation data.
- Frontend: insight feed, alert management, explanations, and action links.

**Deliverables:**

- Initial rules-based insight and alert system.
- Evidence-linked recommendations.
- Evaluation criteria for usefulness and false-positive rates.

**Exit criteria / validation gate:**

- Each insight is traceable to the data and rule that generated it.
- Alerts have defined thresholds, deduplication, and lifecycle behaviour.
- False positives and missed cases can be reviewed.
- AI-generated content, if introduced, is clearly distinguished from measured facts and can be checked against source data.

### Phase 9 — Expanded Store Operations and Automation

**Goal:** Introduce selected actions in connected stores only when they are safe, supported, and valuable.

**Scope:**

- Identify high-value merchant actions that are supported by both platform APIs and permissions.
- Validate write scopes and the side effects of each operation.
- Design confirmation, authorization, audit, retry, and failure-recovery behaviour.
- Start with a narrow operation set rather than attempting to reproduce the full store administration experience.
- Consider automation only after the equivalent manual action is reliable and auditable.

**Possible areas for later evaluation:**

- Product or inventory updates.
- Order-related operations.
- Customer-related operations.
- Other supported store workflows.

These are candidates for investigation, not confirmed commitments.

**Primary ownership:**

- Backend: write-operation services, authorization, idempotency, audit, and recovery.
- Database: operation records, audit history, and consistency constraints.
- Frontend: action controls, previews, confirmations, permissions, and result states.

**Exit criteria / validation gate:**

- Each operation is verified against the relevant provider API and permissions.
- Side effects and failure cases are documented.
- Duplicate requests cannot accidentally repeat a non-idempotent action.
- Merchant confirmation and audit history are available where appropriate.
- The operation has passed controlled testing before production availability.

## 6. Milestones

Milestones are outcome-based and do not imply fixed dates.

| Milestone                                   | Expected outcome                                                               | Evidence required                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| M0 — Feasibility Established                | Critical platform and data assumptions have been investigated                  | Discovery reports, proof-of-concepts, open-decision register            |
| M1 — Platform Foundation Ready              | Secure multi-tenant application foundation is deployable                       | Tenant-isolation tests, auth tests, deployment and recovery checks      |
| M2 — First Store Connected                  | A pilot merchant can connect one supported store and synchronize agreed data   | Successful connection, sync logs, integration tests, merchant status UI |
| M3 — Both Initial Store Platforms Supported | Salla and Zid have validated connection and data-ingestion paths               | Platform-specific tests, normalized mappings, reconciliation evidence   |
| M4 — Commerce Analytics Validated           | Initial merchant reporting reconciles against controlled source data           | Metric dictionary and comparison test results                           |
| M5 — Tracking Validated                     | Supported storefront events are collected and diagnosed reliably               | Event tests, installation guide, consent and retention decisions        |
| M6 — Advertising Data Available             | At least one selected advertising provider is connected and reporting          | Account connection tests, metric definitions, sync evidence             |
| M7 — Attribution Explainable                | Initial journey and attribution reports are reproducible and clearly qualified | Methodology, traceable test cases, limitations documentation            |
| M8 — Insights Operational                   | Initial insights and alerts are evidence-based and reviewable                  | Rule definitions, alert tests, false-positive review                    |
| M9 — Selected Store Actions Safe            | Selected write operations are controlled, auditable, and tested                | API verification, permission tests, idempotency and recovery tests      |

A milestone should be marked complete only when its evidence is reviewed—not merely when implementation is merged.

## 7. Dependencies and Critical Path

The main dependency chain is:

1. **Discovery** establishes what external platforms actually allow.
2. **Platform foundation** provides tenancy, security, credentials, and job processing.
3. **Commerce integration** supplies trusted store data.
4. **Canonical data and reconciliation** make cross-platform reporting possible.
5. **Commerce analytics** proves that the data is useful and correctly interpreted.
6. **Tracking and advertising integrations** add behavioural and campaign data.
7. **Attribution** depends on all relevant data sources and identity rules.
8. **Insights and automation** depend on stable definitions, data quality, and reliable processing.

### Work that can partially overlap

- Frontend onboarding prototypes can progress while backend integration feasibility is investigated.
- Canonical data-model design can progress alongside API payload discovery, but should be revised against real payloads before it is treated as stable.
- Deployment and observability foundations can be built while the first provider integration is being designed.
- Advertising-provider discovery can happen before commerce analytics is complete, but production integration should be prioritized against actual merchant needs and team capacity.

### Work that should not be pulled forward

- Do not build attribution dashboards before event capture and order linkage are proven.
- Do not build AI recommendations on top of unvalidated metrics.
- Do not implement broad store write operations before verifying API permissions and side effects.
- Do not treat webhook delivery as a complete substitute for reconciliation or historical synchronization.
- Do not assume that Salla and Zid expose identical data or storefront extension capabilities.

## 8. Responsibility Model for the Current Team

The role labels below indicate primary ownership, not isolated responsibility.

| Area                          | Frontend Developer             | Backend Developer                                 | Database Specialist                                       |
| ----------------------------- | ------------------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| Product flows and UX          | Primary implementation         | API and workflow input                            | Data and operational input                                |
| Authentication and onboarding | UI and client-side states      | Primary API and security ownership                | User, workspace, and permission schema                    |
| Store integrations            | Connection and sync UI         | Primary provider integration ownership            | Integration state and normalized data model               |
| Webhooks and background jobs  | Status and error UI            | Primary processing ownership                      | Idempotency, persistence, and query support               |
| Canonical data model          | Display and field requirements | Domain contract collaboration                     | Primary schema and data-quality ownership                 |
| Analytics                     | Dashboards and filters         | Metric APIs and calculation logic                 | Aggregation, indexes, and reconciliation                  |
| Tracking                      | Setup and diagnostic UI        | Ingestion and processing                          | Event storage and retention design                        |
| Advertising integrations      | Connection and reporting UI    | Primary provider integration ownership            | Advertising data model and metric storage                 |
| Attribution                   | Journey and report UI          | Linking and calculation services                  | Event/order relationship and analytical storage           |
| Insights and alerts           | Feed and notification UX       | Rules and service logic                           | History, state, and evaluation data                       |
| Quality and release           | UI tests and accessibility     | API/integration tests and deployment coordination | Migration, data integrity, backup, and performance checks |

### Shared responsibilities

Because there is no dedicated QA or DevOps role in the current team:

- Every developer tests their own work.
- The developer who did not implement a change should review it where practical.
- Backend and database changes must be tested together for migrations, constraints, and data integrity.
- Frontend and backend must agree on API contracts and error states before parallel implementation.
- The team collectively owns end-to-end regression testing and release approval.
- Production incidents, backups, monitoring, and rollback procedures need named ownership before the first merchant pilot.

The product owner should approve scope, priorities, acceptance criteria, and release decisions. Technical implementation details should be proposed and reviewed by the relevant developers.

## 9. Delivery and Work Management

### Work-item hierarchy

Use the following hierarchy:

- **Workstream:** A long-running product or technical domain.
- **Epic:** A significant outcome within a workstream.
- **Feature:** A user-visible or system capability.
- **User Story:** A testable user or system need.
- **Task:** A bounded implementation, testing, or documentation activity.

### Feature lifecycle

Each feature should pass through:

1. **Discovery:** Understand the user problem, external constraints, and unknowns.
2. **Planning:** Define scope, acceptance criteria, dependencies, and risks.
3. **Technical design:** Agree on API contracts, data changes, security, and failure behaviour.
4. **Implementation:** Build the feature in reviewable increments.
5. **Testing and QA:** Verify expected behaviour, edge cases, permissions, and regressions.
6. **Review and release:** Confirm evidence, documentation, monitoring, and rollback readiness.

### Suggested board states

`Backlog → Ready for Development → In Progress → Code Review → QA Testing → Ready for Release → Done`

A feature should not enter **Ready for Development** until it has:

- A clear business context and intended outcome.
- Defined acceptance criteria.
- Identified dependencies and external-platform assumptions.
- An agreed API/data contract where relevant.
- A testing approach.
- A clear owner.

### Work-in-progress guidance

For a three-person team:

- Keep one primary feature in active implementation at a time unless parallel work has clear independent contracts.
- Avoid assigning all three people to unrelated features that create integration work later.
- Prefer vertical slices that include UI, API, and database changes and can be tested end to end.
- Reserve explicit capacity for defects, integration work, and operational tasks.
- Re-plan when external platform access or review blocks progress; do not hide blocked work as active development.

A two-week sprint may be used if it fits the team's working rhythm, but sprint length should be confirmed by the team. It is not a product assumption or a delivery promise.

## 10. Release Strategy

Use progressive releases to reduce risk.

### Internal Alpha

Audience: development team and controlled test accounts.

Requirements:

- Core platform foundation is stable.
- Test data and integration flows are repeatable.
- Errors and synchronization status are observable.
- Critical tenant-isolation and security checks pass.

### Design-Partner / Private Beta

Audience: a small number of selected merchants who agree to provide feedback.

Requirements:

- At least one store integration has passed its validation gate.
- Merchant onboarding and connection recovery are usable.
- Data freshness and known limitations are visible.
- Support and incident-handling responsibilities are assigned.
- Data collection, consent, and retention decisions have been reviewed.
- The team can reconcile reported values against source data.

The decision to include both Salla and Zid in the first private beta should depend on their integration readiness. Do not delay all merchant learning if one integration is validated and the other is still blocked, but clearly communicate the supported-platform limitation.

### Public Release

Requirements should be agreed before the release decision. At minimum:

- The publicly advertised integrations have passed their platform-specific validation.
- Core metrics have documented definitions and tested accuracy.
- Security, tenant isolation, privacy, and operational checks have passed.
- Support, monitoring, backups, and incident response are ready.
- Onboarding, help content, limitations, and service expectations are clear.
- There are no unresolved critical defects affecting merchant data integrity or access control.

## 11. Quality, Security, and Operational Requirements

These requirements apply across all phases:

- Enforce tenant isolation at the API and data-access layers.
- Validate external API and webhook payloads; never trust provider input blindly.
- Protect credentials and avoid exposing tokens in client code, logs, or error messages.
- Use idempotency for webhook processing and retryable background jobs.
- Make synchronization state, failures, and data freshness observable.
- Preserve provider identifiers and enough source context to investigate discrepancies.
- Use database migrations with review and rollback/recovery planning.
- Test authorization, permission boundaries, and disconnect/revocation flows.
- Define data retention, deletion, and backup policies before handling production merchant data.
- Distinguish source-reported metrics from Tarmeez-calculated metrics.
- Test empty, partial, stale, delayed, duplicated, and malformed data scenarios.
- Maintain a record of known limitations and operational incidents.

## 12. Open Decisions and Validation Register

The following items remain open. They should be resolved in the relevant phase rather than filled with assumptions.

| Decision / unknown                                                      | Why it matters                                                | Target phase                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Exact Salla app creation, review, approval, and publishing requirements | Determines integration delivery and release dependencies      | Phase 0                                   |
| Exact Zid app creation, review, approval, and publishing requirements   | Determines integration delivery and release dependencies      | Phase 0                                   |
| API scopes and availability for required commerce objects               | Defines what Tarmeez can ingest and display                   | Phase 0                                   |
| Webhook coverage, delivery behaviour, and retry guarantees              | Determines event processing and reconciliation design         | Phase 0                                   |
| Historical data access and practical backfill limits                    | Affects merchant onboarding and reporting completeness        | Phase 0                                   |
| Rate limits and API pagination behaviour                                | Affects synchronization architecture and operating cost       | Phase 0                                   |
| Best first pilot platform                                               | Determines the first complete integration slice               | Phase 0                                   |
| Tracking installation mechanism on Salla and Zid                        | Determines whether and how behavioural data can be collected  | Phase 0 / Phase 5                         |
| Consent and privacy requirements for tracking and identity linking      | Determines collection, retention, and attribution behaviour   | Phase 0 / Phase 5                         |
| First advertising provider                                              | Determines the first marketing integration                    | Phase 0 / Phase 6                         |
| Required attribution model(s) and identity strategy                     | Determines what can be measured and how results are explained | Phase 7                                   |
| Expected merchant, event, and order volumes                             | Influences storage, aggregation, and scaling decisions        | Before detailed architecture is finalized |
| Production hosting, monitoring, backup, and recovery ownership          | Required for safe merchant pilots                             | Phase 1 / before Beta                     |
| Initial commercial packaging and pricing                                | Influences limits, onboarding, and release readiness          | Before Public Release                     |
| Which store write operations are worth supporting                       | Prevents unnecessary scope and unsafe actions                 | Phase 9                                   |

## 13. Risks and Mitigation

| Risk                                           | Potential impact                               | Mitigation                                                                      |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Platform API or app approval limitations       | Delayed or reduced integration capability      | Validate early with official documentation, sandbox tests, and platform support |
| Different data semantics between Salla and Zid | Incorrect unified reporting                    | Maintain provider mappings and explicit normalization rules                     |
| Missing or delayed webhooks                    | Stale or incomplete records                    | Combine webhooks with scheduled synchronization and reconciliation              |
| Tracking restrictions or consent limitations   | Incomplete behavioural data                    | Prove installation feasibility early and communicate coverage limits            |
| Inaccurate identity matching                   | Misleading journey and attribution reports     | Use conservative matching rules and expose uncertainty                          |
| Small team and competing workstreams           | Long cycle times and unfinished modules        | Limit work in progress and prioritize end-to-end slices                         |
| Analytics queries become expensive             | Slow dashboards and higher infrastructure cost | Measure actual workloads before adding aggregation or specialized storage       |
| Unclear metric definitions                     | Merchant distrust and inconsistent reports     | Maintain a metric dictionary and source reconciliation tests                    |
| Premature AI or automation work                | Unreliable recommendations or unsafe actions   | Require stable data and evidence-based validation first                         |

## 14. What Is Not Committed by This Roadmap

This roadmap does not yet commit to:

- A fixed public launch date or phase duration.
- A final technology architecture or database topology.
- A specific first platform between Salla and Zid.
- A specific advertising provider.
- Complete cross-device customer tracking or guaranteed attribution accuracy.
- Every possible commerce object or API operation.
- Full store administration inside Tarmeez.
- AI-driven automation before data quality and operational controls are established.

These decisions require evidence, product-owner approval, and—in some cases—technical or platform-provider validation.

## 15. Immediate Next Steps

The next planning cycle should focus on Phase 0 rather than beginning broad feature implementation.

1. Create a discovery epic for Salla and another for Zid.
2. Assign the backend developer to verify authorization, API, webhook, and synchronization feasibility.
3. Assign the database specialist to inspect representative payloads and draft the initial commerce data map.
4. Assign the frontend developer to map the merchant onboarding and store-connection experience, including platform-specific states.
5. Review the findings together and select the first pilot platform based on evidence.
6. Convert the validated Phase 0 scope into implementation-ready epics, stories, and tasks.
7. Revisit this roadmap after the first integration proof-of-concept and update priorities based on what was learned.

**The immediate success criterion is not the number of features started. It is proving that Tarmeez can securely connect a real existing store, ingest reliable data, and explain that data accurately.**
