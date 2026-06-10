To: Prof. Paris Avgeriou and Prof. David Shepherd
Editors-in-Chief, *Journal of Systems and Software*

Dear Editors-in-Chief,

I am submitting the manuscript **"Cross-Layer Observability for LLM-Assisted Test Automation: A Reference Architecture and Web Feasibility Study"** for the **In Practice** track as an **Applied Research Report**, following the helpful guidance from the In-Practice editors (Daniel Méndez and Wesley Assunção) to foreground the practitioner context and lessons learned.

The article is an **experience report**, grounded in 18+ years of test-automation engineering. It describes an *agent harness*: a pattern that keeps three agent-augmented layers of test automation — framework authoring, a multi-agent SDLC pipeline over the Model Context Protocol, and a self-healing execution plane — separate but coupled through a shared, schema-defined observability substrate, so each layer can act on what the others observed. It reports a reproducible web feasibility study: an identity-oracle locator-healing benchmark on two complex public applications (Supabase Studio, Grafana) and two model families, a real Healenium baseline, an LLM-as-a-Judge visual-assertion service, and a paired cross-layer coupling A/B.

**Fit for In Practice.** The work is practitioner-driven. §1 opens with the recurring production failure modes that motivated it; §6.5 ("Limitations and what they mean for adoption") frames each limitation operationally; and §7.4 distills concrete lessons, take-aways, and a deployment checklist. The evaluation deliberately uses public applications rather than a proprietary system — to keep every result reproducible and to avoid leaking employer code or IP into a third-party model — so the contribution is a practitioner-derived architecture plus reproducible public feasibility evidence, not a named-company deployment report. The work uses only public infrastructure and is independent of my employer.

**Honesty of claims.** The coupling A/B is reported as a non-significant directional result (N=57, exact McNemar p≈0.23) whose behavioral benefit is explicitly unconfirmed; the healer's ~26% false-heal rate is foregrounded as the central operational risk (assisted triage, not unsupervised CI). These honest limits are the point, and I have kept them prominent.

**Artifacts.** All code, evaluation data, and audit packets are public (MIT-licensed) at https://github.com/SuneetMalhotra/agent-harness and archived at Zenodo under concept DOI 10.5281/zenodo.20576685; the submission corresponds to release tag `v1.5.2-jss-inpractice`, with a full reproducibility manifest (`ARTIFACTS.md`).

**Declarations.** This manuscript is original, has not been published previously, and is not under consideration at any other venue. I am the sole author. I have no competing interests. Generative-AI use (copy-editing and figure rendering; the same model family is also the evaluated object of study) is disclosed in a dedicated statement in the manuscript, consistent with Elsevier policy. Suggested reviewers are provided separately.

Thank you for considering the manuscript.

Sincerely,
Suneet Malhotra
Independent researcher in AI-augmented test automation
ORCID: 0009-0003-8707-9590
suneetmalhotra2002@gmail.com · https://suneetmalhotra.com · https://github.com/SuneetMalhotra
