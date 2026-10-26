-- Preserve the received balance for invoices paid before the ledger fields existed.
UPDATE "CommercialInvoice"
SET "receivedCents" = "amountCents"
WHERE "status" = 'PAID' AND "receivedCents" = 0;
