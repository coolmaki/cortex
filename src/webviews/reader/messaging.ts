export type ThemeKind = "light" | "dark" | "high-contrast" | "high-contrast-light";

export interface ReaderFrontmatter {
    title?: string;
    tags?: string[];
    type?: string;
    status?: string;
}

export type HostMessage =
    | {
          type: "init";
          mode: "normal";
          content: string;
          frontmatter: ReaderFrontmatter;
          baseUri: string;
          fileUri: string;
          relPath: string;
          themeKind: ThemeKind;
          anchor?: string;
      }
    | {
          type: "init";
          mode: "oversized";
          preview: string;
          sizeBytes: number;
          themeKind: ThemeKind;
      }
    | {
          type: "update";
          content: string;
          frontmatter: ReaderFrontmatter;
          baseUri: string;
          fileUri: string;
          relPath: string;
      }
    | {
          type: "navigateTo";
          content: string;
          frontmatter: ReaderFrontmatter;
          baseUri: string;
          fileUri: string;
          relPath: string;
          anchor?: string;
      }
    | { type: "themeChanged"; themeKind: ThemeKind };

export type WebviewMessage =
    | { type: "ready" }
    | { type: "openSource" }
    | { type: "linkClicked"; href: string }
    | { type: "currentDocChanged"; fileUri: string }
    | { type: "reload" }
    | { type: "forceRender" };
