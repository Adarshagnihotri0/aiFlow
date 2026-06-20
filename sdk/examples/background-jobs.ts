/**
 * Integration Example - Background job processing with tracing
 */

import { trace, sendTrace, autoTrace } from 'mcp-trace-sdk';

// Job processor with manual tracing
async function processJob(job: { id: string; type: string; data: any }) {
  const t = trace('job-processing', job.id, {
    jobType: job.type,
    jobId: job.id,
  });

  try {
    // Stage 1: Validation
    t.start('validation');
    await validateJob(job.data);
    t.end('validation');

    // Stage 2: Processing
    t.start('processing');
    const result = await executeJob(job.type, job.data);
    t.end('processing');

    // Stage 3: Cleanup
    t.start('cleanup');
    await cleanupJob(job.id);
    t.end('cleanup');

    // Send success trace
    const payload = t.complete();
    await sendTrace(payload);

    return result;
  } catch (error) {
    t.setError(error instanceof Error ? error.message : String(error));
    const payload = t.complete();
    await sendTrace(payload);
    throw error;
  }
}

// Auto-traced job processor (simpler)
const processJobSimple = autoTrace('job-processing', async (job: { id: string; data: any }) => {
  await validateJob(job.data);
  const result = await executeJob('default', job.data);
  await cleanupJob(job.id);
  return result;
});

// Helper functions (mock implementations)
async function validateJob(data: any) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (!data) throw new Error('Invalid job data');
}

async function executeJob(type: string, data: any) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { success: true, processedAt: new Date().toISOString() };
}

async function cleanupJob(jobId: string) {
  await new Promise((resolve) => setTimeout(resolve, 5));
  console.log(`Cleaned up job ${jobId}`);
}

// Example usage
console.log('Background Job Processor');
console.log('Set MCP_TRACE_ENDPOINT to configure trace destination');

setInterval(async () => {
  const job = {
    id: `job_${Date.now()}`,
    type: 'email',
    data: { to: 'user@example.com', subject: 'Test' },
  };

  try {
    console.log(`Processing job ${job.id}...`);
    const result = await processJob(job);
    console.log(`Job completed:`, result);
  } catch (error) {
    console.error(`Job failed:`, error);
  }
}, 5000);
