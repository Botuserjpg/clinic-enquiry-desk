# Evaluation report

Generated from the synthetic evaluation set. All messages are fictional. Labels are kept in a separate file and are not read by the triage code.

- Rows: **1,500**
- Seed: `20261030`
- Enquiries SHA-256: `50da75f7ea17801520afce25d056e309c8e60568c482cd3540fcfc2f12fd5ca6`
- Labels SHA-256: `1820bf1e23423be90be87d55589f82977cc932c6e621b590f4cbd807a362c86d`
- Exact category + priority accuracy: **91.9%** (95% bootstrap CI 90.4%–93.2%)
- Category accuracy: **95.6%**
- Priority accuracy: **92.9%**
- Emergency recall: **100.0%** (232/232)
- Emergency false positives: **50**
- Human-review rate: **40.8%**
- Classification latency: **30.0 ms** for the whole set (0.0200 ms per message)

## Per-category results

| Category | Expected | Predicted | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Appointments | 236 | 252 | 93.7% | 100.0% | 96.7% |
| Billing | 146 | 130 | 100.0% | 89.0% | 94.2% |
| Complaint / feedback | 140 | 140 | 100.0% | 100.0% | 100.0% |
| Emergency | 232 | 282 | 82.3% | 100.0% | 90.3% |
| General enquiry | 374 | 324 | 100.0% | 86.6% | 92.8% |
| Prescription refill | 218 | 218 | 100.0% | 100.0% | 100.0% |
| Test results | 154 | 154 | 100.0% | 100.0% | 100.0% |

## Per-edge-group results

| Group | Rows | Exact accuracy | Emergency recall | False positives |
| --- | ---: | ---: | ---: | ---: |
| appointment | 170 | 100.0% | n/a | 0 |
| billing | 98 | 100.0% | n/a | 0 |
| billing-error | 32 | 50.0% | n/a | 0 |
| borderline | 70 | 20.0% | n/a | 0 |
| complaint | 120 | 100.0% | n/a | 0 |
| emergency | 160 | 100.0% | 100.0% | 0 |
| faq | 100 | 100.0% | n/a | 0 |
| injection | 40 | 100.0% | 100.0% | 0 |
| lookalike | 50 | 0.0% | n/a | 50 |
| multilingual | 120 | 100.0% | n/a | 0 |
| negated | 60 | 100.0% | 100.0% | 0 |
| prescription | 170 | 100.0% | n/a | 0 |
| routine | 180 | 100.0% | n/a | 0 |
| test-results | 130 | 100.0% | n/a | 0 |

## Confusion matrix

| Expected \ Actual | Appointments | Billing | Complaint / feedback | Emergency | General enquiry | Prescription refill | Test results |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Appointments | 236 | 0 | 0 | 0 | 0 | 0 | 0 |
| Billing | 16 | 130 | 0 | 0 | 0 | 0 | 0 |
| Complaint / feedback | 0 | 0 | 140 | 0 | 0 | 0 | 0 |
| Emergency | 0 | 0 | 0 | 232 | 0 | 0 | 0 |
| General enquiry | 0 | 0 | 0 | 50 | 324 | 0 | 0 |
| Prescription refill | 0 | 0 | 0 | 0 | 0 | 218 | 0 |
| Test results | 0 | 0 | 0 | 0 | 0 | 0 | 154 |

## Ten worst errors and what changed

| # | Message | Expected | Actual | Analysis |
| ---: | --- | --- | --- | --- |
| 1 | I need a refund for a cancelled appointment. | Billing · Routine | Appointments · Routine | Category order or a missing synonym. The first configured category term wins. |
| 2 | Can I display a poster about overdose awareness? | General enquiry · Routine | Emergency · Emergency wording | Look-alike flagged as emergency. Accepted over-triage: extra human work is preferred to a missed emergency. |
| 3 | I have been vomiting all night. | General enquiry · Prompt review | General enquiry · Routine | Priority word missing from the configured prompt-review list. A human still reviews the message. |
| 4 | I have a bad headache that is getting worse. | General enquiry · Prompt review | General enquiry · Routine | Priority word missing from the configured prompt-review list. A human still reviews the message. |
| 5 | I have abdominal pain but it is mild. | General enquiry · Prompt review | General enquiry · Routine | Priority word missing from the configured prompt-review list. A human still reviews the message. |
| 6 | I feel dizzy when I stand up. | General enquiry · Prompt review | General enquiry · Routine | Priority word missing from the configured prompt-review list. A human still reviews the message. |
| 7 | Do you run first aid training for chest pain? | General enquiry · Routine | Emergency · Emergency wording | Look-alike flagged as emergency. Accepted over-triage: extra human work is preferred to a missed emergency. |
| 8 | My support group is discussing suicidal prevention. | General enquiry · Routine | Emergency · Emergency wording | Look-alike flagged as emergency. Accepted over-triage: extra human work is preferred to a missed emergency. |
| 9 | My child has a rash and is drowsy. | General enquiry · Prompt review | General enquiry · Routine | Priority word missing from the configured prompt-review list. A human still reviews the message. |
| 10 | I need a certificate for a first aid course on severe bleeding. | General enquiry · Routine | Emergency · Emergency wording | Look-alike flagged as emergency. Accepted over-triage: extra human work is preferred to a missed emergency. |

### Fixes attempted during the build

- Kept the literal red-flag scan ahead of every category rule so emergency recall cannot be traded away for accuracy.
- Added complaint routing to Practice Manager and a tone score that can raise review priority but never lower an emergency.
- Added language detection and an interpreter suggestion without auto-translating clinical content.
- Added injection-phrase evidence so adversarial text is visible to staff instead of silently changing the route.
- Documented the remaining category-order and clinical-urgency errors below rather than hiding them.

## Limitations

- The labels are synthetic and describe this prototype's intended behaviour, not clinical truth.
- The rule set is deliberately small. Borderline clinical urgency and category-order conflicts remain visible in the error table.
- Emergency recall is measured on messages labelled Emergency. A real deployment needs clinician-authored test cases, prospective monitoring and a clear escalation path.
- Latency is a local Python benchmark, not a production service-level measurement.
