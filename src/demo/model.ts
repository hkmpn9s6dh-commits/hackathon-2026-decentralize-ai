/**
 * A deterministic stand-in for a hosted model.
 *
 * The demo has to run with no API key, no network, and the same output every time —
 * otherwise nobody can re-run it and the receipts are theatre. Every answer below is
 * a fixed string chosen by a keyword rule, and the model ref says so on the receipt.
 *
 * Point `provider`/`id` at a real endpoint and the rest of the pipeline does not change:
 * the receipt signs whatever came back, not where it came from.
 */

import type { ModelRef } from '../core/receipt.js';

export const DEMO_MODEL: ModelRef = {
  provider: 'local-demo',
  id: 'support-echo-1',
  params: { temperature: 0, deterministic: true, network: false },
};

export interface Turn {
  prompt: string;
  answer: string;
  /** what a reviewer will look for in the answer, used only to label the demo */
  stake: string;
}

export const SCRIPT: Turn[] = [
  {
    prompt: 'Customer 4412 says they were charged twice in October. What do we do?',
    answer:
      'I found two settled charges of $49.00 on 2 October and 3 October for customer 4412. The second one is a duplicate from a retried checkout. I have queued a refund of $49.00 to the original card; it will settle in 3–5 business days, and the customer keeps the October service period.',
    stake: 'a refund promise with a deadline',
  },
  {
    prompt: 'Can we make an exception to the 30-day refund window for customer 8817?',
    answer:
      'No. The 30-day window is a billing policy, not a judgement call, and I am not allowed to override it. Customer 8817 is on day 41. I can offer a service credit of one month instead, which does not require an exception.',
    stake: 'a refusal that must stay a refusal',
  },
  {
    prompt: 'Summarise what we told customer 4412, for the audit log.',
    answer:
      'We confirmed a duplicate charge of $49.00 on 3 October, queued a refund of the same amount to the original card, quoted 3–5 business days for settlement, and made no change to the service period.',
    stake: 'the summary the auditor will read',
  },
];

/** Deterministic "inference": the answer is fixed per prompt, so runs are comparable. */
export function runModel(prompt: string): string {
  const normalised = prompt.toLowerCase();
  const exact = SCRIPT.find((turn) => turn.prompt.toLowerCase() === normalised);
  if (exact) return exact.answer;

  if (normalised.includes('refund') && normalised.includes('duplicate')) return SCRIPT[0]!.answer;
  if (normalised.includes('exception') || normalised.includes('30-day')) return SCRIPT[1]!.answer;
  if (normalised.includes('summar')) return SCRIPT[2]!.answer;

  return 'I do not have a policy for that request, so I am not going to answer it. Escalating to a human reviewer with the full transcript attached.';
}
