/**
 * AI Video Provider Abstraction
 * -------------------------------------------------
 * Swap providers by setting API_PROVIDER env var.
 * Each provider implements:
 *   - createJob({ prompt, imageBase64, aspectRatio, duration }) → { jobId }
 *   - getStatus(jobId) → { status, videoUrl?, thumbnailUrl?, error? }
 *
 * Real endpoints differ per provider – replace the TODO sections
 * with the official API docs for Kling / Runway / Google Veo etc.
 */

const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const PROVIDER = process.env.API_PROVIDER || 'mock';
const API_KEY = process.env.API_KEY || '';
const API_BASE = process.env.API_BASE_URL || '';

/* ------------------------------------------------------------------ */
/*  MOCK provider – works offline for development / Railway testing   */
/* ------------------------------------------------------------------ */
const mockJobs = new Map(); // in-memory for demo

async function mockCreateJob({ prompt, aspectRatio, duration }) {
  const jobId = `mock_${uuidv4()}`;
  const createdAt = Date.now();
  mockJobs.set(jobId, {
    prompt,
    aspectRatio,
    duration,
    createdAt,
    // Simulate 8–15 second generation
    readyAt: createdAt + 8000 + Math.random() * 7000,
  });
  return { jobId };
}

async function mockGetStatus(jobId) {
  const job = mockJobs.get(jobId);
  if (!job) return { status: 'failed', error: 'Job not found' };

  if (Date.now() < job.readyAt) {
    return { status: 'processing' };
  }

  // Public domain sample video for demo
  return {
    status: 'completed',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
  };
}

/* ------------------------------------------------------------------ */
/*  KLING AI (example shape – replace with real endpoints)            */
/*  Docs: https://docs.kling.ai (check current API)                   */
/* ------------------------------------------------------------------ */
async function klingCreateJob({ prompt, imageBase64, aspectRatio, duration }) {
  // TODO: Replace with real Kling endpoint
  // Typical pattern:
  // POST https://api.kling.ai/v1/videos/generations
  // Headers: Authorization: Bearer <API_KEY>
  // Body: { prompt, image?, aspect_ratio, duration }

  const base = API_BASE || 'https://api.kling.ai';
  const res = await fetch(`${base}/v1/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      image: imageBase64 || undefined,
      aspect_ratio: aspectRatio,
      duration,
      // model: 'kling-v1' etc.
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling create failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  // Adjust path according to real response: data.task_id / data.id / data.job_id
  return { jobId: data.task_id || data.id || data.job_id };
}

async function klingGetStatus(jobId) {
  const base = API_BASE || 'https://api.kling.ai';
  const res = await fetch(`${base}/v1/videos/generations/${jobId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling status failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  // Map provider status → our status
  // Example: data.status === 'succeed' | 'processing' | 'failed'
  const statusMap = {
    succeed: 'completed',
    success: 'completed',
    completed: 'completed',
    processing: 'processing',
    pending: 'processing',
    failed: 'failed',
    error: 'failed',
  };

  const status = statusMap[data.status] || 'processing';
  return {
    status,
    videoUrl: data.video_url || data.output?.video_url || null,
    thumbnailUrl: data.thumbnail_url || null,
    error: data.error_message || data.error || null,
  };
}

/* ------------------------------------------------------------------ */
/*  RUNWAY (example)                                                  */
/* ------------------------------------------------------------------ */
async function runwayCreateJob({ prompt, imageBase64, aspectRatio, duration }) {
  // TODO: https://docs.runwayml.com
  const base = API_BASE || 'https://api.runwayml.com';
  const res = await fetch(`${base}/v1/image_to_video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      promptText: prompt,
      promptImage: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined,
      ratio: aspectRatio,
      duration,
    }),
  });

  if (!res.ok) throw new Error(`Runway create failed: ${res.status}`);
  const data = await res.json();
  return { jobId: data.id };
}

async function runwayGetStatus(jobId) {
  const base = API_BASE || 'https://api.runwayml.com';
  const res = await fetch(`${base}/v1/tasks/${jobId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`Runway status failed: ${res.status}`);
  const data = await res.json();

  const status =
    data.status === 'SUCCEEDED'
      ? 'completed'
      : data.status === 'FAILED'
        ? 'failed'
        : 'processing';

  return {
    status,
    videoUrl: data.output?.[0] || null,
    thumbnailUrl: null,
    error: data.failure || null,
  };
}

/* ------------------------------------------------------------------ */
/*  GOOGLE VEO (placeholder)                                          */
/* ------------------------------------------------------------------ */
async function veoCreateJob({ prompt, aspectRatio, duration }) {
  // TODO: Google Vertex AI / Veo API
  throw new Error('Veo provider not implemented – set API_PROVIDER=mock|kling|runway');
}

async function veoGetStatus() {
  throw new Error('Veo provider not implemented');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */
const providers = {
  mock: { create: mockCreateJob, status: mockGetStatus },
  kling: { create: klingCreateJob, status: klingGetStatus },
  runway: { create: runwayCreateJob, status: runwayGetStatus },
  veo: { create: veoCreateJob, status: veoGetStatus },
};

function getProvider() {
  const p = providers[PROVIDER];
  if (!p) throw new Error(`Unknown API_PROVIDER: ${PROVIDER}`);
  return p;
}

async function createGenerationJob(params) {
  return getProvider().create(params);
}

async function getGenerationStatus(jobId) {
  return getProvider().status(jobId);
}

module.exports = {
  createGenerationJob,
  getGenerationStatus,
  PROVIDER,
};
