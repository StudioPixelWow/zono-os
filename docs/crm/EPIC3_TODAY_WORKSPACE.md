# Epic 3 — Today Workspace (Part 2)

Route: /today (BrokerTodayAgenda + BrokerIntelligenceQueuePanel + DailyOS). Services: daily-os, broker-intelligence (single shared priority queue; dismiss/snooze/complete lifecycle).

Status: Partial (pre-existing). It is a recommendation/agenda engine, not the itemized work-queue the spec defines (overdue tasks, SLA breaches, viewings today/awaiting-confirmation, offers awaiting/near-expiry, deals missing next action, missing docs, commissions awaiting approval, overdue collections, stale buyers/sellers, new matches). Next: source each category explicitly with a uniform item contract (entity, reason, severity, due, owner, primary/secondary action, link, snooze).
