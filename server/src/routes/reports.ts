import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { createAiContentReport } from '../utils/aiReportsStore.js';

const router = Router();

const REPORT_REASONS = [
  'hate_speech',
  'violence',
  'sexual_content',
  'harassment',
  'dangerous_advice',
  'false_information',
  'spam',
  'other',
] as const;

const createSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  description: z.string().max(4000).optional().nullable(),
  userPrompt: z.string().max(8000).optional().nullable(),
  aiResponse: z.string().min(1).max(20000),
  conversationId: z.string().max(200).optional().nullable(),
  messageId: z.string().max(200).optional().nullable(),
  modelUsed: z.string().max(120).optional().nullable(),
  chatMode: z.string().max(80).optional().nullable(),
  deviceInfo: z.string().max(1000).optional().nullable(),
  appVersion: z.string().max(40).optional().nullable(),
});

/** In-app AI content report — Google Play AI-Generated Content policy. */
router.post('/ai-reports', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid report',
        details: parse.error.flatten().fieldErrors,
      });
    }

    const body = parse.data;
    const report = await createAiContentReport({
      userId: req.userId || null,
      userEmail: req.userEmail || null,
      conversationId: body.conversationId,
      messageId: body.messageId,
      userPrompt: body.userPrompt,
      aiResponse: body.aiResponse,
      reason: body.reason,
      description: body.description,
      modelUsed: body.modelUsed,
      chatMode: body.chatMode,
      deviceInfo: body.deviceInfo,
      appVersion: body.appVersion,
    });

    return res.status(201).json({
      ok: true,
      id: report.id,
      reportNumber: report.report_number,
      message:
        "Thank you. Your report has been received. We'll review it.",
    });
  } catch (err) {
    console.error('AI report create failed:', err);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
