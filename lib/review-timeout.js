import "./tool-allowlist-DlzB5GlQ.js";
Object.freeze({
	mode: "subagentMode",
	provider: "subagentProvider",
	model: "subagentModel",
	reasoningEffort: "subagentReasoningEffort"
});
Object.freeze({
	provider: "searchProvider",
	model: "searchModel"
});
Object.freeze({
	provider: "imageProvider",
	model: "imageModel"
});
Object.freeze({
	provider: "autoReviewProvider",
	model: "autoReviewModel"
});
Object.freeze({
	enabled: "autoReviewSkipReadOnly",
	tools: "autoReviewAllowlist"
});
/** Upstream ceiling enforced by `@deepseek-ai/dsh-timeout` (MAX_TIMER_DELAY_MS). */
const UPSTREAM_MAX_IDLE_TIMEOUT_MS = 2147483647;
Object.freeze({
	provider: "compactProvider",
	model: "compactModel"
});
Object.freeze({
	provider: "titleProvider",
	model: "titleModel"
});
Object.freeze({
	provider: "memoryProvider",
	model: "memoryModel"
});
//#endregion
//#region lib/types/review-timeout.js
/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
const name = "model-switch-review-timeout";
/** This row needs the Host's settings service (for `documentPath` and our ns). */
const inject = ["settings", "modelSwitch"];
/** The pi-ai row whose provider profiles carry `streamIdleTimeoutMs`. */
const PI_AI_ROW = "llm-pi-ai";
/** Live state surfaced next to the reviewer card through the capabilities RPC. */
const reviewTimeoutStatus = {
	configuredMs: void 0,
	applied: [],
	skipped: []
};
/**
* Resolve the stored setting into concrete write values.
*
* Stored values are user intent: absent = follow the provider default, `0` =
* cancelled (written as the upstream ceiling), anything else is clamped into
* the upstream-legal range so a hand-edited profile cannot produce a rejected
* value.
*
* @param settings - the plugin's current settings.
* @returns the write value and the reviewer providers to apply it to.
*/
function planReviewTimeout(settings) {
	const raw = settings.autoReviewTimeoutMs;
	const timeoutMs = raw === void 0 ? void 0 : raw <= 0 ? UPSTREAM_MAX_IDLE_TIMEOUT_MS : Math.min(Math.floor(raw), UPSTREAM_MAX_IDLE_TIMEOUT_MS);
	const providers = /* @__PURE__ */ new Set();
	const add = (value) => {
		const trimmed = (value ?? "").trim();
		if (trimmed !== "") providers.add(trimmed);
	};
	add(settings.autoReviewProvider);
	for (const group of Object.values(settings.providerGroups ?? {})) add(group.autoReviewProvider);
	return {
		timeoutMs,
		providers: [...providers]
	};
}
/** Escape a provider id for use inside a regular expression. */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Set or remove one pi-ai provider's `streamIdleTimeoutMs` in the profile
* document, touching only that provider's block.
*
* The pi-ai row's layout is fixed by its schema: the provider sits at six
* spaces under `providers:`, its fields at eight. The patch inserts the key at
* the top of the provider block, replaces it in place, or removes it, and never
* touches another provider or row.
*
* @param text - the full profile document.
* @param provider - the pi-ai provider id.
* @param timeoutMs - the value to write, or undefined to remove the key.
* @returns the patched text and what happened.
*/
function patchProviderIdleTimeout(text, provider, timeoutMs) {
	const rows = text.split(/(?=^- id: )/m);
	const index = rows.findIndex((row) => new RegExp(`^- id: ${escapeRegExp(PI_AI_ROW)}\\r?$`, "m").test(row.split("\n", 1)[0] ?? ""));
	if (index < 0) return {
		text,
		outcome: "missing-row"
	};
	const row = rows[index];
	const match = new RegExp(`^( {6})(${escapeRegExp(provider)}):(\\r?)$`, "m").exec(row);
	if (match === null) return {
		text,
		outcome: "missing-provider"
	};
	const blockStart = match.index + match[0].length;
	const bodyRe = /\r?\n {0,6}\S/g;
	bodyRe.lastIndex = blockStart;
	const bodyEnd = bodyRe.exec(row)?.index ?? row.length;
	const block = row.slice(blockStart, bodyEnd);
	const idleRe = /^( {8})streamIdleTimeoutMs: *(\d+)(\r?)$/m;
	const idleMatch = idleRe.exec(block);
	if (timeoutMs !== void 0) {
		if (idleMatch !== null) {
			if (Number(idleMatch[2]) === timeoutMs) return {
				text,
				outcome: "unchanged"
			};
			const nextBlock = block.replace(idleRe, `${idleMatch[1]}streamIdleTimeoutMs: ${timeoutMs}${idleMatch[3]}`);
			rows[index] = row.slice(0, blockStart) + nextBlock + row.slice(bodyEnd);
			return {
				text: rows.join(""),
				outcome: "written"
			};
		}
		const nextBlock = `\n        streamIdleTimeoutMs: ${timeoutMs}${match[3] === "\r" ? "\r\n" : "\n"}${block.slice(1)}`;
		rows[index] = row.slice(0, blockStart) + nextBlock + row.slice(bodyEnd);
		return {
			text: rows.join(""),
			outcome: "written"
		};
	}
	if (idleMatch === null) return {
		text,
		outcome: "unchanged"
	};
	const removeRe = /^ {8}streamIdleTimeoutMs: *\d+\r?\n/m;
	const withoutLine = removeRe.test(block) ? block.replace(removeRe, "") : block.replace(idleRe, "");
	rows[index] = row.slice(0, blockStart) + withoutLine + row.slice(bodyEnd);
	return {
		text: rows.join(""),
		outcome: "written"
	};
}
/**
* Read a provider's current `streamIdleTimeoutMs` from the document.
*
* Used to record the pre-overwrite value so a later reset restores it.
*
* @param text - the full profile document.
* @param provider - the pi-ai provider id.
* @returns the value, or null when the key is absent.
*/
function readProviderIdleTimeout(text, provider) {
	const row = text.split(/(?=^- id: )/m).find((candidate) => candidate.startsWith(`- id: llm-pi-ai\n`) || candidate.startsWith(`- id: llm-pi-ai\r\n`));
	if (row === void 0) return null;
	const match = new RegExp(`^ {6}${escapeRegExp(provider)}:\\r?\\n((?: {8}.*\\r?\\n)*)`, "m").exec(row);
	if (match === null) return null;
	const idle = /^ {8}streamIdleTimeoutMs: *(\d+)/m.exec(match[1] ?? "");
	return idle === null ? null : Number(idle[1]);
}
/**
* Row entry point: apply the configured timeout to the reviewer providers'
* pi-ai profiles in the profile document.
*
* Every failure is contained and logged; a broken document must never take the
* Host down. The write is idempotent: replays find the value already in place
* and do nothing.
*
* @param ctx - this row's context.
*/
function apply(ctx) {
	const log = ctx.logger;
	const execute = async () => {
		reviewTimeoutStatus.configuredMs = void 0;
		reviewTimeoutStatus.applied = [];
		reviewTimeoutStatus.skipped = [];
		const settings = ctx.modelSwitch.currentSettings();
		const plan = planReviewTimeout(settings);
		reviewTimeoutStatus.configuredMs = settings.autoReviewTimeoutMs;
		if (plan.providers.length === 0) return;
		const forms = ctx.get("settings", true);
		const documentPath = forms?.documentPath;
		if (forms === void 0 || typeof documentPath !== "string" || documentPath === "") {
			reviewTimeoutStatus.skipped.push(...plan.providers);
			log.warn("model-switch: no profile document is reachable; the review timeout write is skipped");
			return;
		}
		try {
			const { readFile, writeFile } = await import("node:fs/promises");
			let text = await readFile(documentPath, "utf8");
			let changed = false;
			for (const provider of plan.providers) {
				const patched = patchProviderIdleTimeout(text, provider, plan.timeoutMs);
				if (patched.outcome === "written") {
					text = patched.text;
					changed = true;
				}
				if (patched.outcome === "written" || patched.outcome === "unchanged") reviewTimeoutStatus.applied.push(provider);
				else reviewTimeoutStatus.skipped.push(provider);
			}
			if (changed) await writeFile(documentPath, text, "utf8");
			log.info(`model-switch: review timeout ${plan.timeoutMs === void 0 ? "reset (provider defaults restored)" : `${plan.timeoutMs}ms`} applied to [${reviewTimeoutStatus.applied.join(", ")}]; skipped [${reviewTimeoutStatus.skipped.join(", ")}]; effective after restart`);
		} catch (cause) {
			log.warn(`model-switch: the review timeout write failed (${String(cause)})`);
		}
	};
	let pending;
	const run = () => {
		if (pending !== void 0) return pending;
		const next = execute().finally(() => {
			if (pending === next) pending = void 0;
		});
		pending = next;
		return next;
	};
	run();
	const lateSweep = setTimeout(() => {
		run();
	}, 1500);
	const offService = ctx.on("internal/service", (name) => {
		if (name === "settings") run();
	});
	ctx.effect(function* () {
		yield () => {
			offService();
			clearTimeout(lateSweep);
		};
		yield ctx.on("model-switch/settings-update", () => {
			run();
		});
	}, "model-switch: keep the review timeout write aligned with the settings");
}
//#endregion
export { PI_AI_ROW, apply, inject, name, patchProviderIdleTimeout, planReviewTimeout, readProviderIdleTimeout, reviewTimeoutStatus };
