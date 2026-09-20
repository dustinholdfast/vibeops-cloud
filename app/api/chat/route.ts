import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { createZai } from '@ai-sdk/zai';
import {
  compactWorkspace,
  copilotClientError,
  copilotSystemPrompt,
  COPILOT_BASE_URL,
  COPILOT_KEY_ENV,
  COPILOT_MODEL,
} from '@/src/lib/copilot';
import { copilotTools } from '@/src/lib/copilot-tools';
import { env } from '@/src/lib/env';
import { errorDetail, projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';
import { listProjects } from '@/src/db/project-service';
import { ProjectError } from '@/src/lib/project-validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function copilotModel() {
  const apiKey = env(COPILOT_KEY_ENV);
  if (!apiKey) {
    throw new ProjectError(
      503,
      'COPILOT_UNCONFIGURED',
      'The copilot is not configured. Add ZAI_API_KEY and reload.'
    );
  }
  return createZai({
    apiKey,
    baseURL: env('ZAI_BASE_URL') || COPILOT_BASE_URL,
  })(COPILOT_MODEL);
}

export async function GET(req: Request) {
  try {
    await requireScope(req);
    return Response.json({
      configured: Boolean(env(COPILOT_KEY_ENV)),
      model: COPILOT_MODEL,
      endpoint: env('ZAI_BASE_URL') || COPILOT_BASE_URL,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const scope = await requireScope(req);
    const body = (await req.json()) as { messages?: UIMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
    if (!messages.length) {
      throw new ProjectError(400, 'VALIDATION', 'Send a message to the copilot.');
    }

    const { projects } = await listProjects(scope);
    const result = streamText({
      model: copilotModel(),
      system: copilotSystemPrompt(scope.workspace.name, compactWorkspace(projects)),
      messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
      tools: copilotTools(scope),
      stopWhen: stepCountIs(6),
      onError({ error }) {
        console.error('[copilot] stream failed', errorDetail(error));
      },
    });

    return result.toUIMessageStreamResponse({
      onError: copilotClientError,
    });
  } catch (error) {
    console.error('[copilot] request failed', errorDetail(error));
    return projectErrorResponse(error, copilotClientError(error));
  }
}
