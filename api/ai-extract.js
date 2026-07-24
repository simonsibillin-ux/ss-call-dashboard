/**
 * SS Exterior Services — AI Quote Extraction Endpoint
 * POST /api/ai-extract
 *
 * Receives CSR conversation notes, calls the Anthropic API server-side,
 * validates the structured response, and returns clean extraction data.
 *
 * The Anthropic API key is read from the ANTHROPIC_API_KEY environment variable.
 * It is never exposed to the client.
 *
 * Deployment: Vercel serverless function.
 * Place this file at: /api/ai-extract.js  (Next.js pages/api or plain Vercel functions)
 *
 * If your project uses Next.js App Router, place at:
 *   /app/api/ai-extract/route.js  (see bottom of this file for App Router version)
 */

const { buildSystemPrompt, buildUserMessage } = require('./_buildPrompt');
const { validateExtraction, ValidationError } = require('./_validateExtraction');

// ─── Configuration ───────────────────────────────────────────────────────────

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const API_TIMEOUT_MS = 30000; // 30 seconds

// Rate limiting — simple in-memory store (resets on cold start)
// For an internal tool used by a small team, this is sufficient.
const rateLimitMap = new Map(); // ip → { count, windowStart }
const RATE_LIMIT_MAX = 30;      // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

const MAX_NOTES_LENGTH = 8000;   // characters
const MIN_NOTES_LENGTH = 10;     // characters

// ─── Main Handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — restrict to same origin in production
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://ss-exterior-crm.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'null' // file:// origin for local HTML testing
  ];
  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── API Key check ──────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ai-extract] ANTHROPIC_API_KEY environment variable is not set');
    return res.status(500).json({
      error: 'Server configuration error',
      userMessage: 'The AI service is not configured. Contact your system administrator.'
    });
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    console.warn(`[ai-extract] Rate limit exceeded for ${clientIp}`);
    return res.status(429).json({
      error: 'Too many requests',
      userMessage: 'Too many requests. Please wait a moment before trying again.'
    });
  }

  // ── Request validation ─────────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', userMessage: 'Invalid request format.' });
  }

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing request body', userMessage: 'Invalid request.' });
  }

  const { notes, previousNotes, existingExtraction, customerContext, propertyContext } = body;

  if (!notes || typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes field is required and must be a string', userMessage: 'Please enter some notes before analysing.' });
  }
  if (notes.trim().length < MIN_NOTES_LENGTH) {
    return res.status(400).json({ error: 'notes too short', userMessage: 'Please enter more detail before analysing.' });
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return res.status(400).json({ error: 'notes too long', userMessage: `Notes must be under ${MAX_NOTES_LENGTH} characters. Please split into multiple submissions.` });
  }
  if (previousNotes !== undefined && !Array.isArray(previousNotes)) {
    return res.status(400).json({ error: 'previousNotes must be an array', userMessage: 'Invalid request format.' });
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage({
    notes: notes.trim(),
    previousNotes: previousNotes || [],
    existingExtraction: existingExtraction || null,
    customerContext: customerContext || {},
    propertyContext: propertyContext || {}
  });

  // ── Call Anthropic API ─────────────────────────────────────────────────────
  let rawContent;
  try {
    rawContent = await callAnthropicWithTimeout({
      apiKey,
      model: MODEL,
      systemPrompt,
      userMessage,
      maxTokens: MAX_TOKENS,
      timeoutMs: API_TIMEOUT_MS
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      console.error('[ai-extract] Anthropic API timeout');
      return res.status(504).json({
        error: 'AI service timeout',
        userMessage: 'The AI service took too long to respond. Your notes have been preserved — please try again.'
      });
    }
    if (err.status === 401) {
      console.error('[ai-extract] Anthropic API authentication failed');
      return res.status(500).json({
        error: 'AI service authentication failed',
        userMessage: 'The AI service is not properly configured. Contact your administrator.'
      });
    }
    if (err.status === 529 || err.status === 503) {
      console.error('[ai-extract] Anthropic API overloaded');
      return res.status(503).json({
        error: 'AI service unavailable',
        userMessage: 'The AI service is temporarily unavailable. Please try again in a moment.'
      });
    }
    console.error('[ai-extract] Anthropic API error:', err.message || err);
    return res.status(502).json({
      error: 'AI service error',
      userMessage: 'The AI service encountered an error. Your notes have been preserved — please try again.'
    });
  }

  // ── Parse model response ───────────────────────────────────────────────────
  let parsed;
  try {
    parsed = parseModelResponse(rawContent);
  } catch (err) {
    console.error('[ai-extract] Failed to parse model response:', err.message);
    console.error('[ai-extract] Raw content sample:', rawContent?.substring(0, 500));
    return res.status(502).json({
      error: 'AI response parse error',
      userMessage: 'The AI returned an unexpected response format. Please try again.',
      debug: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
  }

  // ── Validate extraction ────────────────────────────────────────────────────
  let validatedResult, validationWarnings;
  try {
    ({ result: validatedResult, validationWarnings } = validateExtraction(parsed));
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error('[ai-extract] Validation error:', err.message, err.code);
      return res.status(502).json({
        error: 'AI response validation failed',
        code: err.code,
        userMessage: 'The AI returned data that could not be validated. Please try again.',
        debug: process.env.NODE_ENV !== 'production' ? err.message : undefined
      });
    }
    throw err;
  }

  if (validationWarnings.length > 0) {
    // Log warnings server-side (don't include customer data in logs)
    console.warn(`[ai-extract] Validation warnings (${validationWarnings.length}):`, validationWarnings);
  }

  // ── Return ─────────────────────────────────────────────────────────────────
  return res.status(200).json({
    success: true,
    extraction: validatedResult,
    validationWarnings,
    model: MODEL,
    // Include a readiness summary for the frontend
    summary: buildSummary(validatedResult)
  });
};

// ─── Anthropic API Call ───────────────────────────────────────────────────────

async function callAnthropicWithTimeout({ apiKey, model, systemPrompt, userMessage, maxTokens, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const err = new Error(`Anthropic API ${response.status}: ${errBody.substring(0, 200)}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();

    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Anthropic response had no content blocks');
    }

    const textBlock = data.content.find(b => b.type === 'text');
    if (!textBlock || !textBlock.text) {
      throw new Error('Anthropic response had no text content block');
    }

    return textBlock.text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseModelResponse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Model returned empty or non-string response');
  }

  const trimmed = text.trim();

  // Try direct JSON parse first
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // Try to find a JSON object in the response
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch (_) {}
  }

  throw new Error(`Could not extract valid JSON from model response. First 200 chars: ${trimmed.substring(0, 200)}`);
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count++;
  return true;
}

// ─── Summary Builder ──────────────────────────────────────────────────────────

function buildSummary(extraction) {
  const serviceCount = extraction.services.length;
  const readyCount = extraction.services.filter(s => s.readyForPricing).length;
  const totalMissingRequired = extraction.services.reduce(
    (sum, s) => sum + s.missingRequiredFields.length, 0
  );
  const hasEscalations = extraction.services.some(s => s.escalations.length > 0);

  return {
    servicesDetected: serviceCount,
    servicesReadyForPricing: readyCount,
    totalMissingRequiredFields: totalMissingRequired,
    hasEscalations,
    hasCustomerName: !!extraction.customer.name,
    hasSuburb: !!extraction.property.suburb
  };
}

/*
 * ─── NEXT.JS APP ROUTER VERSION ──────────────────────────────────────────────
 * If your project uses Next.js App Router (app/api/...), use this instead:
 *
 * import { NextResponse } from 'next/server';
 * // ... import your helpers ...
 *
 * export async function POST(request) {
 *   const body = await request.json();
 *   // ... same logic, return NextResponse.json({...}) ...
 * }
 *
 * export async function OPTIONS() {
 *   return new NextResponse(null, { status: 200 });
 * }
 */
