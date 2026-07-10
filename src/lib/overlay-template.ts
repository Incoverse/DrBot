import type { NextFunction, Request, Response } from "express";

export type TemplateVarType = "string" | "number" | "boolean";
export type OverlayRouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface TemplateVarDefinition {
  type: TemplateVarType;
  required?: boolean;
  default?: string | number | boolean;
  label?: string;
}

export type TemplateVarSchema = Record<string, TemplateVarDefinition>;

export interface TemplateServerContext {
  /** Present for persistent overlays (renderTemplate), absent for transient (runTemplate). */
  instanceId?: string;
  /** ID assigned to the outermost element of the injected HTML block, if the template has one. */
  elementId?: string;
  /**
   * Register an HTTP route scoped to this overlay instance.
   * `"/hello"` → `GET /overlay/{overlayId}/hello`
   * Auto-deregistered when the template completes or is unrendered.
   * Put any Node.js-only imports *inside* the handler (dynamic import) so they are not sent to the browser.
   */
  registerRoute: (
    method: OverlayRouteMethod,
    subpath: string,
    handler: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  ) => void;
}

/** API available inside a template's client-side exec function. */
export interface TemplateAPI {
  playSound: (url: string, volume?: number) => Promise<void>;
  /** The overlay root container element. */
  root: HTMLElement;
  /** The outermost element of the template's HTML block, or null if no html export. */
  htmlRoot: HTMLElement | null;
  /** Resolves when the overlay is unrendered (persistent) or immediately (transient). Runs cleanup. */
  untilUnrendered: () => Promise<void>;
  onUpdate: (cb: (vars: Record<string, unknown>) => void) => void;
  onSpotifyUpdate: (cb: (state: unknown) => void) => void;
}

export interface RegisteredTemplate {
  id: string;
  variables: TemplateVarSchema;
  /** Absolute path to the main template file (index.ts for folder templates). */
  filePath: string;
  /** Absolute path to the template directory. Set for folder templates; undefined for single-file templates. */
  templateDir?: string;
  /** True if the template exports an `html` string block. */
  hasHtml: boolean;
  /** Server-side function to run before the template is dispatched to the browser. */
  serverFn?: (vars: Record<string, unknown>, context: TemplateServerContext) => Promise<void> | void;
}

const registry = new Map<string, RegisteredTemplate>();

export function registerTemplate(template: RegisteredTemplate): void {
  if (registry.has(template.id)) {
    console.warn(`[OVRL] Overlay template '${template.id}' already registered — overwriting.`);
  }
  registry.set(template.id, template);
}

export function getTemplate(id: string): RegisteredTemplate | undefined {
  return registry.get(id);
}

export function getAllTemplates(): RegisteredTemplate[] {
  return [...registry.values()];
}

export function resolveTemplateVars(
  template: RegisteredTemplate,
  vars: Record<string, unknown>,
): { vars: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const resolved: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(template.variables)) {
    if (key in vars) {
      const val = vars[key];
      if (typeof val !== def.type) {
        errors.push(`'${key}': expected ${def.type}, got ${typeof val}`);
      } else {
        resolved[key] = val;
      }
    } else if ("default" in def) {
      resolved[key] = def.default;
    } else if (def.required !== false) {
      errors.push(`'${key}': required but not provided`);
    }
  }

  return { vars: resolved, errors };
}
