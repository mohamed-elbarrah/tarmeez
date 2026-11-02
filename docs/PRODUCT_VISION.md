# Tarmeez --- Product Vision

**Status:** Draft for product-owner review\
**Version:** 0.1

## 1. Vision

Tarmeez is a centralized commerce and marketing intelligence platform
for merchants who operate existing online stores on platforms such as
Salla and Zid.

A merchant connects their store and advertising accounts to Tarmeez.
Tarmeez combines authorized commerce data, advertising data, and
additional storefront behaviour collected through Tarmeez's own tracking
capability. It turns these sources into a coherent view of business
performance, customer journeys, marketing contribution and opportunities
to improve spending and operations.

Over time, Tarmeez will also support more store-management operations,
reducing the need to move between systems. This expansion will be
gradual and limited to operations that the relevant platform
integrations genuinely support.

## 2. Problem

Merchants work across disconnected systems: - Commerce platforms hold
orders, products, customers and other store information. - Advertising
platforms hold campaign, spend, impression, click and
reported-conversion information. - Storefront interactions provide
behavioural context that may not be available through commerce APIs.

Because these sources are separated, merchants can struggle to connect
marketing activity to store outcomes, understand customer journeys,
assess spending and make decisions using consistent information.

Tarmeez aims to bring these sources together.

## 3. Target users

**Primary user:** An online-store merchant or business owner who wants
to understand and improve commerce and marketing performance from one
platform.

**Additional users:** Team members who need access to specific workspace
areas, subject to roles and permissions defined during detailed product
design.

The initial product serves merchants with existing stores on supported
commerce platforms. Tarmeez is not initially a store-building platform.

## 4. Core product promise

A merchant should be able to: 1. Connect an existing Salla or Zid store
to their Tarmeez account. 2. Connect supported advertising accounts. 3.
Access the store and marketing data Tarmeez is authorized and
technically able to retrieve. 4. Add Tarmeez tracking to the storefront
to collect agreed behavioural events not otherwise available. 5.
Understand commerce performance, marketing performance and customer
journeys through connected data. 6. Use insights to make better-informed
decisions and improve business and marketing efficiency. 7. Gradually
perform supported store-management operations from Tarmeez.

Tarmeez must communicate data coverage and limitations honestly. It must
not imply that every customer, visit, conversion or advertising
interaction can always be identified or attributed.

## 5. Product pillars

### 5.1 Store connectivity and commerce data

Connect existing stores on supported platforms, obtain authorized store
data, synchronize changes and present a unified view of commerce
activity.

### 5.2 Advertising connectivity and marketing data

Allow merchants to connect supported advertising accounts and retrieve
campaign and performance data made available through the relevant
permissions and APIs.

### 5.3 First-party storefront tracking

Provide a Tarmeez tracking capability that can be installed or enabled
in supported storefronts. It collects product-approved behavioural
events, subject to technical feasibility, platform constraints, consent
and privacy requirements.

### 5.4 Unified analytics and attribution

Bring commerce, advertising and behavioural data together. Help
merchants analyse performance and understand the contribution of
marketing sources to customer journeys and conversions.

Attribution must identify its methodology and available evidence. It
must not be presented as certain when the underlying data is incomplete
or modelled.

### 5.5 Business insights and decision support

Turn connected data into understandable reports, comparisons, alerts and
recommendations. AI-assisted capabilities may be introduced where they
provide explainable and useful decision support.

### 5.6 Progressive store management

Expand from reading and analysing store data toward performing supported
store operations. Tarmeez is not required to reproduce every feature of
Salla or Zid.

## 6. Long-term direction

Tarmeez aims to become the merchant's central workspace for
understanding and progressively managing commerce and marketing activity
across connected systems.

Its value should come from the quality and relationships of its data,
not merely from copying separate dashboards into one interface.

## 7. Product principles

-   **Merchant value first:** Every capability should solve a meaningful
    merchant problem.
-   **Evidence before promises:** Validate platform capabilities, data
    access and tracking accuracy before committing to outcomes.
-   **One coherent business picture:** Use consistent definitions and
    relationships across commerce, advertising and behavioural data.
-   **Trust and transparency:** Show data freshness, coverage,
    limitations and calculation definitions where relevant.
-   **Secure by design:** Protect connected accounts, credentials and
    merchant data; isolate each merchant's information.
-   **Progressive scope:** Deliver a reliable foundation before
    expanding into advanced analytics, attribution, automation or store
    operations.
-   **Platform-aware integration:** Respect each platform's APIs,
    permissions, policies and technical limits.

## 8. What Tarmeez is not

At the initial stage, Tarmeez is not: - A platform for creating or
hosting new online stores. - A replacement commerce engine for Salla or
Zid. - A guarantee that every advertising conversion can be attributed
to a specific ad. - A promise to expose or modify data or settings that
connected platforms do not make available. - Merely a dashboard
duplicating the separate screens of other platforms.

## 9. Product success

Tarmeez succeeds when merchants can reliably connect their systems,
trust the data presented, understand commerce and marketing performance
more clearly, and use the information to make better decisions.

Measurable metrics, baselines and targets must be defined during product
planning and validated with merchants. This document assumes no
numerical targets.

## 10. Decisions requiring validation

These are not settled by the vision and must be investigated before
implementation commitments: - Exact Salla and Zid data fields,
permissions, API limits and webhook coverage. - App creation, testing,
review, approval and publication requirements for each commerce
platform. - Storefront installation mechanisms supported for Tarmeez
tracking. - Event taxonomy and achievable behavioural coverage. -
Consent, privacy, retention, deletion and compliance requirements in
target markets. - Supported advertising platforms, account permissions,
reporting fields and API restrictions. - Identity resolution and
attribution methodology, including browser, consent and identifier
limitations. - Definitions and data requirements for revenue, net sales,
costs, profit, refunds and fees. - First-release scope, packaging and
pricing.

Resolve these through official documentation, technical experiments and
appropriate specialist review. Do not fill gaps with assumptions.
