const { newId } = require("./ids-internal.js");

// Enqueues the webhook delivery for a finalized job. Idempotent by design:
// webhook_deliveries has a unique index on job_id, so double finalization
// (duplicate reports, dispatcher races) can never create a second row.
// Call inside the same transaction that finalizes the job.
async function enqueueJobWebhook(tx, job) {
  if (!job.webhookUrl) return false;
  const result = await tx.webhookDelivery.createMany({
    data: [{ id: newId("whd"), jobId: job.id, url: job.webhookUrl }],
    skipDuplicates: true,
  });
  return result.count === 1;
}

module.exports = { enqueueJobWebhook };
