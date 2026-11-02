# Tarmeez --- Product Scope

**Status:** Draft for product-owner review\
**Version:** 0.1\
**Related document:** [Product Vision](PRODUCT_VISION.md)

## 1. Scope statement

Tarmeez connects merchants' existing online stores and advertising
accounts, collects authorized commerce and marketing data, adds
first-party storefront behavioural tracking where supported, and unifies
these sources to provide analytics, customer-journey understanding,
attribution and decision support.

Store-management capabilities will expand gradually after read,
synchronization and analytics capabilities are reliable.

This document defines product scope at capability level. It is not a
technical specification, API contract, database design, sprint plan or
guarantee that every capability is available on every platform.

## 2. In-scope product areas

### 2.1 Merchant workspace and access

The product needs a secure workspace for each merchant or business.

Capability scope: - Merchant account and workspace access. - Connection
of supported stores, subject to product rules. - User roles and
permissions as required by the product. - Separation of each merchant's
data and connected credentials. - Visibility into connection and
synchronization status.

The detailed account model, roles, invitations and subscription
entitlements remain to be specified.

### 2.2 Commerce platform integrations

Initial commerce platforms: - Salla. - Zid.

For each platform, investigate and implement its supported integration
lifecycle: - Merchant discovers and connects Tarmeez through the
platform's supported app/integration process. - Authorization and
permission handling. - Secure credential handling. - Initial data
import. - Ongoing synchronization through validated APIs, webhooks or
other supported mechanisms. - Connection health, error visibility and
recovery. - Disconnection and handling of revoked or expired access. -
Platform-specific testing and required app review or publication.

Salla and Zid are separate integrations. Their permissions, API
behaviour, data models, installation processes and publication
requirements must be verified independently.

### 2.3 Commerce data

Tarmeez should retrieve and present commerce data made available by the
connected platform and authorized by the merchant.

Candidate data domains: - Orders and order line items. - Order statuses
and status changes. - Payments, refunds and cancellations where
available. - Products, variants and categories. - Inventory where
available. - Customers, subject to permissions and privacy
constraints. - Discounts and coupons where available. - Shipping
information where available. - Other store data only after availability
and product value are verified.

Exact fields remain undecided until platform research and integration
experiments are complete.

### 2.4 Advertising platform integrations

Merchants should be able to connect supported advertising accounts.

Potential platforms include: - Meta advertising. - TikTok advertising. -
Google advertising.

For each selected platform, investigate and implement authorization,
permissions, data retrieval, synchronization, disconnection and error
handling.

Candidate data includes accounts, campaigns, ad groups or equivalent
structures, ads or creatives where available, spend, impressions,
clicks, platform-reported conversions and available reporting
dimensions.

The initial supported advertising platforms and exact reporting fields
are not selected. Do not assume equivalent metrics or conversion data
across platforms.

### 2.5 Tarmeez storefront tracking

Tarmeez needs its own tracking capability to collect agreed storefront
events not supplied by commerce-platform data alone.

Candidate events: - Store visit and page view. - Traffic source and
campaign parameters when available. - Product view. - Store search. -
Add to cart and remove from cart. - Checkout initiation. - Purchase or
purchase confirmation where technically supportable. - Other meaningful
storefront interactions approved in the event specification.

Tracking discovery and validation must cover: - Supported installation
or activation mechanism for each commerce platform. - Event definitions
and required properties. - Session and visitor identifier strategy. -
Duplicate-event handling. - Purchase-event validation and reconciliation
with store orders. - Consent and privacy behaviour. - Browser
restrictions, blockers and event-loss monitoring. - Data retention and
deletion rules.

Do not describe tracking as complete or universal until real-store tests
demonstrate its coverage and limitations.

### 2.6 Unified data and analytics

Tarmeez should establish consistent relationships between: - Merchant
and connected store. - Store orders, products and customers. -
Storefront visits, sessions and events. - Advertising accounts,
campaigns and ads. - Conversions and the evidence used to associate them
with marketing activity.

Analytics capability areas: - Store and sales performance. - Order and
product performance. - Customer analysis where data permits. -
Advertising spend and campaign performance. - Commerce outcomes
alongside advertising activity. - Customer journeys and conversion
funnels. - Attribution using explicitly defined methodologies. -
Profitability analysis only when required cost, fee, refund and
financial inputs are available and sufficiently reliable.

Metric definitions must be documented. Reports should indicate relevant
periods, data freshness, coverage and calculation limitations.

### 2.7 Insights, alerts and automation

Product direction includes: - Performance alerts. - Detection of
meaningful changes or anomalies. - Recommendations supported by
available data. - AI-assisted explanations and insights. - Configurable
workflows and automation.

These capabilities depend on trustworthy underlying data and should be
scoped after analytics foundations are validated. Automated actions
require authorization, safeguards and auditability.

### 2.8 Progressive store management

Store management is in scope as a phased direction.

Initial direction: - Read, synchronize, monitor and analyse store data.

Later capabilities may include, where supported by platform APIs and
permissions: - Order operations. - Product and product-variant
operations. - Inventory updates. - Customer-related operations. - Other
merchant workflows selected through product discovery.

No write operation is committed until its API support, permissions, side
effects, failure handling and reconciliation behaviour have been
verified.

## 3. Phased product direction

This sequence expresses product intent, not fixed release dates or a
final sprint plan.

  -----------------------------------------------------------------------
  Phase                               Intended outcome
  ----------------------------------- -----------------------------------
  0\. Validation and definition       Confirm merchant needs, platform
                                      constraints, tracking feasibility,
                                      data requirements and first-release
                                      boundaries.

  1\. Product foundation              Establish merchant workspaces,
                                      access control, secure connections
                                      and operational foundations.

  2\. Commerce connectivity           Deliver and verify Salla and Zid
                                      connection and data synchronization
                                      capabilities.

  3\. Core commerce intelligence      Present reliable store data and
                                      foundational commerce analytics.

  4\. Advertising connectivity        Connect selected advertising
                                      platforms and retrieve their
                                      available data.

  5\. Storefront tracking             Deploy and validate Tarmeez
                                      tracking on supported storefronts.

  6\. Unified marketing intelligence  Connect commerce, advertising and
                                      behavioural data; deliver customer
                                      journeys and validated attribution.

  7\. Decision support                Add advanced insights, alerts,
                                      recommendations and carefully
                                      scoped automation.

  8\. Progressive store operations    Add supported write and management
                                      workflows incrementally.
  -----------------------------------------------------------------------

The sequence may change based on dependencies, merchant validation and
platform approval timelines. Attribution must not be treated as
deliverable before required data linkage has been demonstrated.

## 4. Proposed initial-release outcome --- not yet approved

The following is a proposal to evaluate, not an approved MVP
commitment: - A merchant can create and access a Tarmeez workspace. - A
merchant can connect a test store through a verified Salla or Zid
integration. - Tarmeez can import and synchronize an agreed, verified
subset of commerce data. - The merchant can see connection and
synchronization health. - Tarmeez can present a small set of commerce
metrics with documented definitions and verified calculations. -
Merchant data is isolated and connected credentials are protected. - The
integration can recover from expected failures and handle duplicate
events safely.

The product owner must decide whether the first public release must
support both Salla and Zid simultaneously, or whether one can be used
for an earlier controlled validation. This is an open release decision,
not a change to the intended support for both platforms.

Advertising integrations, full behavioural tracking, advanced
attribution, AI and store write operations should enter the MVP only if
discovery confirms their feasibility, necessity and readiness. Their
omission from an initial release does not remove them from the
longer-term direction.

## 5. Explicitly out of scope for the current direction

Unless the product owner changes the vision: - Creating, generating or
hosting new online stores. - Replacing Salla or Zid as the underlying
commerce platform. - Promising complete visibility into every visitor or
customer. - Promising deterministic attribution for every order. -
Reproducing every feature available in Salla, Zid or advertising
platforms. - Building every advertising integration at once. - Enabling
store write operations before support and safety are verified.

## 6. Cross-cutting product requirements

### Data integrity

-   Preserve source identifiers and source context.
-   Prevent duplicate ingestion and unsafe repeated processing.
-   Handle updates, late-arriving events and synchronization gaps.
-   Make data freshness and synchronization failures visible.
-   Define reconciliation between source records and Tarmeez records.

### Security and access

-   Isolate merchant data.
-   Protect access tokens, secrets and personal data.
-   Apply least-privilege permissions.
-   Record sensitive administrative and operational actions where
    appropriate.
-   Define secure disconnection and credential-revocation handling.

### Privacy and governance

-   Determine applicable consent requirements before activating
    tracking.
-   Define collection purpose, data minimization, retention and
    deletion.
-   Document treatment of personal and sensitive customer information.
-   Review applicable laws and platform policies for target markets.

### Reliability and usability

-   Communicate partial data, stale data and integration errors
    honestly.
-   Support safe retries and recovery.
-   Make metric definitions understandable.
-   Avoid presenting estimates as verified facts.
-   Provide useful empty, loading, error and partial-result states.

## 7. Dependencies and constraints

External platform capabilities and policies may affect: - Accessible
data fields. - Available operations. - App installation, review and
publication. - API quotas, rate limits and pagination. - Webhook
availability and delivery behaviour. - Advertising account permissions
and reporting windows. - Tracking installation options and browser
behaviour. - Consent, privacy and data-retention obligations.

A feature must not be committed for delivery until its critical
dependencies have been investigated and recorded.

## 8. Open decisions register

  -----------------------------------------------------------------------
  ID                      Open decision /         Evidence required
                          investigation           
  ----------------------- ----------------------- -----------------------
  O-01                    Salla app setup,        Current official
                          permissions, review and documentation and
                          publication             working test
                                                  integration

  O-02                    Zid app setup,          Current official
                          permissions, review and documentation and
                          publication             working test
                                                  integration

  O-03                    Commerce data fields    Field-level API review
                          available from each     and sample responses
                          platform                

  O-04                    Webhook coverage,       Official documentation
                          verification and retry  and controlled tests
                          behaviour               

  O-05                    Tracking installation   Working installation
                          mechanism for each      and real-store event
                          storefront              tests

  O-06                    Event taxonomy and      Approved tracking
                          visitor/session         specification and
                          identification          privacy review

  O-07                    Advertising platforms   Merchant needs, API
                          for the first release   access and
                                                  implementation
                                                  assessment

  O-08                    Attribution models and  Data-linkage
                          confidence/coverage     experiments and
                          presentation            approved metric
                                                  definitions

  O-09                    Revenue, net sales,     Business rules and
                          cost and profit         verified source fields
                          definitions             

  O-10                    First-release boundary  Product-owner decision
                          and release strategy    informed by validation

  O-11                    Subscription plans,     Business and market
                          limits and pricing      decisions

  O-12                    Target-market privacy   Appropriate legal or
                          and compliance          specialist review
                          obligations             
  -----------------------------------------------------------------------

For every investigation, record the source, date checked, result,
limitations and resulting product decision. Do not replace missing
evidence with assumptions.

## 9. Scope change control

Assess every proposed feature or change against: 1. The product vision
and merchant problem it addresses. 2. The users and workflows affected.
3. Required data and external platform capabilities. 4. Security,
privacy and operational implications. 5. Dependencies and impact on
existing commitments. 6. Acceptance criteria and how the outcome will be
verified. 7. Whether it belongs in the current release or a later phase.

The product owner approves product-scope changes. Technical leads advise
on feasibility and risks; project management coordinates delivery
impact.

## 10. Definition of scope readiness

A feature is ready to enter delivery planning only when: - Its user and
business outcome are clear. - Its boundaries and exclusions are
documented. - Required data and permissions are identified or explicitly
marked for validation. - External dependencies and risks are visible. -
Acceptance criteria can be tested. - The product owner has approved its
priority.

A feature is not delivered merely because code has been written. It must
satisfy its acceptance criteria and required integration, security and
quality checks.
