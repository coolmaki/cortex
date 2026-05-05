import type { WebviewMessage } from "./messaging";

const ICONS = {
    back: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    forward: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    reload: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>`,
};

export function renderToolbar(
    canBack: boolean,
    canForward: boolean,
    post: (msg: WebviewMessage) => void,
    onBack: () => void,
    onForward: () => void,
): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    toolbar.append(
        btn(ICONS.back, "Back", !canBack, onBack),
        btn(ICONS.forward, "Forward", !canForward, onForward),
        btn(ICONS.reload, "Reload", false, () => post({ type: "reload" })),
        btn(ICONS.edit, "Edit Source", false, () => post({ type: "openSource" })),
    );

    return toolbar;
}

export function updateToolbarState(
    toolbarEl: HTMLElement,
    canBack: boolean,
    canForward: boolean,
): void {
    const buttons = toolbarEl.querySelectorAll<HTMLButtonElement>("button");
    if (buttons[0]) {
        buttons[0].disabled = !canBack;
    }
    if (buttons[1]) {
        buttons[1].disabled = !canForward;
    }
}

function btn(
    iconSvg: string,
    label: string,
    disabled: boolean,
    onClick: () => void,
): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "toolbar-btn";
    b.title = label;
    b.disabled = disabled;
    b.setAttribute("aria-label", label);
    b.innerHTML = iconSvg;
    b.addEventListener("click", onClick);
    return b;
}
