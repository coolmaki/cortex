declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState<T>(): T | undefined;
    setState<T>(state: T): T;
};

const vscode = acquireVsCodeApi();
const content = document.getElementById("content")!;

document.getElementById("edit-source")!.addEventListener("click", () => {
    vscode.postMessage({ type: "openSource" });
});

window.addEventListener("message", (event: MessageEvent<{ type: string; content?: string }>) => {
    const msg = event.data;
    if (msg.type === "init" || msg.type === "update") {
        content.textContent = msg.content ?? "";
    }
});

vscode.postMessage({ type: "ready" });
