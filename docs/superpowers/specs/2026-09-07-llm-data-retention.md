# LLM Provider Data Retention

**Date:** 2026-09-07
**Status:** closes the open dependency flagged in `privacy-architecture-diagram.md` ("Escolha
final do provedor de LLM" — the LLM box was left generic until a provider was locked).
**Audience:** whoever answers a hospital or cooperativa buyer's due-diligence questionnaire.

## TL;DR

1. **Groq — the provider Zelo runs on today — is the strongest of the three major API
   providers on retention, and the only one where zero data retention is self-serve.** It does
   not retain inference data by default, does not train on customer data, and an org admin can
   switch ZDR on from the console.
2. **Moving the acolhimento chat to Claude would be a downgrade on this axis** unless a ZDR
   agreement is negotiated first. Anthropic's default is 30-day retention and ZDR requires
   going through sales.
3. **The bigger exposure is not the provider — it is that Zelo's text is not reliably
   de-identified before it leaves the device.** See the next section. Fix that before the
   provider comparison matters.

## What Zelo actually sends

The privacy architecture diagram labels the LLM box "receives anonymized text only (FR-4)".
That is true in the sense that a redaction pass runs, and misleading if read as
"de-identified".

`apps/web/src/use-cases/anonymize-text.usecase.ts` applies four regex rules before the text
leaves the device: CRM number, email, phone, and a personal name **only** when it directly
follows a self-identification phrase (`sou o`, `me chamo`, `Dr.`, ...). Its own doc block is
honest about this: *"Heuristic, regex-based redaction — not NLP-based PII detection... a
deliberate, documented scope limit for the 28-day PoC."*

What that means in practice: a doctor writing

> "sou o único plantonista noturno da UTI pediátrica aqui e não aguento mais a escala"

has identified themselves to anyone who knows the hospital, and no rule fires. Free-text
mental-health disclosure is inherently re-identifiable from context — employer, shift
pattern, specialty, a described incident — and regex cannot reach that.

**Consequence for this document:** the content sent to the LLM should be treated as
sensitive health data about an identifiable person, not as anonymous text. Retention therefore
matters more than the diagram implies, not less. Two honest options before a sale:

- Strengthen de-identification (real PII detection, or a server-side pass), **or**
- Stop claiming de-identification and rely on provider retention controls + contract instead.

Claiming the first while shipping the second is the version that fails an audit.

## Provider comparison

| Provider | Trains on API data? | Default retention | Zero retention | How to get ZDR |
|---|---|---|---|---|
| **Groq** (current) | No | **None for inference by default**; up to 30 days only for troubleshooting / abuse investigation, opt-out available | Yes | **Self-serve** — org admin, Data Controls in the console |
| **Anthropic** | No, "never used for model training without your express permission" | **30 days** | Yes | **Sales negotiation**, per-organization; does not extend automatically to other orgs on the account |
| **OpenAI** | No, not by default | Abuse-monitoring logs 30 days; some endpoints keep state until deleted | Yes | **Approval + sales**; "subject to prior approval and acceptance of additional requirements" |
| **AWS Bedrock** | No | The cloud provider is the data processor — data stays in your AWS environment | n/a (different model) | Architectural: you own the account and region |
| **Google Vertex / Agent Platform** | No | Same — cloud provider is the data processor, data stays in your GCP environment | n/a (different model) | Architectural |
| **Self-hosted** (vLLM, Ollama, TGI) | No | Whatever you configure | Total | You run the weights; nothing leaves your infrastructure |

### Caveats that matter for a due-diligence answer

- **Anthropic ZDR has a trust-and-safety exception.** Even under ZDR, content flagged by
  automated trust-and-safety systems may be retained **up to 2 years**. A buyer will ask about
  this. Note that a mental-health chat is exactly the kind of content most likely to trip a
  safety classifier, so this exception is not hypothetical here.
- **Anthropic's "Covered Models" cannot use ZDR at all.** Claude Fable 5/5.1 and Mythos 5/5.1
  require 30-day retention wherever they are offered, and the API returns
  `400 invalid_request_error` if the org's retention config does not meet it. **Claude Haiku
  4.5 and Sonnet 5 — the models Zelo would actually use — are not Covered Models**, so ZDR is
  available for them. Model choice and retention posture are coupled; document the model, not
  just the vendor.
- **Anthropic offers self-serve HIPAA readiness** with a standard BAA, enabled in the Console.
  Brazil is LGPD, not HIPAA, so this is not directly required — but it is a concrete signal for
  an international or private-network buyer, and it is easier to obtain than ZDR.
- **Groq ZDR disables features needing persistence** (batch processing). Zelo uses neither.
- **Bedrock and Vertex are a different shape of answer**, not a better number. Anthropic's own
  docs state that on those platforms the cloud provider — not Anthropic — is the data
  processor. For a hospital buyer who already trusts AWS or GCP and has a DPA with them, that
  can be an easier conversation than any vendor-level ZDR promise.

## What this means for the Claude migration

Zelo is evaluating `claude-haiku-4-5` / `claude-sonnet-5` for the acolhimento chat on quality
and latency grounds. On retention specifically:

- Adopting Claude **without** a ZDR agreement moves Zelo from "provider retains nothing by
  default" to "provider retains for 30 days". That is a real regression, and it should be a
  conscious trade against whatever quality gain the measurement shows — not a side effect.
- Adopting Claude **with** ZDR gets back to roughly Groq's posture, minus the 2-year
  trust-and-safety exception, plus a sales cycle.
- If the measurement shows Claude is meaningfully better for the chat, the sequence is:
  negotiate ZDR first, then migrate. Not the reverse.

## Before Zelo is sold

1. **Decide the de-identification story** (strengthen it, or drop the claim). This outranks
   the provider choice.
2. **Turn on Groq ZDR now.** It is self-serve, free, and the app uses no feature that ZDR
   disables. There is no reason to be running without it.
3. **Update `privacy-architecture-diagram.md`** — replace the generic "LLM API" box with the
   real provider, and soften the "anonymized text only" label to match what the code does.
4. **Keep a signed DPA** with whichever provider ships, and keep this table current — these
   policies change, and every row here should be re-verified against the primary source before
   it goes into a buyer questionnaire.

## Sources

Verified 2026-09-07 against primary documentation:

- Groq — [Your Data in GroqCloud](https://console.groq.com/docs/your-data)
- Anthropic — [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- Anthropic — [Commercial data retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- OpenAI — [Your data](https://developers.openai.com/api/docs/guides/your-data)

Everything in the table above came from these pages, not from recollection. Re-verify before
reuse: provider retention terms change without notice, and a stale table in a compliance
answer is worse than no table.
