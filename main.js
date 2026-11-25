"use strict";

const obsidian = require("obsidian");
const { ItemView, Notice, Plugin, PluginSettingTab, Setting } = obsidian;

const ratingTypes = [
    { key: "impact", label: "Impact" },
    { key: "criticality", label: "Criticality" },
    { key: "effort", label: "Effort" },
];
const rankOptions = [["", "None"], ["1", "1 · Highest"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · Lowest"]];
const noteAssignmentTypes = {
    configuration: { property: "goal-configuration", storage: "noteConfigurations", label: "Configuration", fallback: "Vault default", title: "Set Note Goal Configuration" },
    dashboard: { property: "goal-dashboard", storage: "noteDashboards", label: "Dashboard", fallback: "Use folder default", title: "Set Note Goals Dashboard" },
};
const linkCaptions = { docs: "Documentation", jira: "Work Item", repo: "Repository" };
const dependencyField = { key: "dependencies", label: "Dependencies", multiline: true };

const factoryPreferences = {
    ratings: { impact: false, criticality: false, effort: false },
    priorities: [
        { name: "Critical", background: "#fee2e2", foreground: "#b91c1c" },
        { name: "High", background: "#ffedd5", foreground: "#c2410c" },
        { name: "Medium", background: "#fef9c3", foreground: "#a16207" },
        { name: "Low", background: "#dcfce7", foreground: "#15803d" },
        { name: "Optional", background: "#e2e8f0", foreground: "#475569" },
    ],
    linkLabels: { docs: "Design Notes", jira: "Jira Epic", repo: "GitHub Repository" },
    completeStatuses: ["Complete", "Completed", "Done"],
    statuses: ["Proposed", "Planned", "In Progress", "Blocked", "On Hold", "Complete", "Cancelled"],
    priority: "3",
    status: "Proposed",
    owner: "Unassigned",
    quarterMode: "current",
    fixedQuarter: "",
    headings: ["Problem", "Proposal", "Context", "What This Solves", "Concerns", "Comments from Team Members"],
    decisionHeading: "Decision Log",
    reviewHeading: "Review Checklist",
    reviewItems: [
        "Confirm scope and success criteria.",
        "Review risks, dependencies, and stakeholder feedback.",
        "Confirm priority, owner, target quarter, and status.",
        "Verify documentation, work item, and repository links.",
        "Record decisions and follow-up actions.",
    ],
};

function currentQuarter() {
    const date = new Date();
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function normalizePreferences(data = {}) {
    const defaults = factoryPreferences;
    const text = (value, fallback) => typeof value === "string" && clean(value) ? clean(value) : fallback;
    const hex = (value, fallback) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    const list = (value, fallback) => Array.isArray(value) && value.length && value.every(item => typeof item === "string" && clean(item))
        ? value.map(clean) : [...fallback];
    const fixedQuarter = typeof data.fixedQuarter === "string" && /^Q[1-4] \d{4}$/.test(data.fixedQuarter)
        ? data.fixedQuarter : "";
    const statuses = [...new Set(list(data.statuses, defaults.statuses))];
    const palette = (colors, baseColors) => baseColors.map((base, i) => ({
        foreground: hex(colors?.[i]?.foreground, base.foreground),
        background: hex(colors?.[i]?.background, base.background),
    }));
    const priorityColors = palette(data.priorities, defaults.priorities);
    return {
        ratings: Object.fromEntries(ratingTypes.map(({ key }) => [key, data.ratings?.[key] === true])),
        ratingPalettes: Object.fromEntries(ratingTypes.map(({ key }) =>
            [key, palette(data.ratingPalettes?.[key], priorityColors)])),
        completeStatuses: list(data.completeStatuses, defaults.completeStatuses),
        priorities: priorityColors.map((colors, i) => ({
            ...colors, name: text(data.priorities?.[i]?.name, defaults.priorities[i].name),
        })),
        linkLabels: Object.fromEntries(Object.entries(defaults.linkLabels).map(([key, label]) =>
            [key, text(data.linkLabels?.[key], label)])),
        statuses,
        priority: /^[1-5]$/.test(data.priority) ? String(data.priority) : defaults.priority,
        status: statuses.includes(data.status) ? data.status : statuses[0],
        owner: text(data.owner, defaults.owner),
        quarterMode: data.quarterMode === "tbd" || (data.quarterMode === "fixed" && fixedQuarter) ? data.quarterMode : "current",
        fixedQuarter,
        headings: list(data.headings, defaults.headings),
        decisionHeading: text(data.decisionHeading, defaults.decisionHeading),
        reviewHeading: text(data.reviewHeading, defaults.reviewHeading),
        reviewItems: list(data.reviewItems, defaults.reviewItems),
    };
}

function buildProfile(preferences, id = "") {
    const priorityLabel = value => `P${value} · ${preferences.priorities[Number(value) - 1].name}`;
    const fields = [
        { key: "priority", label: "Priority", options: preferences.priorities.map((_, i) => [String(i + 1), priorityLabel(i + 1)]) },
        { key: "quarter", label: "Target quarter" },
        { key: "owner", label: "Owner" },
        { key: "status", label: "Status", options: preferences.statuses.map(value => [value, value]) },
        ...Object.entries(preferences.linkLabels).map(([key, linkLabel]) => ({
            key, label: linkCaptions[key], linkLabel, link: true,
        })),
        dependencyField,
    ];
    const quarter = { tbd: "TBD", fixed: preferences.fixedQuarter }[preferences.quarterMode] ?? currentQuarter();
    const defaults = { priority: preferences.priority, quarter, owner: preferences.owner, status: preferences.status,
        docs: "", jira: "", repo: "", dependencies: "" };
    const ratings = ratingTypes.map(field => ({ ...field, options: rankOptions }));
    return { ...preferences, id, fields, defaults, priorityLabel, ratingFields: ratings,
        linkFields: fields.filter(field => field.link) };
}

function metadataFields(profile, values = {}) {
    return [...profile.fields, ...profile.ratingFields.filter(({ key }) => profile.ratings[key] || values[key])];
}

const escapeCodes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const unescapeCodes = Object.fromEntries(Object.entries(escapeCodes).map(([key, value]) => [value, key]));
const escapeHtml = value => value.replace(/[&<>"']/g, char => escapeCodes[char]);
const decodeHtml = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => unescapeCodes[entity]);
const clean = value => value.trim().replace(/[\r\n]+/g, " ");
const icon = name => `<span class="goal-icon goal-icon-${name}" aria-hidden="true"></span>`;

function webUrl(value) {
    try {
        const url = new URL(value);
        if (/^https?:\/\//i.test(value) && ["https:", "http:"].includes(url.protocol) &&
            !url.username && !url.password && !/\s/.test(value)) return url.href;
    } catch {
        // The caller reports the affected field.
    }
    return null;
}

function dependencyParts(value) {
    const sep = value.indexOf("#");
    return [value.slice(0, sep), value.slice(sep + 1)];
}

function normalizeDependencies(value) {
    const entries = (value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return [...new Set(entries.map(entry => {
        const value = entry.startsWith("[[") && entry.endsWith("]]") ? entry.slice(2, -2) : entry;
        const [path, heading] = dependencyParts(value).map(part => part.trim());
        if (!value.includes("#") || !heading.trim() || heading.trimStart().startsWith("^") ||
            /^[\/\\]/.test(path) || /[:|<>\\\[\]]/.test(path) || /[|<>\[\]]/.test(heading)) {
            throw new Error("Enter one goal reference per line, such as [[Planning/Note#Goal heading]].");
        }
        return path.trim() + "#" + heading.trim();
    }))].join("\n");
}

function normalize(values, { fields, defaults }) {
    const meta = { ...values };
    for (const field of fields) {
        const { key, label, link } = field;
        if (field.multiline) {
            meta[key] = normalizeDependencies(values[key]);
        } else if (link) {
            const urls = (values[key] || "").split(/\r?\n/).map(url => url.trim()).filter(Boolean);
            const valid = urls.map(webUrl);
            if (valid.includes(null)) throw new Error(`${label} needs an HTTP or HTTPS URL on each line.`);
            meta[key] = [...new Set(valid)].join("\n");
        } else {
            meta[key] = clean(values[key] || "") || defaults[key];
        }
    }
    if (!/^[1-5]$/.test(meta.priority)) throw new Error("Priority must be P1 through P5.");
    for (const { key } of ratingTypes) {
        meta[key] ??= "";
        if (!/^[1-5]?$/.test(meta[key])) throw new Error("Rankings must be 1 through 5.");
    }
    meta.quarter = meta.quarter.toUpperCase();
    if (!/^(?:Q[1-4] \d{4}|TBD)$/.test(meta.quarter)) throw new Error("Enter a four-digit year, or select TBD.");
    return meta;
}

function renderStrip(values, profile) {
    const { linkFields, priorityLabel } = profile;
    const meta = normalize(values, profile);
    const items = [["calendar", meta.quarter], ["user", meta.owner], ["status", meta.status]];
    const links = linkFields.flatMap(({ key, linkLabel }) => {
        const urls = meta[key] ? meta[key].split("\n") : [];
        return urls.map((url, i) =>
            `    <a href="${escapeHtml(url)}">${icon(key)}${escapeHtml(linkLabel)}${i ? " " + (i + 1) : ""}</a>`);
    });
    const dependencies = meta.dependencies ? meta.dependencies.split("\n").map(target =>
        `    <a class="internal-link goal-dependency" data-href="${escapeHtml(target)}" href="${escapeHtml(target)}">${escapeHtml(dependencyParts(target)[1])}</a>`) : [];
    const dashboardAttr = meta.dashboard ? ` data-goal-dashboard="${escapeHtml(meta.dashboard)}"` : "";
    const profileAttr = profile.id ? ` data-goal-profile="${escapeHtml(profile.id)}"` : "";
    const badges = ratingTypes.filter(({ key }) => meta[key]).map(({ key, label }) =>
        `    <span class="goal-priority" data-priority="${meta[key]}" data-goal-rating="${key}">${label} · ${meta[key]}</span>`);
    return [
        `<div class="goal-meta"${dashboardAttr}${profileAttr}>`,
        '  <div class="goal-meta-row">',
        `    <span class="goal-priority" data-priority="${meta.priority}">${escapeHtml(priorityLabel(meta.priority))}</span>`,
        ...items.flatMap(([name, value], i) => [
            ...(i ? ['    <span class="goal-meta-separator" aria-hidden="true">·</span>'] : []),
            `    <span class="goal-meta-item">${icon(name)}${escapeHtml(value)}</span>`,
        ]),
        ...badges,
        "  </div>",
        ...(links.length ? ['  <div class="goal-meta-row goal-meta-links">', ...links, "  </div>"] : []),
        ...(dependencies.length ? ['  <div class="goal-meta-row goal-meta-links"><span>Depends on</span>', ...dependencies, "  </div>"] : []),
        "</div>",
    ].join("\n");
}

function parseStrip(html, profile) {
    // The original preview used the same classes without aria-hidden.
    const priority = html.match(/class="goal-priority"\s+data-priority="([1-5])"\s*>/);
    if (!priority) throw new Error("The metadata strip has an unrecognized priority.");
    const assigned = html.match(/^<div class="goal-meta"[^>]*?\sdata-goal-dashboard="([^"]*)"/);
    const meta = { docs: "", jira: "", repo: "", priority: priority[1], dashboard: assigned ? decodeHtml(assigned[1]) : "" };
    for (const match of html.matchAll(/<span class="goal-priority" data-priority="([1-5])" data-goal-rating="(impact|criticality|effort)">/g)) {
        meta[match[2]] = match[1];
    }
    for (const [key, name] of [["quarter", "calendar"], ["owner", "user"], ["status", "status"]]) {
        const item = html.match(new RegExp(`class="goal-icon goal-icon-${name}"[^>]*></span>([^<]*)</span>`));
        if (!item) throw new Error(`The metadata strip has an unrecognized ${key} field.`);
        meta[key] = decodeHtml(item[1].trim());
    }
    const anchors = [...html.matchAll(/<a\s+href="([^"]+)"[^>]*>\s*<span class="goal-icon goal-icon-(docs|jira|repo)"[^>]*><\/span>[^<]*<\/a>/g)];
    for (const match of anchors) {
        const [, url, key] = match;
        // Unfilled URL placeholders from the preview carry no link.
        if (/^(?:DOCUMENTATION|JIRA|REPOSITORY)_URL$/.test(url)) continue;
        meta[key] = [meta[key], decodeHtml(url)].filter(Boolean).join("\n");
    }
    const dependencies = [...html.matchAll(/<a class="internal-link goal-dependency" data-href="([^"]+)" href="[^"]+">[^<]*<\/a>/g)];
    meta.dependencies = dependencies.map(match => decodeHtml(match[1])).join("\n");
    const parsedAnchors = anchors.length + dependencies.length;
    if ((html.match(/<a\b/g) || []).length !== parsedAnchors) {
        throw new Error("The metadata strip contains an unsupported link format.");
    }
    return normalize(meta, profile);
}

function readHeadings(source) {
    const result = [];
    let offset = 0;
    let fence = null;
    let comment = false;
    let frontmatter = /^\uFEFF?---\s*(?:\r?\n|$)/.test(source);
    for (const line of source.split(/(?<=\n)/)) {
        const start = offset;
        offset += line.length;
        const text = line.replace(/\r?\n$/, "");
        if (frontmatter) {
            if (start && /^(?:---|\.\.\.)[ \t]*$/.test(text)) frontmatter = false;
            continue;
        }
        if (fence) {
            if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \t]*$`).test(text)) fence = null;
            continue;
        }
        if (comment) {
            if (text.includes("-->")) comment = false;
            continue;
        }
        if (text.trimStart().startsWith("<!--")) {
            comment = !text.includes("-->");
            continue;
        }
        const opening = text.match(/^ {0,3}(`{3,}|~{3,})/);
        if (opening) {
            fence = opening[1];
            continue;
        }
        const heading = text.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
        if (heading) {
            const title = heading[2].replace(/[ \t]+#+$/, "").trim();
            result.push({ title, level: heading[1].length, start, body: offset });
        }
    }
    for (let i = 0; i < result.length; i++) {
        const next = result.slice(i + 1).find(heading => heading.level <= result[i].level);
        result[i].end = next?.start ?? source.length;
    }
    return result;
}

function stripRange(source, heading) {
    const body = source.slice(heading.body, heading.end);
    const open = body.match(/^\s*(<div class="goal-meta"[^>]*>)/);
    if (!open) return null;
    const start = heading.body + open[0].indexOf("<");
    let depth = 0;
    for (const tag of source.slice(start, heading.end).matchAll(/<\/?div\b[^>]*>/g)) {
        depth += tag[0].startsWith("</") ? -1 : 1;
        if (depth === 0) return { start, end: start + tag.index + tag[0].length };
    }
    throw new Error("The goal metadata strip has an unclosed HTML block.");
}

function goalHeadings(source, all, profile) {
    const goalSections = new Set(["problem", "proposal", "proposed solution",
        ...profile.headings.slice(0, 2).map(heading => heading.toLowerCase())]);
    return all.filter(heading => /^\s*<div class="goal-meta"/.test(source.slice(heading.body, heading.end)) ||
        all.some(child => child.start >= heading.body && child.start < heading.end &&
            child.level === heading.level + 1 && goalSections.has(child.title.toLowerCase())));
}

function findGoal(source, cursor, all, profile) {
    const goals = goalHeadings(source, all, profile);
    const inSection = heading => heading.start <= cursor && (cursor < heading.end || heading.end === source.length);
    const goal = goals.findLast(inSection);
    if (goal) return goal;
    // In notes without a goal structure, a top-level heading can start a goal.
    if (!goals.length) return all.findLast(heading => heading.level === 1 && inSection(heading));
    return undefined;
}

function appendBlock(source, offset, block, newline) {
    const before = source.slice(0, offset);
    const after = source.slice(offset);
    const prefix = before && !/\n[ \t]*\r?\n$/.test(before)
        ? (before.endsWith("\n") ? newline : newline.repeat(2)) : "";
    return prefix + block + newline + (after ? newline : "");
}

function insertStrip(source, goal, html, newline) {
    const following = source.slice(goal.body);
    const emptyLines = following.match(/^(?:[ \t]*\r?\n)*/)[0];
    const start = goal.body + emptyLines.length;
    const prefix = emptyLines ? "" : (goal.body === source.length && !source.endsWith("\n") ? newline.repeat(2) : newline);
    return { start, end: start, text: prefix + html + newline + (start < source.length ? newline : "") };
}

function node(parent, tag, text, className) {
    const element = parent.ownerDocument.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
}

function makeControl(parent, field, value) {
    const label = node(parent, "label", undefined, "goal-tool-field");
    node(label, "span", field.link ? field.label + " URLs" : field.label);
    let control;
    if (field.options) {
        control = node(label, "select");
        const options = [...field.options];
        if (value && !options.some(([id]) => id === value)) options.push([value, value]);
        for (const [id, name] of options) node(control, "option", name).value = id;
    } else if (field.link || field.multiline) {
        control = node(label, "textarea");
        control.rows = 2;
        control.placeholder = field.link ? "Optional · one URL per line" : "Optional · one [[Note#Goal]] per line";
    } else {
        control = node(label, "input");
        control.type = "text";
    }
    control.value = value ?? "";
    control.required = field.required ?? false;
    return control;
}

function makeQuarterControl(parent, field, value) {
    const group = node(parent, "div", undefined, "goal-tool-quarter");
    const [quarter, year] = value.split(" ");
    const options = ["Q1", "Q2", "Q3", "Q4", "TBD"].map(option => [option, option]);
    const select = makeControl(group, { ...field, options }, quarter);
    const yearInput = makeControl(group, { label: "Year" }, year ?? currentQuarter().split(" ")[1]);
    yearInput.inputMode = "numeric";
    const updateYear = () => { yearInput.disabled = select.value === "TBD"; };
    select.addEventListener("input", updateYear);
    updateYear();
    return () => select.value === "TBD" ? "TBD" : `${select.value} ${yearInput.value.trim()}`;
}

function controlsFor(parent, selected, initial) {
    const controls = selected.map(field => {
        if (field.key === "quarter" && !field.options) {
            return [field.key, makeQuarterControl(parent, field, initial[field.key])];
        }
        const control = makeControl(parent, field, initial[field.key]);
        return [field.key, () => control.value];
    });
    return () => Object.fromEntries(controls.map(([key, getValue]) => [key, getValue()]));
}

function errorMessage(parent) {
    const element = node(parent, "p", "", "goal-tool-message");
    element.setAttribute("role", "status");
    return element;
}

function folderDashboard(path, dashboards) {
    return dashboards.reduce((best, dashboard) => {
        if (!dashboard.folder || !path.startsWith(dashboard.folder + "/")) return best;
        return !best || dashboard.folder.length > best.folder.length ? dashboard : best;
    }, null);
}

function dashboardParent(dashboard, dashboards) {
    return dashboard.parent === "auto"
        ? folderDashboard(dashboard.folder, dashboards)?.id ?? ""
        : dashboard.parent;
}

function dashboardIncludes(id, ancestor, dashboards) {
    const visited = new Set();
    while (id && !visited.has(id)) {
        if (id === ancestor) return true;
        visited.add(id);
        const dashboard = dashboards.find(item => item.id === id);
        id = dashboard ? dashboardParent(dashboard, dashboards) : "";
    }
    return false;
}

function dashboardChoice(label, empty, dashboards) {
    return { key: "dashboard", label, options: [["", empty], ...dashboards.map(item => [item.id, item.name])] };
}

function resolveDependencies(rows, app) {
    const indexed = new Map();
    for (const row of rows) {
        const key = row.file.path + "#" + row.heading.title.toLowerCase();
        const matches = indexed.get(key) ?? [];
        matches.push(row);
        indexed.set(key, matches);
    }
    for (const row of rows) {
        row.dependencies = row.meta.dependencies ? row.meta.dependencies.split("\n").map(target => {
            const [path, heading] = dependencyParts(target);
            const file = path ? app.metadataCache.getFirstLinkpathDest(path, row.file.path) : row.file;
            const matches = file ? indexed.get(file.path + "#" + heading.toLowerCase()) : null;
            const goal = matches?.length === 1 ? matches[0] : null;
            const complete = goal?.rowProfile.completeStatuses.some(status => status.toLowerCase() === goal.meta.status.toLowerCase());
            return { target, heading, state: !goal ? "Unresolved" : complete && goal !== row ? "Complete" : "Pending" };
        }) : [];
        row.blocked = /^blocked$/i.test(row.meta.status) || row.dependencies.some(dependency => dependency.state !== "Complete");
    }
}

function dashboardLink(parent, label, target, source, app) {
    const link = node(parent, "a", label, "internal-link");
    link.href = target;
    link.dataset.href = target;
    link.addEventListener("click", event => {
        event.preventDefault();
        void app.workspace.openLinkText(target, source, event.metaKey || event.ctrlKey)
            .catch(error => new Notice(error.message));
    });
    return link;
}

async function dashboard({ app, container, dashboards, selection, profile, profiles, noteDashboardFor }) {
    const { fields, ratingFields } = profile;
    const tool = node(container, "div", undefined, "goal-tool");
    const message = errorMessage(tool);
    message.textContent = "Reading goal metadata…";
    const rows = [];
    let skipped = 0;
    await Promise.all(app.vault.getMarkdownFiles().map(async file => {
        let source;
        try {
            source = await app.vault.cachedRead(file);
        } catch {
            skipped++;
            return;
        }
        if (!source.includes('<div class="goal-meta"')) return;
        const noteDashboard = noteDashboardFor(file);
        const inherited = dashboards.some(item => item.id === noteDashboard)
            ? noteDashboard
            : folderDashboard(file.path, dashboards)?.id ?? "";
        for (const heading of readHeadings(source)) {
            try {
                const range = stripRange(source, heading);
                if (!range) continue;
                const html = source.slice(range.start, range.end);
                const storedProfile = html.match(/^<div class="goal-meta"[^>]*?\sdata-goal-profile="([^"]*)"/)?.[1];
                const rowProfile = profiles.get(storedProfile) ?? profile;
                const meta = parseStrip(html, rowProfile);
                const assigned = dashboards.some(item => item.id === meta.dashboard) ? meta.dashboard : inherited;
                rows.push({ file, heading, meta, assigned, rowProfile });
            } catch {
                skipped++;
            }
        }
    }));
    resolveDependencies(rows, app);
    rows.sort((a, b) => a.meta.priority.localeCompare(b.meta.priority) ||
        a.heading.title.localeCompare(b.heading.title) || a.file.path.localeCompare(b.file.path));
    const filters = node(tool, "div", undefined, "goal-tool-fields");
    const scope = makeControl(filters, dashboardChoice("Dashboard", "All goals", dashboards), selection.id);
    const showDependencies = rows.some(row => row.dependencies.length);
    const ratingsInUse = ratingFields.filter(({ key }) => selection.filters?.[key] || rows.some(row => row.meta[key]));
    const keys = ["priority", "quarter", "owner", "status", ...ratingsInUse.map(({ key }) => key)];
    const getFilters = controlsFor(filters, keys.map(key => {
        const field = [...fields, ...ratingFields].find(item => item.key === key);
        const options = [...new Set(rows.map(row => row.meta[key]).filter(Boolean))].sort()
            .map(value => [value, key === "priority" && profiles.size ? `P${value}`
                : field.options?.find(option => option[0] === value)?.[1] ?? value]);
        return { ...field, options: [["", "All"], ...options] };
    }), selection.filters ?? {});
    const blockage = makeControl(filters, { label: "Blocked", options: [["", "All"], ["yes", "Blocked"], ["no", "Not blocked"]] },
        selection.filters?.blocked ?? "");
    const results = node(tool, "div", undefined, "goal-tool-results");
    function update() {
        const selected = getFilters();
        selection.id = scope.value;
        selection.filters = { ...selection.filters, ...selected, blocked: blockage.value };
        const scoped = scope.value ? rows.filter(row => dashboardIncludes(row.assigned, scope.value, dashboards)) : rows;
        const visible = scoped.filter(({ meta, blocked }) =>
            (!blockage.value || blocked === (blockage.value === "yes")) &&
            keys.every(key => !selected[key] || selected[key] === meta[key]));
        message.textContent = `${visible.length} of ${scoped.length} goals` +
            (skipped ? ` · ${skipped} unreadable notes or strips skipped` : "");
        results.replaceChildren();
        if (!visible.length) {
            node(results, "p", scoped.length ? "No goals match these filters." : "No goals in this dashboard.");
            return;
        }
        const table = node(results, "table", undefined, "goal-dashboard");
        const header = node(node(table, "thead"), "tr");
        for (const label of ["Goal", "Priority", "Quarter", "Owner", "Status", ...ratingsInUse.map(({ label }) => label), ...(showDependencies ? ["Dependencies"] : []), "Links"]) {
            node(header, "th", label).scope = "col";
        }
        const body = node(table, "tbody");
        for (const { file, heading, meta, rowProfile, dependencies } of visible) {
            const row = node(body, "tr");
            dashboardLink(node(row, "td"), heading.title, file.path + "#" + heading.title, "", app);
            if (rowProfile.id) row.setAttribute("data-goal-profile", rowProfile.id);
            const badge = node(node(row, "td"), "span", rowProfile.priorityLabel(meta.priority), "goal-priority");
            badge.dataset.priority = meta.priority;
            for (const key of ["quarter", "owner", "status"]) node(row, "td", meta[key]);
            for (const { key } of ratingsInUse) {
                const cell = node(row, "td");
                if (meta[key]) {
                    const rating = node(cell, "span", meta[key], "goal-priority");
                    rating.dataset.priority = meta[key];
                    rating.setAttribute("data-goal-rating", key);
                }
            }
            if (showDependencies) {
                const cell = node(row, "td");
                for (const dependency of dependencies) {
                    const line = node(cell, "div");
                    if (dependency.state === "Unresolved") node(line, "span", dependency.heading);
                    else dashboardLink(line, dependency.heading, dependency.target, file.path, app);
                    node(line, "span", " · " + dependency.state, "goal-tool-message");
                }
            }
            const links = node(row, "td");
            for (const { key, linkLabel } of rowProfile.linkFields) {
                if (!meta[key]) continue;
                meta[key].split("\n").forEach((url, index) => {
                    if (links.childNodes.length) links.append(" · ");
                    const external = node(links, "a", linkLabel + (index ? " " + (index + 1) : ""), "external-link");
                    external.href = url;
                    external.target = "_blank";
                    external.rel = "noopener noreferrer";
                });
            }
        }
    }
    filters.addEventListener("change", update);
    update();
}

function promptFields({ app, obsidian: { Modal } }, title, selected, initial, validate) {
    return new Promise(resolve => {
        class GoalModal extends Modal {
            onOpen() {
                this.setTitle(title);
                const form = node(this.contentEl, "form", undefined, "goal-tool");
                const grid = node(form, "div", undefined, "goal-tool-fields");
                const getValues = controlsFor(grid, selected, initial);
                const message = errorMessage(form);
                const actions = node(form, "div", undefined, "modal-button-container");
                const cancel = node(actions, "button", "Cancel");
                cancel.type = "button";
                cancel.addEventListener("click", () => this.close());
                node(actions, "button", "Save", "mod-cta").type = "submit";
                form.addEventListener("submit", event => {
                    event.preventDefault();
                    try {
                        this.result = validate(getValues());
                        this.close();
                    } catch (error) {
                        message.textContent = error.message;
                    }
                });
                grid.querySelector("input, textarea, select")?.focus();
            }

            onClose() {
                this.contentEl.replaceChildren();
                resolve(this.result);
            }
        }
        new GoalModal(app).open();
    });
}

function localDate() {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map(value => String(value).padStart(2, "0")).join("-");
}

function childSection(all, goal, title, source, marker) {
    return all.find(heading => heading.start >= goal.body && heading.start < goal.end &&
        heading.level === goal.level + 1 && (heading.title.toLowerCase() === title.toLowerCase() ||
            source?.slice(heading.body, heading.end).trimStart().startsWith(marker)));
}

function sectionEdit(source, offset, lines, newline) {
    return { start: offset, end: offset, text: appendBlock(source, offset, lines.join(newline), newline) };
}

function applyEdit({ app, obsidian: { MarkdownView } }, view, snapshot, edit) {
    const current = app.workspace.getActiveViewOfType(MarkdownView);
    if (current !== view || current.file?.path !== snapshot.path || current.editor.getValue() !== snapshot.source) {
        throw new Error("The active note changed while the command was open. Run it again in the goal note.");
    }
    if (snapshot.source.slice(edit.start, edit.end) === edit.text) return false;
    const { editor } = view;
    editor.replaceRange(edit.text, editor.offsetToPos(edit.start), editor.offsetToPos(edit.end));
    return true;
}

const commands = {
    insert: "Insert Goal Metadata",
    edit: "Edit Goal Metadata",
    newGoal: "Insert New Goal",
    priority: "Update Goal Priority",
    status: "Update Goal Status",
    quarter: "Update Goal Quarter",
    owner: "Update Goal Owner",
    docs: "Add Goal Documentation Link",
    jira: "Add Goal Work Item Link",
    repo: "Add Goal Repository Link",
    decision: "Add Goal Decision Log",
    review: "Add Goal Review Checklist",
    move: "Set Goal Dashboard",
    dashboard: "Generate Goals Dashboard",
};

async function getEdit(params, action, snapshot) {
    const { source, cursor } = snapshot;
    const { profile } = params;
    const { defaults, headings, reviewItems, decisionHeading, reviewHeading } = profile;
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const all = readHeadings(source);
    const goal = findGoal(source, cursor, all, profile);
    const title = commands[action];
    if (action === "newGoal") {
        const selected = [{ key: "title", label: "Goal title", required: true }, ...metadataFields(profile)];
        const values = await promptFields(params, title, selected, defaults, form => {
            const heading = clean(form.title).replace(/[ \t]+#+$/, "");
            if (!heading) throw new Error("Enter a goal title.");
            return { ...normalize(form, profile), title: heading };
        });
        if (!values) return null;
        const level = Math.min(goal?.level ?? goalHeadings(source, all, profile)[0]?.level ?? 1, 5);
        return sectionEdit(source, goal?.end ?? source.length, [
            "#".repeat(level) + " " + values.title, "", renderStrip(values, profile).replace(/\n/g, newline),
            ...headings.flatMap(name => ["", "#".repeat(level + 1) + " " + name]),
        ], newline);
    }
    if (!goal) throw new Error("Place the cursor in a goal section, or run Insert New Goal.");
    if (action === "decision" || action === "review") {
        if (goal.level === 6) throw new Error("Use a goal heading from level 1 to 5 to add subsections.");
        const name = action === "decision" ? decisionHeading : reviewHeading;
        const previousName = action === "decision" ? factoryPreferences.decisionHeading : factoryPreferences.reviewHeading;
        const marker = `<!-- goal-metadata:${action} -->`;
        const existing = childSection(all, goal, name, source, marker) || childSection(all, goal, previousName);
        const header = ["#".repeat(goal.level + 1) + " " + name, "", ...(name === previousName ? [] : [marker, ""])];
        if (action === "review") {
            if (existing) throw new Error("This goal already has a review checklist.");
            return sectionEdit(source, goal.end, [...header, ...reviewItems.map(item => "- [ ] " + item)], newline);
        }
        const values = await promptFields(params, title, [
            { key: "decision", label: "Decision", required: true },
            { key: "rationale", label: "Rationale" },
            { key: "followUp", label: "Follow-up" },
        ], {}, form => {
            if (!clean(form.decision)) throw new Error("Enter a decision.");
            return form;
        });
        if (!values) return null;
        const lines = [`- ${localDate()} — ${clean(values.decision)}`];
        for (const [key, label] of [["rationale", "Rationale"], ["followUp", "Follow-up"]]) {
            if (clean(values[key])) lines.push(`  - **${label}:** ${clean(values[key])}`);
        }
        if (existing) {
            const body = source.slice(existing.body, existing.end);
            const firstChild = all.find(heading => heading.start >= existing.body && heading.start < existing.end);
            const offset = firstChild?.start ?? existing.end;
            if (body.trim()) return sectionEdit(source, offset, lines, newline);
            return sectionEdit(source, existing.end, lines, newline);
        }
        return sectionEdit(source, goal.end, [...header, ...lines], newline);
    }
    const range = stripRange(source, goal);
    if (action === "insert" && range) throw new Error("This goal already has metadata. Run Edit Goal Metadata.");
    if (action !== "insert" && !range) throw new Error("This goal has no metadata. Run Insert Goal Metadata first.");
    const current = range ? parseStrip(source.slice(range.start, range.end), profile) : defaults;
    if (action === "move") {
        const options = [dashboardChoice("Dashboard", "Inherit from note or folder", params.getDashboards())];
        const values = await promptFields(params, title, options, current, form => form);
        if (!values || values.dashboard === current.dashboard) return null;
        return { ...range, text: renderStrip({ ...current, ...values }, profile).replace(/\n/g, newline) };
    }
    const fields = metadataFields(profile, current);
    const selected = ["insert", "edit"].includes(action) ? fields : fields.filter(field => field.key === action);
    const addingLink = selected.length === 1 && selected[0].link;
    const initial = addingLink ? { ...current, [action]: "" } : current;
    const updated = await promptFields(params, title, selected, initial, form => {
        if (addingLink) {
            if (!form[action].trim()) throw new Error("Enter at least one URL.");
            form[action] = [current[action], form[action]].filter(Boolean).join("\n");
        }
        return normalize({ ...current, ...form }, profile);
    });
    if (!updated) return null;
    const html = renderStrip(updated, profile).replace(/\n/g, newline);
    return range ? { ...range, text: html } : insertStrip(source, goal, html, newline);
}

async function runCommand(params, action) {
    const { app, obsidian: { MarkdownView, Notice } } = params;
    try {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.getMode() !== "source") throw new Error("Open the goal note in Editing view first.");
        const { editor } = view;
        const snapshot = {
            path: view.file.path,
            source: editor.getValue(),
            cursor: editor.posToOffset(editor.getCursor()),
        };
        const edit = await getEdit({ ...params, profile: params.profileFor(view.file) }, action, snapshot);
        if (edit && applyEdit(params, view, snapshot, edit)) new Notice("Goal updated.");
    } catch (error) {
        new Notice(error.message, 5500);
    }
}

const dashboardViewType = "goal-metadata-dashboard";

class GoalDashboardView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.selection = { id: "" };
    }

    getViewType() { return dashboardViewType; }
    getDisplayText() { return "Goals Dashboard"; }
    getIcon() { return "layout-dashboard"; }

    async onOpen() {
        const content = node(this.contentEl, "div", undefined, "goal-metadata-view");
        node(content, "h2", this.getDisplayText());
        const actions = node(content, "div", undefined, "goal-metadata-dashboard-actions");
        const manage = node(actions, "button", "Manage dashboards");
        manage.type = "button";
        const refresh = node(actions, "button", "Refresh");
        refresh.type = "button";
        const save = node(actions, "button", "Save view");
        save.type = "button";
        const viewPicker = node(content, "div", undefined, "goal-dashboard-saved-views");
        const body = node(content, "div", undefined, "goal-metadata-dashboard-body");
        let picker;
        const update = async () => {
            if (refresh.disabled) return;
            refresh.disabled = true;
            save.disabled = true;
            if (picker) picker.disabled = true;
            body.replaceChildren();
            try {
                await dashboard({
                    app: this.plugin.app,
                    container: body,
                    dashboards: this.plugin.dashboards,
                    selection: this.selection,
                    profile: this.plugin.profile,
                    profiles: this.plugin.savedProfiles(),
                    noteDashboardFor: file => this.plugin.noteAssignment(file, "dashboard"),
                });
            } catch (error) {
                body.replaceChildren();
                errorMessage(body).textContent = error.message;
            } finally {
                refresh.disabled = false;
                save.disabled = false;
                if (picker) picker.disabled = false;
            }
        };
        const showPicker = () => {
            viewPicker.replaceChildren();
            const views = this.plugin.dashboardViews;
            picker = makeControl(viewPicker, { label: "Saved view", options: [
                ["", "Custom"], ...views.map(view => [view.id, view.name]),
            ] }, this.savedViewId);
            picker.addEventListener("change", () => {
                if (refresh.disabled) return;
                this.savedViewId = picker.value;
                const view = views.find(view => view.id === this.savedViewId);
                this.selection = view ? { id: view.dashboard, filters: { ...view.filters } } : { id: "" };
                void update();
            });
        };
        showPicker();
        this.registerDomEvent(save, "click", async () => {
            const result = await this.plugin.saveDashboardView({ id: this.selection.id, filters: { ...this.selection.filters } }, this.savedViewId);
            if (!result) return;
            this.savedViewId = result;
            showPicker();
        });
        this.registerDomEvent(refresh, "click", () => void update());
        this.registerDomEvent(manage, "click", () => this.plugin.manageDashboards().then(changed => {
            if (changed) void update();
        }));
        void update();
    }
}

function watchAssignmentProperties(doc) {
    const selector = ".metadata-container";
    const className = "goal-metadata-properties-only";
    const assignmentKeys = Object.values(noteAssignmentTypes).map(({ property }) => property);
    const update = container => {
        const properties = [...container.querySelectorAll(".metadata-property")];
        const onlyAssignments = properties.length > 0 &&
            properties.every(row => assignmentKeys.includes(row.getAttribute("data-property-key")));
        container.classList.toggle(className, onlyAssignments);
    };

    doc.body.querySelectorAll(selector).forEach(update);
    const observer = new doc.defaultView.MutationObserver(records => {
        const containers = new Set();
        for (const { target, addedNodes } of records) {
            const container = target.closest(selector);
            if (container) containers.add(container);
            for (const node of addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches(selector)) containers.add(node);
                node.querySelectorAll(selector).forEach(element => containers.add(element));
            }
        }
        containers.forEach(update);
    });
    observer.observe(doc.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["data-property-key"],
    });

    return () => {
        observer.disconnect();
        doc.body.querySelectorAll("." + className).forEach(container => container.classList.remove(className));
    };
}

class GoalMetadataPlugin extends Plugin {
    async onload() {
        const data = await this.loadData();
        this.data = data ?? {};
        this.styles = new Map();
        this.assignmentPropertyWatchers = new Map();
        const workspace = this.app.workspace;
        this.attachStyles(workspace.containerEl.ownerDocument);
        workspace.iterateAllLeaves(leaf => this.attachStyles(leaf.containerEl.ownerDocument));
        this.registerEvent(workspace.on("window-open", (_, win) => this.attachStyles(win.document)));
        this.registerEvent(workspace.on("window-close", (_, win) => {
            this.styles.get(win.document)?.remove();
            this.styles.delete(win.document);
            this.assignmentPropertyWatchers.get(win.document)?.();
            this.assignmentPropertyWatchers.delete(win.document);
        }));
        this.register(() => {
            for (const style of this.styles.values()) style.remove();
            this.styles.clear();
            for (const stop of this.assignmentPropertyWatchers.values()) stop();
            this.assignmentPropertyWatchers.clear();
        });
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) =>
            this.remapNoteAssignments(oldPath, file.path)));
        this.registerEvent(this.app.vault.on("delete", file =>
            this.remapNoteAssignments(file.path, null)));
        this.addSettingTab(new GoalMetadataSettings(this.app, this));
        this.registerView(dashboardViewType, leaf => new GoalDashboardView(leaf, this));
        workspace.onLayoutReady(() => workspace.detachLeavesOfType("goal-metadata-generator"));

        for (const [action, name] of Object.entries(commands)) {
            if (action === "dashboard") continue;
            this.addCommand({
                id: action === "newGoal" ? "new-goal" : action,
                name,
                callback: () => runCommand({ app: this.app, obsidian, profileFor: file => this.profileFor(file), getDashboards: () => this.dashboards }, action),
            });
        }

        this.addCommand({ id: "manage-dashboards", name: "Manage Goals Dashboards", callback: () => this.manageDashboards() });
        this.addCommand({ id: "note-configuration", name: "Set Note Goal Configuration", callback: () => this.setNoteAssignment("configuration") });
        this.addCommand({ id: "note-dashboard", name: "Set Note Goals Dashboard", callback: () => this.setNoteAssignment("dashboard") });
        this.addCommand({ id: "dashboard", name: commands.dashboard, callback: () => this.openDashboard() });
    }

    get dashboards() { return Array.isArray(this.data.dashboards) ? this.data.dashboards : []; }

    get dashboardViews() {
        return Array.isArray(this.data.dashboardViews) ? this.data.dashboardViews : [];
    }

    async saveDashboardView(selection, selectedId) {
        if (this.savingDashboardView) return "";
        this.savingDashboardView = true;
        const initial = this.dashboardViews.find(view => view.id === selectedId)?.name ?? "";
        try {
            const result = await promptFields({ app: this.app, obsidian }, "Save Dashboard View",
                [{ key: "name", label: "View name (use the same name to update)", required: true }], { name: initial }, form => {
                    const name = clean(form.name);
                    if (!name) throw new Error("Enter a view name.");
                    return name;
                });
            if (!result) return "";
            const views = this.dashboardViews;
            const existing = views.find(view => view.name.toLowerCase() === result.toLowerCase());
            const id = existing?.id ?? "view-" + globalThis.crypto.getRandomValues(new Uint32Array(4)).join("-");
            const entry = { id, name: result, dashboard: selection.id, filters: { ...selection.filters } };
            const dashboardViews = existing ? views.map(view => view.id === id ? entry : view) : [...views, entry];
            await this.saveConfiguration({ dashboardViews });
            new Notice("Dashboard view saved.");
            return id;
        } catch (error) {
            new Notice(error.message, 5500);
            return "";
        } finally {
            this.savingDashboardView = false;
        }
    }

    get preferences() { return normalizePreferences(this.data.preferences ?? {}); }

    get profile() { return buildProfile(this.preferences); }

    get configurations() {
        return Array.isArray(this.data.configurations) ? this.data.configurations.filter(item =>
            item && /^config-[0-9]+(?:-[0-9]+){3}$/.test(item.id) && typeof item.name === "string") : [];
    }

    configurationOptions() {
        return [["", "Vault default"], ...this.configurations.map(item => [item.id, item.name])];
    }

    savedProfiles() {
        return new Map(this.configurations.map(item => [item.id, buildProfile(normalizePreferences(item.preferences ?? {}), item.id)]));
    }

    profileById(id) {
        return this.savedProfiles().get(id) ?? this.profile;
    }

    noteAssignmentItems(type) {
        return type === "configuration" ? this.configurations : this.dashboards;
    }

    noteAssignment(file, type) {
        const { property, storage } = noteAssignmentTypes[type];
        const entries = this.data[storage] ?? {};
        const items = this.noteAssignmentItems(type);
        if (Object.hasOwn(entries, file.path)) return items.find(item => item.id === entries[file.path])?.id ?? "";
        const stored = this.app.metadataCache.getFileCache(file)?.frontmatter?.[property];
        if (typeof stored !== "string") return "";
        return items.find(item => item.id === stored)?.id ??
            items.find(item => item.name.toLowerCase() === stored.trim().toLowerCase())?.id ?? "";
    }

    profileFor(file) {
        return file ? this.profileById(this.noteAssignment(file, "configuration")) : this.profile;
    }

    remapNoteAssignments(oldPath, newPath) {
        const matches = path => path === oldPath || path.startsWith(oldPath + "/");
        return this.saveConfiguration(data => {
            const patch = {};
            for (const { storage } of Object.values(noteAssignmentTypes)) {
                const assignments = Object.entries(data[storage] ?? {});
                if (!assignments.some(([path]) => matches(path))) continue;
                const remapped = Object.fromEntries(assignments.filter(([path]) => !matches(path)));
                if (newPath !== null) {
                    for (const [path, id] of assignments) {
                        if (matches(path)) remapped[newPath + path.slice(oldPath.length)] = id;
                    }
                }
                patch[storage] = remapped;
            }
            return Object.keys(patch).length ? patch : null;
        }).catch(error => {
            new Notice("Could not update note assignment paths. " + error.message, 5500);
        });
    }

    saveProfile(id, name, preferences) {
        if (!id && !name) return this.saveConfiguration({ preferences }).then(() => "");
        if (!name) throw new Error("Enter a configuration name.");
        if (name.toLowerCase() === "vault default") throw new Error("Vault default is a reserved name.");
        if (this.configurations.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
            throw new Error("A configuration already uses this name.");
        }
        const configId = id || "config-" + globalThis.crypto.getRandomValues(new Uint32Array(4)).join("-");
        const entry = { id: configId, name, preferences };
        const configurations = id ? this.configurations.map(item => item.id === id ? entry : item)
            : [...this.configurations, entry];
        return this.saveConfiguration({ configurations }).then(() => configId);
    }

    async profileUsage(id) {
        const files = this.app.vault.getMarkdownFiles();
        const assigned = files.filter(file => this.noteAssignment(file, "configuration") === id).map(file => file.path);
        let unreadable = 0;
        const marked = await Promise.all(files.map(async file => {
            try {
                const source = await this.app.vault.cachedRead(file);
                const marker = `data-goal-profile="${id}"`;
                if (!source.includes(marker)) return null;
                for (const heading of readHeadings(source)) {
                    const block = source.slice(heading.body, heading.end).trimStart();
                    if (block.startsWith('<div class="goal-meta"') && block.slice(0, block.indexOf(">")).includes(marker)) {
                        return file.path;
                    }
                }
            } catch {
                unreadable++;
            }
            return null;
        }));
        return { assigned, styled: marked.filter(Boolean), unreadable };
    }

    deleteProfile(id) {
        return this.saveConfiguration(data => {
            if (!id || !this.configurations.some(item => item.id === id)) throw new Error("Select a saved configuration to delete.");
            const noteConfigurations = { ...data.noteConfigurations };
            for (const [path, assigned] of Object.entries(noteConfigurations)) {
                if (assigned === id) noteConfigurations[path] = "";
            }
            for (const file of this.app.vault.getMarkdownFiles()) {
                if (this.noteAssignment(file, "configuration") === id) noteConfigurations[file.path] = "";
            }
            return { configurations: this.configurations.filter(item => item.id !== id), noteConfigurations };
        });
    }

    async setNoteAssignment(type) {
        const file = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.file;
        if (!file) {
            new Notice("Open the note you want to assign.");
            return;
        }
        const { property, storage, label, fallback, title } = noteAssignmentTypes[type];
        try {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
            const storedProperty = Object.hasOwn(frontmatter, property);
            const items = this.noteAssignmentItems(type);
            const inherited = type === "dashboard" ? folderDashboard(file.path, items)?.name : undefined;
            const defaultLabel = inherited ? `${fallback} (${inherited})` : fallback;
            const fields = [
                { key: "assignment", label, options: [["", defaultLabel], ...items.map(item => [item.id, item.name])] },
                { key: "visibility", label: "Note property", options: [["settings", "Plugin settings only"], ["name", "Show name in note properties"]] },
            ];
            const result = await promptFields({ app: this.app, obsidian }, title, fields, {
                assignment: this.noteAssignment(file, type),
                visibility: storedProperty ? "name" : "settings",
            }, form => form);
            if (!result) return;
            const item = items.find(item => item.id === result.assignment);
            const shownName = item && result.visibility === "name" ? item.name : undefined;
            const changeProperty = shownName !== undefined ? frontmatter[property] !== shownName : storedProperty;
            let changed = false;
            await this.saveConfiguration(data => {
                const assignments = { ...data[storage] };
                const path = file.path;
                if (this.app.vault.getAbstractFileByPath(path) !== file) throw new Error("The note is no longer in this vault.");
                const previous = Object.hasOwn(assignments, path) ? assignments[path] : undefined;
                // An explicit default takes precedence if updating legacy frontmatter fails.
                const assigned = item?.id ?? (storedProperty ? "" : undefined);
                if (previous === assigned) return null;
                if (assigned === undefined) delete assignments[path];
                else assignments[path] = assigned;
                changed = true;
                return { [storage]: assignments };
            });
            if (changeProperty) {
                try {
                    await this.app.fileManager.processFrontMatter(file, data => {
                        if (shownName !== undefined) data[property] = shownName;
                        else delete data[property];
                    });
                } catch (error) {
                    new Notice("Assignment saved in plugin settings. The note property could not be updated. " + error.message, 5500);
                    return;
                }
            }
            if (changed || changeProperty) new Notice(`Note ${label.toLowerCase()} updated.`);
        } catch (error) {
            new Notice(error.message, 5500);
        }
    }

    saveConfiguration(change) {
        this.pendingSave = (this.pendingSave ?? Promise.resolve()).catch(() => {}).then(async () => {
            const patch = typeof change === "function" ? change(this.data) : change;
            if (!patch) return;
            const updated = { ...this.data, ...patch };
            await this.saveData(updated);
            this.data = updated;
            if (patch.preferences || patch.configurations) this.updateStyles();
        });
        return this.pendingSave;
    }

    attachStyles(doc) {
        if (this.styles.has(doc)) return;
        this.styles.set(doc, node(doc.head, "style"));
        this.assignmentPropertyWatchers.set(doc, watchAssignmentProperties(doc));
        this.updateStyles();
    }

    updateStyles() {
        const rules = [this.profile, ...this.savedProfiles().values()].map(profile => {
            const properties = profile.priorities.flatMap(({ background, foreground }, i) => [
                `--goal-priority-${i + 1}-background: ${background};`,
                `--goal-priority-${i + 1}-foreground: ${foreground};`,
            ]);
            const selector = profile.id ? `[data-goal-profile="${profile.id}"]` : ":root";
            const ratingRules = ratingTypes.flatMap(({ key }) => profile.ratingPalettes[key].map(({ background, foreground }, i) =>
                `${selector} .goal-priority[data-goal-rating="${key}"][data-priority="${i + 1}"] {
                    --goal-rating-background: ${background}; --goal-rating-foreground: ${foreground};
                }`));
            return [`${selector} { ${properties.join(" ")} }`, ...ratingRules].join("\n");
        });
        for (const style of this.styles.values()) style.textContent = rules.join("\n");
    }

    async manageDashboards() {
        if (this.managingDashboards) return false;
        this.managingDashboards = true;
        const params = { app: this.app, obsidian };
        try {
            const selection = await promptFields(params, "Manage Goals Dashboards",
                [dashboardChoice("Dashboard", "Create a dashboard", this.dashboards)], {}, form => form);
            if (!selection) return false;
            const existing = this.dashboards.find(item => item.id === selection.dashboard);
            const fields = [
                { key: "name", label: "Dashboard name", required: true },
                { key: "folder", label: "Vault folder (optional)" },
                { key: "parent", label: "Parent dashboard", options: [
                    ["auto", "Automatic (from folder)"],
                    ["", "No parent"],
                    ...this.dashboards.filter(item => item.id !== existing?.id).map(item => [item.id, item.name]),
                ] },
            ];
            const id = existing?.id ?? "dashboard-" + globalThis.crypto.getRandomValues(new Uint32Array(4)).join("-");
            const updated = await promptFields(params, existing ? "Edit Goals Dashboard" : "New Goals Dashboard",
                fields, existing ?? { parent: "auto" }, form => {
                    const name = clean(form.name);
                    if (!name) throw new Error("Enter a dashboard name.");
                    if (this.dashboards.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
                        throw new Error("A dashboard already uses this name.");
                    }
                    const folder = form.folder.trim().split("/").filter(Boolean).join("/");
                    if (folder.includes("\\") || folder.split("/").some(part => part === "." || part === "..")) {
                        throw new Error("Use a vault-relative folder path, such as 2027 Planning/Q1.");
                    }
                    if (folder && this.dashboards.some(item => item.id !== id && item.folder === folder)) {
                        throw new Error("A dashboard already uses this folder.");
                    }
                    const replacement = { id, name, folder, parent: form.parent };
                    const dashboards = existing
                        ? this.dashboards.map(item => item.id === id ? replacement : item)
                        : [...this.dashboards, replacement];
                    if (dashboards.some(item => dashboardIncludes(dashboardParent(item, dashboards), item.id, dashboards))) {
                        throw new Error("Choose a parent that does not create a dashboard loop.");
                    }
                    return dashboards;
                });
            if (!updated) return false;
            await this.saveConfiguration({ dashboards: updated });
            new Notice("Dashboard saved.");
            return true;
        } catch (error) {
            new Notice(error.message, 5500);
            return false;
        } finally {
            this.managingDashboards = false;
        }
    }

    async openDashboard() {
        const { workspace } = this.app;
        try {
            let [leaf] = workspace.getLeavesOfType(dashboardViewType);
            if (!leaf) {
                leaf = workspace.getLeaf("tab");
                await leaf.setViewState({ type: dashboardViewType, active: true });
            }
            await workspace.revealLeaf(leaf);
        } catch (error) {
            new Notice(error.message, 5500);
        }
    }
}

function profileDifferences(current, fallback) {
    const differences = [];
    const add = (label, before, after) => {
        if (before !== after) differences.push({ label, before, after });
    };
    const quarter = preferences => ({
        current: `Current quarter (${currentQuarter()})`, fixed: preferences.fixedQuarter, tbd: "TBD",
    })[preferences.quarterMode];
    const palette = ({ background, foreground }) => `background ${background}, text ${foreground}`;
    add("Default owner", current.owner, fallback.owner);
    add("Default status", current.status, fallback.status);
    add("Default priority", buildProfile(current).priorityLabel(current.priority), buildProfile(fallback).priorityLabel(fallback.priority));
    add("Default target quarter", quarter(current), quarter(fallback));
    for (const { key, label } of ratingTypes) {
        add(`${label} field`, current.ratings[key] ? "Available" : "Hidden", fallback.ratings[key] ? "Available" : "Hidden");
        current.ratingPalettes[key].forEach((colors, i) =>
            add(`${label} rank ${i + 1} colors`, palette(colors), palette(fallback.ratingPalettes[key][i])));
    }
    current.priorities.forEach((priority, i) => {
        add(`P${i + 1} name`, priority.name, fallback.priorities[i].name);
        add(`P${i + 1} colors`, palette(priority), palette(fallback.priorities[i]));
    });
    for (const [key, label] of Object.entries(linkCaptions)) {
        add(`${label} link text`, current.linkLabels[key], fallback.linkLabels[key]);
    }
    const items = values => values.join(", ");
    add("Available statuses", items(current.statuses), items(fallback.statuses));
    add("Statuses that satisfy dependencies", items(current.completeStatuses), items(fallback.completeStatuses));
    add("Goal section headings", items(current.headings), items(fallback.headings));
    add("Decision log heading", current.decisionHeading, fallback.decisionHeading);
    add("Review checklist heading", current.reviewHeading, fallback.reviewHeading);
    add("Review checklist items", items(current.reviewItems), items(fallback.reviewItems));
    return differences;
}

class GoalMetadataSettings extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.selectedConfiguration = "";
        this.drafts = new Map();
    }

    display() {
        this.openConfiguration(this.selectedConfiguration);
    }

    openConfiguration(id) {
        this.selectedConfiguration = id;
        const saved = this.plugin.configurations.find(item => item.id === id);
        const draft = this.drafts.get(id) ?? {
            name: saved?.name ?? "",
            preferences: saved ? normalizePreferences(saved.preferences) : this.plugin.preferences,
        };
        this.drafts.set(id, draft);
        this.show(draft);
    }

    show(draftEntry) {
        const draft = draftEntry.preferences;
        const { containerEl } = this;
        containerEl.replaceChildren();
        const setting = (name, description) => {
            const row = new Setting(containerEl).setName(name);
            if (description) row.setDesc(description);
            return row;
        };
        const heading = title => setting(title).setHeading();
        const text = (name, key, description) => setting(name, description).addText(input =>
            input.setValue(draft[key]).onChange(value => { draft[key] = value; }));
        const lines = (name, key) => setting(name, "One item per line.").addTextArea(input => {
            input.inputEl.rows = 5;
            input.setValue(draft[key].join("\n")).onChange(value => {
                draft[key] = value.split(/\r?\n/).map(clean).filter(Boolean);
            });
        });

        setting("Configuration").addDropdown(input => {
            for (const [value, name] of this.plugin.configurationOptions()) input.addOption(value, name);
            input.setValue(this.selectedConfiguration).onChange(value => this.openConfiguration(value));
        });
        setting("Configuration name", "Enter a name to save a reusable configuration.").addText(input =>
            input.setValue(draftEntry.name).onChange(value => { draftEntry.name = value; }));

        if (this.selectedConfiguration) {
            const id = this.selectedConfiguration;
            const savedName = this.plugin.configurations.find(item => item.id === id)?.name;
            if (savedName) {
                const remove = setting("Delete configuration", "Review how this configuration is used before deleting it.");
                const preview = node(containerEl, "div", undefined, "goal-configuration-delete-preview");
                remove.addButton(button => button.setButtonText("Delete configuration").setWarning().onClick(async () => {
                    if (this.saving) return;
                    button.setDisabled(true);
                    remove.setDesc("Checking which notes use this configuration…");
                    try {
                        const usage = await this.plugin.profileUsage(id);
                        if (this.selectedConfiguration !== id || !preview.isConnected) return;
                        const saved = this.plugin.configurations.find(item => item.id === id);
                        if (!saved) throw new Error("This configuration was already removed.");
                        const differences = profileDifferences(normalizePreferences(saved.preferences), this.plugin.preferences);
                        this.renderDeletePreview(preview, savedName, usage, differences);
                        remove.setDesc("Review these effects before confirming deletion.");
                        remove.clear();
                        remove.addButton(cancel => cancel.setButtonText("Cancel").onClick(() => this.show(draftEntry)));
                        remove.addButton(confirm => confirm.setButtonText("Confirm deletion").setWarning().onClick(async () => {
                            if (this.saving) return;
                            this.saving = true;
                            confirm.setDisabled(true);
                            try {
                                await this.plugin.deleteProfile(id);
                                this.drafts.delete(id);
                                if (this.selectedConfiguration === id) this.openConfiguration("");
                                new Notice("Goal Metadata configuration deleted.");
                            } catch (error) {
                                confirm.setDisabled(false);
                                new Notice(error.message, 5500);
                            } finally {
                                this.saving = false;
                            }
                        }));
                    } catch (error) {
                        button.setDisabled(false);
                        remove.setDesc(error.message);
                    }
                }));
            }
        }

        const colorControls = (row, swatch, label) => {
            for (const [key, part] of [["background", "background"], ["foreground", "text color"]]) {
                row.addColorPicker(input => input.setValue(swatch[key]).onChange(value => {
                    swatch[key] = value;
                }));
                [...row.controlEl.querySelectorAll('input[type="color"]')].at(-1)
                    ?.setAttribute("aria-label", label + " " + part);
            }
        };

        heading("Priorities");
        for (const [i, priority] of draft.priorities.entries()) {
            const row = setting(`P${i + 1}`, "Name, badge background, and badge text color.");
            row.addText(input => {
                input.inputEl.setAttribute("aria-label", `P${i + 1} name`);
                input.setValue(priority.name).onChange(value => { priority.name = value; });
            });
            colorControls(row, priority, `P${i + 1}`);
        }

        heading("Optional rankings");
        for (const { key, label } of ratingTypes) {
            const group = node(containerEl, "div", undefined, "goal-rating-settings");
            const toggle = new Setting(group).setName(label).setDesc("Rank 1 is highest.");
            const palette = node(group, "div", undefined, "goal-rating-palette");
            const contents = node(palette, "div", undefined, "goal-rating-palette-content");
            const setExpanded = enabled => {
                palette.classList.toggle("is-open", enabled);
                palette.inert = !enabled;
            };
            for (const [i, swatch] of draft.ratingPalettes[key].entries()) {
                const rank = `Rank ${i + 1}`;
                const row = new Setting(contents).setName(rank).setDesc("Badge background and text color.");
                colorControls(row, swatch, label + " " + rank);
            }
            toggle.addToggle(input => input.setValue(draft.ratings[key]).onChange(value => {
                draft.ratings[key] = value;
                setExpanded(value);
            }));
            setExpanded(draft.ratings[key]);
        }

        heading("Link labels");
        for (const [key, label] of Object.entries(linkCaptions)) {
            setting(label + " link text").addText(input => input.setValue(draft.linkLabels[key]).onChange(value => {
                draft.linkLabels[key] = value;
            }));
        }

        heading("New goal defaults");
        setting("Default priority").addDropdown(input => {
            draft.priorities.forEach((_, i) => input.addOption(String(i + 1), `P${i + 1}`));
            input.setValue(draft.priority).onChange(value => { draft.priority = value; });
        });
        text("Default owner", "owner");
        lines("Available statuses", "statuses");
        text("Default status", "status", "Enter one of the available statuses.");
        lines("Statuses that satisfy dependencies", "completeStatuses");
        setting("Default target quarter").addDropdown(input => input
            .addOption("current", "Current quarter and year")
            .addOption("tbd", "TBD")
            .addOption("fixed", "Fixed quarter and year")
            .setValue(draft.quarterMode).onChange(value => {
                draft.quarterMode = value;
                fixed.settingEl.style.display = value === "fixed" ? "" : "none";
            }));
        const fixed = text("Fixed quarter", "fixedQuarter", "For example, Q4 2027.");
        fixed.settingEl.style.display = draft.quarterMode === "fixed" ? "" : "none";

        heading("Goal template");
        lines("Section headings", "headings");
        text("Decision log heading", "decisionHeading");
        text("Review checklist heading", "reviewHeading");
        lines("Review checklist items", "reviewItems");

        const actions = setting("Save preferences", "To update labels and colors on a strip after switching configurations, save it with Edit Goal Metadata.");
        const save = async copy => {
            if (this.saving) return;
            const previous = this.selectedConfiguration;
            try {
                this.saving = true;
                const preferences = this.validate(draft);
                const name = clean(draftEntry.name);
                if (copy && !name) throw new Error("Enter a configuration name.");
                const id = await this.plugin.saveProfile(copy ? "" : previous, copy || previous ? name : "", preferences);
                this.drafts.delete(id);
                if (id === previous) this.drafts.delete(previous);
                new Notice("Goal Metadata configuration saved.");
                if (this.selectedConfiguration === previous) this.openConfiguration(id);
            } catch (error) {
                new Notice(error.message, 5500);
            } finally {
                this.saving = false;
            }
        };
        actions.addButton(button => button.setButtonText("Reset to defaults").onClick(() => {
            draftEntry.preferences = normalizePreferences();
            this.show(draftEntry);
            new Notice("Defaults loaded. Save changes to apply them.");
        }));
        actions.addButton(button => button.setButtonText("Save as new configuration").onClick(() => save(true)));
        actions.addButton(button => button.setButtonText("Save changes").setCta().onClick(() => save(false)));
    }

    renderDeletePreview(container, name, usage, differences) {
        const used = [...new Set([...usage.assigned, ...usage.styled])].sort();
        const summary = used.length ? `“${name}” is used in ${used.length} ${used.length === 1 ? "note" : "notes"}.`
            : `No use of “${name}” was found in the scanned notes.`;
        node(container, "strong", summary);
        if (used.length) {
            const names = node(container, "ul");
            for (const path of used.slice(0, 8)) node(names, "li", path);
            if (used.length > 8) node(names, "li", `And ${used.length - 8} more`);
        }
        if (usage.assigned.length) node(container, "p",
            `Assigned notes (${usage.assigned.length}) will use the vault default for new and edited goals.`);
        if (usage.styled.length) node(container, "p",
            `Existing strips in ${usage.styled.length} ${usage.styled.length === 1 ? "note will" : "notes will"} use the vault palette. Saved goal text and ratings stay in the notes.`);
        if (usage.unreadable) node(container, "p", `Could not scan ${usage.unreadable} ${usage.unreadable === 1 ? "note" : "notes"} for existing strips.`);
        if (!differences.length) {
            node(container, "p", "The saved settings already match the vault default.");
            return;
        }
        node(container, "strong", "Changes when using the vault default");
        const list = node(container, "ul");
        for (const { label, before, after } of differences) {
            const item = node(list, "li");
            node(item, "strong", label);
            node(item, "div", `${before} → ${after}`);
        }
    }

    validate(draft) {
        if (draft.priorities.some(priority => !clean(priority.name))) throw new Error("Name all five priorities.");
        if (Object.values(draft.linkLabels).some(label => !clean(label))) throw new Error("Enter all three link labels.");
        if (!draft.statuses.includes(clean(draft.status))) throw new Error("Choose a default status from the available statuses.");
        if (!clean(draft.owner)) throw new Error("Enter a default owner, such as Unassigned.");
        const fixedQuarter = draft.fixedQuarter.trim().toUpperCase();
        if (draft.quarterMode === "fixed" && !/^Q[1-4] \d{4}$/.test(fixedQuarter)) {
            throw new Error("Enter a fixed quarter such as Q4 2027.");
        }
        const headings = [...draft.headings, clean(draft.decisionHeading), clean(draft.reviewHeading)];
        if (!draft.headings.length || headings.some(title => !title || /^#|\s#+$/.test(title))) {
            throw new Error("Enter section headings without Markdown heading markers.");
        }
        if (new Set(headings.map(title => title.toLowerCase())).size !== headings.length) {
            throw new Error("Use distinct section headings.");
        }
        if (!draft.completeStatuses.length) throw new Error("Enter at least one status that satisfies dependencies.");
        if (!draft.reviewItems.length) throw new Error("Enter at least one review checklist item.");
        return normalizePreferences({ ...draft, fixedQuarter });
    }
}

module.exports = GoalMetadataPlugin;
