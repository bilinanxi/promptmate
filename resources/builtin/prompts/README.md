# Built-in prompt data

PromptMate ships project-owned seed entries plus normalized prompt concepts curated from local reference screenshots collected and organized by the user from public webpages.

提示词来源都是网络收集而来。

The `YouMind整理` slice contains short reusable concepts independently summarized from
[`YouMind-OpenLab/nano-banana-pro-prompts-recommend-skill`](https://github.com/YouMind-OpenLab/nano-banana-pro-prompts-recommend-skill)
at commit `95884907e1a59e275ec4c19991e520e546f69769`. Each record stores the upstream
category and numeric prompt ID in its description for traceability; full upstream prompts
and sample images are not copied into this repository.

## Screenshot curation slice

- The original screenshots and raw OCR output are not part of this repository.
- Every identifiable prompt concept from the screenshots is retained. Page chrome, usernames, source footers, and non-prompt UI are excluded; damaged OCR and model-specific syntax are normalized into readable bilingual concepts rather than treated as separate vocabulary.
- Exact and normalized duplicates are represented once, with corrected or alternate wording preserved through normalized labels and aliases where useful.
- Curated entries use `source: "builtin"`, `status: "approved"`, and the `截图整理` tag.
- The catalog is an inspiration reference rather than an image-generation service. Sensitive and adult-oriented vocabulary remains available and is assigned to the same semantic categories as other concepts instead of a dedicated R18 section.
- Empty descriptions and aliases are intentional: these fields are optional and were not fabricated when the screenshots supplied only bilingual names.

The source screenshots are reference material only and are not redistributed by PromptMate.
