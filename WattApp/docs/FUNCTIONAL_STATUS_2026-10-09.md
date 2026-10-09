# Functional verification — 9 October 2026

Server deployment is deferred at the owner's request. No production database or provider configuration was changed.

## Completed in this pass

- Marketplace setup now applies the seller profile and seller portal migrations, fixing vendor creation's missing `seller_type` column.
- The isolated marketplace suite applies and reruns the seller migration. Coverage now includes duplicate seller applications, profile ownership, category validation, seller cookie login, foreign-origin rejection, suspension and logout.
- Production SMS and email can no longer silently succeed with missing provider configuration. Email authentication checks SMTP availability before accessing the database. Signup waits for email delivery; password-reset and email-login responses retain account-enumeration protection.
- OTPs use Node's cryptographically secure random generator. SMS requests and SMTP connections have timeouts.
- Charger application submission emits a deduplicated customer confirmation through the inbox, push and email channels. Removed obsolete app-side email placeholders; decision emails already run on the backend.
- Notification email text is HTML-escaped.

## Still needs external verification or product decisions

- Real SMS delivery, SMTP delivery, Thawani checkout/card permissions and real charger control/meter readings require configured accounts and hardware.
- Package charging commissioning, local safety cutoffs and native device regression remain required before enabling purchases.
- Package meter-flag reconciliation and partial refunds require an agreed correction/refund policy. Existing flows deliberately refuse unsafe clearing or partly used full refunds.
- Host payouts and marketplace settlements record manually completed bank transfers; automated bank payouts are not implemented.
- Fleet dispatch needs actual driver accounts and vans. Driver tracking is foreground-only.
- Signed device testing, push credentials and store submission remain outstanding.
- Production HTTPS API, database migration, routing service and scheduled jobs will be configured during deployment.

Run from `backend`: `npm run build`, `npm run test:delivery`, `npm run test:marketplace`, `npm run test:packages`. From the app root: `npm run typecheck`.
The integration suites use temporary PostgreSQL databases and simulated hardware, not production data or real devices.
