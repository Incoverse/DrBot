import type { Response } from "express";

export interface TemplateResponse extends Response {
  template: (templatePath: string, variables?: Record<string, string>) => void;
}

declare module "express-serve-static-core" {
  interface Response {
    template: (templatePath: string, variables?: Record<string, string>) => void;
  }
}
