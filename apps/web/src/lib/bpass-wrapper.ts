import fs from "fs";
import path from "path";
import vm from "vm";

function getPopupSrc() {
  const possiblePaths = [
    path.join(process.cwd(), "src/lib/popup.js"),
    path.join(process.cwd(), "apps/web/src/lib/popup.js"),
    path.join(__dirname, "popup.js"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8");
    }
  }

  throw new Error("popup.js not found in any expected paths: " + possiblePaths.join(", "));
}

function createSandbox() {
  const mockElements: Record<string, any> = {};

  const getOrCreate = (id: string) => {
    if (!mockElements[id]) {
      mockElements[id] = {
        value: "",
        checked: false,
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
        },
        innerHTML: "",
        innerText: "",
        textContent: "",
        options: [{ text: "Default" }],
        selectedIndex: 0,
        getAttribute: () => null,
        addEventListener: () => {},
      };
    }
    return mockElements[id];
  };

  const sandbox: any = {
    document: {
      getElementById: (id: string) => getOrCreate(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
    window: {
      addEventListener: () => {},
      clearTimeout: () => {},
      setTimeout: (fn: any) => fn(),
    },
    chrome: {
      storage: {
        local: {
          get: (_keys: any, cb: any) => cb && cb({}),
          set: (_obj: any, cb: any) => cb && cb(),
        },
      },
      tabs: { query: () => {} },
      scripting: { executeScript: () => {} },
    },
    navigator: {
      clipboard: { writeText: () => Promise.resolve() },
    },
    console: console,
    btoa: (s: string) => Buffer.from(s).toString("base64"),
    atob: (s: string) => Buffer.from(s, "base64").toString("utf8"),
    mockElements,
  };

  vm.createContext(sandbox);
  const src = getPopupSrc();
  vm.runInContext(src, sandbox);

  if (typeof sandbox.bindDOM === "function") {
    sandbox.bindDOM();
  }

  return sandbox;
}

export function generateProposalPrompt(args: any) {
  const sandbox = createSandbox();
  const setVal = (id: string, val: any) => {
    const el = sandbox.document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  };

  setVal("job-post", args.job || args.job_description || "");
  setVal("job-category", args.category || "fullstack");
  setVal("work-strategy", args.strategy || "phased");
  setVal("rate", args.rate || "$25/hr");
  setVal("time", args.time || args.timeframe || "2-4 hours");
  setVal("seniority-level", args.seniority || "staff");
  setVal("proposal-length", args.length || "full");
  setVal("dev-identity", args.devIdentity || args.dev_identity || "");
  setVal("pricing-model", args.pricingModel || args.pricing_model || "hourly");
  setVal("examples", args.examples || "");
  setVal("screening-questions", args.screening_questions || args.questions || "");
  if (args.client_profile) {
    setVal("client-profile", args.client_profile);
  }

  const autoGen = sandbox.document.getElementById("auto-generate-examples");
  if (autoGen) autoGen.checked = args.auto_gen_examples !== false;

  return sandbox.buildPrompt();
}

export function generateRepeatDeltaPrompt(args: any) {
  const effectiveRate = args.rate_override || args.rate || "$65/hr";
  const effectiveStrategy = args.strategy_override || args.strategy || "phased";
  const effectiveSeniority = args.seniority || "staff";
  const effectiveCategory = args.category || "fullstack";
  const effectiveDevIdentity = args.dev_identity || "";
  const effectivePricingModel = args.pricing_model || "hourly";
  const notes = args.notes || "";
  const newJob = args.new_job_description || args.job_description || args.job || "";

  const strategyLabel = effectiveStrategy === "phased" ? "Phased / Staged isolation first"
                      : effectiveStrategy === "fast" ? "Fast-Track Fix (MVP-first)"
                      : "Audit-First (diagnostics before changes)";

  let deltaPrompt = `NEW JOB — same chat context, updated job only.

[INHERITED SETTINGS]
- Seniority: ${effectiveSeniority}${effectiveDevIdentity ? ` (${effectiveDevIdentity})` : ""}
- Category: ${effectiveCategory}
- Strategy: ${strategyLabel}
- Rate: ${effectiveRate}
- Pricing: ${effectivePricingModel}${notes ? `\n- Additional context: ${notes}` : ""}

[NEW JOB DESCRIPTION]
${newJob}

Using the same proposal system prompt and persona from earlier in this chat, write a fresh proposal for this new job above. Apply the inherited settings unless the job context clearly requires a different approach. Do not repeat your role description — just write the proposal.`;

  if (args.rate_override || args.strategy_override) {
    deltaPrompt = `NEW JOB — same chat context. OVERRIDES applied: ${args.rate_override ? "rate → " + args.rate_override : ""}${args.rate_override && args.strategy_override ? ", " : ""}${args.strategy_override ? "strategy → " + strategyLabel : ""}.\n\n` + deltaPrompt.replace("NEW JOB — same chat context, updated job only.\n\n", "");
  }

  return deltaPrompt;
}

export function generateClientReplyPrompt(args: any) {
  const intent = args.intent || "scope_creep";
  const tone = args.tone || "senior";
  const clientMessage = args.client_message || args.message || "";

  let intentGuide = "";
  if (intent === "counter") {
    intentGuide = `Counter the client's lower offer without accepting and without burning the relationship. Acknowledge their budget, hold your floor by reframing what they get at your rate: staging clone, root-cause guarantee, zero production risk. If genuinely too low, offer a reduced Phase 1 scope that fits their budget with Phase 2 as a separate contract.`;
  } else if (intent === "nda") {
    intentGuide = `Professionally explain that you require a signed NDA before sharing your full technical assessment or proprietary diagnostic tools. Keep it standard and effortless for them — attach or link your standard mutual NDA template, state it protects both parties, and offer to proceed with discovery as soon as it's executed.`;
  } else if (intent === "scope_creep") {
    intentGuide = `Protect contract scope without sounding defensive. Validate that their new request is valuable and technically sound, then clearly categorize it as Phase 2. Offer to document requirements now so delivery of current Phase 1 isn't blocked.`;
  } else if (intent === "close") {
    intentGuide = `Close the contract cleanly and professionally. Reiterate that Phase 1 staging is ready for their final sign-off, summarize what was delivered, provide verification instructions, and warmly request completion and positive feedback.`;
  } else {
    intentGuide = `Respond with calm, pragmatic senior authority. Directly address the client's query, keep production risk quarantined, and ask a clear next-step question.`;
  }

  return `[CLIENT MESSAGE RECEIVED]
"${clientMessage}"

[REPLY GOAL & INTENT: ${intent.toUpperCase()}]
${intentGuide}

[TONE DIRECTIVE: ${tone.toUpperCase()}]
Write as a calm, pragmatic Staff/Principal software engineer. Direct, respectful, confident, zero fluff.

Draft the exact response to send to the client now.`;
}
