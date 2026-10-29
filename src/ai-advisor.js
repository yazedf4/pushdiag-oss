/**
 * PushDiag OSS — Deterministic Root-Cause Synthesizer & Optional OpenAI Remediation Suggestion Engine
 * Works 100% offline with zero dependencies using its built-in rule synthesizer,
 * and optionally connects to OpenAI Responses API when OPENAI_API_KEY is present.
 */

export function buildRemediationPlan(report) {
  const failedChecks = (report.checks || []).filter(c => c.status === 'fail');
  const warnings = (report.checks || []).filter(c => c.status === 'warn');

  const priorityOrder = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };
  const sortedFailures = [...failedChecks].sort(
    (a, b) => (priorityOrder[a.severity] || 9) - (priorityOrder[b.severity] || 9)
  );

  const rootCauseLayer = sortedFailures.length > 0 ? sortedFailures[0].layer || 'client-capabilities' : 'none';
  const steps = sortedFailures.map((item, idx) => ({
    step: idx + 1,
    checkId: item.id,
    layer: item.layer || 'client-capabilities',
    severity: item.severity || 'high',
    issue: item.message || `Check "${item.id}" failed.`,
    action: item.fix
  }));

  return {
    healthy: failedChecks.length === 0,
    rootCauseLayer,
    blockingFailures: failedChecks.length,
    warningsCount: warnings.length,
    prioritizedSteps: steps,
    codexPromptTemplate: steps.length > 0
      ? `Fix the following Web Push failures detected by PushDiag OSS:\n` +
        steps.map(s => `- [${s.layer}/${s.checkId}] ${s.issue} -> Fix: ${s.action}`).join('\n')
      : 'All Web Push diagnostic checks passed.'
  };
}

/**
 * Optional OpenAI API integration for patch suggestions. Never automatically applies generated changes.
 */
export async function requestOpenAiPatch({ report, apiKey = process.env.OPENAI_API_KEY, model = 'gpt-4o-mini' } = {}) {
  const plan = buildRemediationPlan(report);
  if (!apiKey) {
    return {
      mode: 'offline-deterministic',
      plan,
      note: 'Set OPENAI_API_KEY to enable live OpenAI-generated patch suggestions.'
    };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You are PushDiag OSS Advisor, an expert in RFC 8030, RFC 8291, RFC 8292 (VAPID), iOS Safari PWA Web Push, and Service Workers. Provide concise, copy-pasteable code patches.'
        },
        {
          role: 'user',
          content: plan.codexPromptTemplate
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API returned HTTP ${response.status}`);
  }
  const data = await response.json();
  return {
    mode: 'openai-live',
    model,
    plan,
    patchSuggestion: data.choices?.[0]?.message?.content || ''
  };
}
