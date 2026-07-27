-- Free-text payment details (bank name, account name/number, etc.) shown on
-- every invoice. Free text rather than structured per-country fields --
-- see feature-backlog memory for the scope reasoning.

alter table companies add column payment_details text;
