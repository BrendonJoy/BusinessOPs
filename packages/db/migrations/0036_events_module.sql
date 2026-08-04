-- Switch for the StaffOps surfaces: events, departments and rostering.
--
-- Defaults to FALSE, unlike every other module toggle, which default true.
-- Those were added to existing behaviour that customers already had; this
-- switches on a different product's screens, and no existing BusinessOps
-- customer should find an Events tab appear overnight.
--
-- This is the bridge until `company_products` exists. When it does, entitlement
-- ANDs with this flag rather than replacing it: the toggle stays the company's
-- own choice about what their staff see, and entitlement is what they have
-- paid for. Both have to be true, and the UI has to say which one is missing —
-- one is fixed with a checkbox, the other with a credit card.
alter table companies
  add column modules_events_enabled boolean not null default false;
